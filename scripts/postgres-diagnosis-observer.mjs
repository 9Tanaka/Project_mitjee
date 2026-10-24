import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

const tables = ["Scenario", "ScenarioTemplateVersion", "TrainingSession", "TrainingAction", "SessionOpportunity", "TrainingEvent", "DialogueTurnReceipt", "TrainingMessage", "TrainingResult", "UserAccount", "QuizAttempt", "QuizReceipt"];
const models = Object.fromEntries(tables.map(name => [name[0].toLowerCase() + name.slice(1), name]));
const methods = new Set(["findFirst", "findUnique", "findUniqueOrThrow", "create", "createMany", "update", "updateMany"]);
const phaseNames = new Set(["operation", "transaction", "aggregate_fetch", "save_reload", "cas_update", "write_children", "probe", "explain"]);

/** Only schema enums leave memory; SQL, parameters and rows are never retained. */
export function classifyStatement(text) {
  const sql = String(text ?? "").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ").replace(/'(?:''|[^'])*'/g, "?").trim();
  const command = /^SET\s+TRANSACTION\s+ISOLATION/i.test(sql) ? "SET_ISOLATION"
    : /^(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|EXPLAIN|SET)\b/i.exec(sql)?.[1]?.toUpperCase() ?? "OTHER";
  const table = /\b(?:FROM|INTO|UPDATE)\s+(?:"public"\.)?"([A-Za-z]+)"/i.exec(sql)?.[1];
  return { command, table: tables.includes(table) ? table : null,
    statementCount: sql.replace(/;\s*$/, "").includes(";") ? null : 1 };
}

/** Harness-only observation. No instrumentation is installed in runtime source. */
export class PostgresDiagnosisObserver {
  storage = new AsyncLocalStorage();
  samples = [];
  clients = new WeakMap();
  clientSequence = 0;
  querySequence = 0;
  spanSequence = 0;
  /** @type {null | ((query: any, record: any) => void)} */
  explainCapture = null;

  async sample(labels, work) {
    const sample = { endpoint: ["direct", "session_pooler"].includes(labels.endpoint) ? labels.endpoint : "unknown",
      operation: ["cold_connect", "rtt", "late_rtt", "prisma_rtt", "get", "message", "control_get", "ownership_rejected", "replay", "stale", "rollback", "explain"].includes(labels.operation) ? labels.operation : "unknown",
      phase: ["warmup", "measured", "control"].includes(labels.phase) ? labels.phase : "control",
      index: Number.isSafeInteger(labels.index) ? labels.index : 0,
      durationMs: null, status: "PASS", queries: [], acquisitions: [], connections: [], spans: [], ormOperations: [] };
    const started = performance.now();
    try { return await this.storage.run({ sample, startedAt: started, spanId: null, phase: "operation" }, async () => await work()); }
    catch (error) { sample.status = "FAIL"; throw error; }
    finally { sample.durationMs = performance.now() - started; this.samples.push(sample); }
  }

  async span(phase, work, orm) {
    if (!phaseNames.has(phase)) throw new Error("INVALID_DIAGNOSIS_PHASE");
    const parent = this.storage.getStore();
    if (!parent) return work();
    const started = performance.now(), id = ++this.spanSequence;
    let status = "PASS";
    try { return await this.storage.run({ ...parent, phase, spanId: id }, async () => await work()); }
    catch (error) { status = "FAIL"; throw error; }
    finally {
      const record = { id, parent: parent.spanId, phase, kind: orm ? "delegate" : "boundary", startMs: started - parent.startedAt, durationMs: performance.now() - started, status };
      parent.sample.spans.push(record);
      if (orm) parent.sample.ormOperations.push({ ...orm, ...record });
    }
  }

  /** Keep the original pg.Query, enqueue order, args and returned promise. The
   * pinned driver's pulse hook observes its existing submit/callback only. */
  attachPool(pool) {
    const observer = this, Base = pool.Client;
    if (typeof Base.prototype._pulseQueryQueue !== "function") throw new Error("PG_DIAGNOSIS_DRIVER_UNSUPPORTED");
    const queryRecords = new WeakMap();
    pool.Client = class ObservedClient extends Base {
      connect(...args) {
        const context = observer.storage.getStore(), start = performance.now();
        const callback = typeof args[0] === "function" ? args[0] : null;
        const record = { startMs: context ? start - context.startedAt : null, durationMs: null, status: "PASS" };
        const end = error => {
          if (record.durationMs !== null) return;
          record.durationMs = performance.now() - start;
          record.status = error ? "FAIL" : "PASS";
          context?.sample.connections.push(record);
        };
        if (callback) args[0] = function(error, ...rest) { end(error); return callback.call(this, error, ...rest); };
        const result = super.connect(...args);
        if (!callback && result?.then) result.then(() => end(), error => end(error));
        return result;
      }
      query(...args) {
        const context = observer.storage.getStore();
        const record = context ? { id: ++observer.querySequence, clientRef: observer.clients.get(this) ?? null, spanId: context.spanId, phase: context.phase, startMs: performance.now() - context.startedAt, ...classifyStatement(typeof args[0] === "string" ? args[0] : args[0]?.text),
          queuedAt: performance.now(), submitAt: null, clientMs: null, queueMs: null, wireMs: null, status: "PASS", rows: null, queuedAhead: null } : null;
        const previous = this.diagnosisPending;
        this.diagnosisPending = { context, record };
        try {
          const result = super.query(...args);
          if (record && result?.then) result.then(() => {}, () => { record.status = "FAIL"; });
          return result;
        } finally { this.diagnosisPending = previous; }
      }
      _pulseQueryQueue(...args) {
        const pending = this.diagnosisPending;
        if (pending?.record) {
          const query = this._queryQueue.at(-1);
          if (query && !queryRecords.has(query)) {
            const { record, context } = pending;
            record.queuedAhead = this._queryQueue.length - 1 + Number(Boolean(this._getActiveQuery()));
            context.sample.queries.push(record);
            queryRecords.set(query, record);
            const submit = query.submit, callback = query.callback;
            query.submit = function(...submitArgs) {
              record.submitAt = performance.now();
              record.queueMs = record.submitAt - record.queuedAt;
              // The harness enables capture only around one standalone owned GET.
              // Prisma's batch engine may dispatch under the transaction's ALS
              // context instead of the lazy delegate's context.
              if (observer.explainCapture && record.command === "SELECT") {
                try { observer.explainCapture(query, record); } catch { /* Observation cannot change dispatch. */ }
              }
              return submit.apply(this, submitArgs);
            };
            if (typeof callback === "function") query.callback = function(error, result) {
              if (record.clientMs === null) {
                const ended = performance.now();
                record.clientMs = ended - record.queuedAt;
                record.wireMs = record.submitAt === null ? null : ended - record.submitAt;
                record.rows = Number.isFinite(result?.rowCount) ? result.rowCount : null;
                record.status = error ? "FAIL" : "PASS";
              }
              return callback.apply(this, arguments);
            };
          }
        }
        return super._pulseQueryQueue(...args);
      }
    };
    const connect = pool.connect;
    pool.connect = function(...args) {
      const context = observer.storage.getStore(), started = performance.now();
      const record = { spanId: context?.spanId ?? null, clientRef: null, startMs: context ? started - context.startedAt : null, durationMs: null, status: "PASS", totalBefore: pool.totalCount, idleBefore: pool.idleCount, waitingBefore: pool.waitingCount, reusedClient: null };
      const finish = (error, client) => {
        if (record.durationMs !== null) return;
        record.durationMs = performance.now() - started;
        record.status = error ? "FAIL" : "PASS";
        if (client) {
          record.reusedClient = observer.clients.has(client);
          if (!record.reusedClient) observer.clients.set(client, ++observer.clientSequence);
          record.clientRef = observer.clients.get(client);
        }
        context?.sample.acquisitions.push(record);
      };
      const callback = typeof args[0] === "function" ? args[0] : null;
      if (callback) args[0] = function(error, client, release) {
        finish(error, client);
        return observer.storage.run(context, () => callback.call(this, error, client, release));
      };
      const result = connect.apply(this, args);
      if (!callback && result?.then) result.then(client => finish(null, client), error => finish(error));
      return result;
    };
  }

  wrapTransaction(tx) {
    const observer = this, delegates = new Map();
    return new Proxy(tx, { get(target, key) {
      const value = Reflect.get(target, key);
      if (!Object.hasOwn(models, key)) return typeof value === "function" ? value.bind(target) : value;
      if (!delegates.has(key)) delegates.set(key, new Proxy(value, { get(delegate, method) {
        const fn = Reflect.get(delegate, method);
        if (!methods.has(method) || typeof fn !== "function") return typeof fn === "function" ? fn.bind(delegate) : fn;
        return (...args) => {
          const currentPhase = observer.storage.getStore()?.phase;
          const phase = key === "trainingSession" && method === "findFirst" ? "aggregate_fetch"
            : key === "trainingSession" && method === "findUniqueOrThrow" ? "save_reload"
            : key === "trainingSession" && method === "updateMany" ? "cas_update"
            : currentPhase === "write_children" ? "write_children" : "transaction";
          // Await the lazy PrismaPromise once; attaching an extra .then could
          // execute some lazy operations twice. Values/errors are unchanged.
          return observer.span(phase, () => fn.apply(delegate, args), { model: models[key], method });
        };
      } }));
      return delegates.get(key);
    } });
  }

  attachRepository(repository) {
    const observer = this, transaction = repository.transaction, children = repository.writeChildren;
    if (typeof transaction !== "function" || typeof children !== "function") throw new Error("REPOSITORY_DIAGNOSIS_UNSUPPORTED");
    repository.transaction = function(operation, run, options) {
      return observer.span("transaction", () => transaction.call(this, operation, tx => run(observer.wrapTransaction(tx)), options));
    };
    repository.writeChildren = function(...args) {
      return observer.span("write_children", () => children.apply(this, args));
    };
    for (const operation of ["get", "save"]) {
      const original = repository[operation];
      repository[operation] = function(...args) {
        return observer.span("operation", () => original.apply(this, args), { model: "aggregate", method: operation });
      };
    }
    return repository;
  }

  exportSamples() {
    return this.samples.map(sample => ({ ...sample, queries: sample.queries.map(({ queuedAt, submitAt, ...safe }) => {
      // Correlate completed, non-overlapping delegate intervals. This also works
      // when the engine's batching tick inherits a parent transaction context.
      const enclosing = sample.spans.filter(s => s.kind === "delegate" && s.phase !== "operation" &&
        safe.startMs >= s.startMs && safe.startMs <= s.startMs + s.durationMs)
        .sort((a, b) => a.durationMs - b.durationMs)[0];
      return enclosing ? { ...safe, dispatchSpanId: safe.spanId, spanId: enclosing.id, phase: enclosing.phase } : safe;
    }) }));
  }
}
