import { describe, expect, it } from "vitest";
import { rootCertificates } from "node:tls";
import { execFileSync } from "node:child_process";
import { PostgresDiagnosisObserver, classifyStatement } from "../scripts/postgres-diagnosis-observer.mjs";
import { diagnosisTargets, statistics } from "../scripts/postgres-diagnosis-config.mjs";

describe("Phase 5A private, observation-only harness", () => {
  it("exports bounded classification without SQL, values, or unrecognized identifiers", async () => {
    expect(classifyStatement('SELECT secret FROM "public"."TrainingSession" WHERE id = \'private-value\';')).toEqual({ command: "SELECT", table: "TrainingSession", statementCount: 1 });
    expect(classifyStatement('SELECT * FROM "PrivateTable"')).toEqual({ command: "SELECT", table: null, statementCount: 1 });
    expect(classifyStatement("SELECT 1; SELECT 2").statementCount).toBeNull();
    const observer = new PostgresDiagnosisObserver();
    await observer.sample({ endpoint: "private-host", operation: "private-text", phase: "private", index: 1 }, async () => {});
    expect(JSON.stringify(observer.exportSamples())).not.toMatch(/private-host|private-text/);
  });

  it("awaits lazy Prisma operations once, preserves arguments, results and errors", async () => {
    const observer = new PostgresDiagnosisObserver(), args = { where: { id: "private" } }, value = { revision: 5 };
    let executed = 0;
    const error = new Error("private-error");
    const tx = observer.wrapTransaction({ trainingSession: {
      findFirst(input: unknown) { expect(input).toBe(args); return { then(resolve: (x: unknown) => void) { executed++; resolve(value); } }; },
      updateMany() { throw error; },
    } });
    await observer.sample({ endpoint: "direct", operation: "get", phase: "measured", index: 1 }, async () => {
      expect(await tx.trainingSession.findFirst(args)).toBe(value);
      await expect(tx.trainingSession.updateMany()).rejects.toBe(error);
    });
    expect(executed).toBe(1);
    const sample = observer.exportSamples()[0]!;
    expect(sample.ormOperations.map((p: { phase: string }) => p.phase)).toEqual(["aggregate_fetch", "cas_update"]);
    expect(JSON.stringify(sample)).not.toContain("private");
  });

  it("wraps repository boundaries without changing isolation, options or call order", async () => {
    const observer = new PostgresDiagnosisObserver(), calls: string[] = [], options = { timeout: 15000, isolationLevel: "RepeatableRead" };
    const repo = { transaction(_op: string, run: (tx: object) => unknown, opts: unknown) { expect(opts).toBe(options); calls.push("transaction"); return run({}); },
      async writeChildren() { calls.push("children"); },
      async get() { return this.transaction("GET", async () => { await this.writeChildren(); return 7; }, options); },
      async save() {},
    };
    observer.attachRepository(repo);
    expect(await observer.sample({ endpoint: "direct", operation: "get", phase: "measured", index: 1 }, () => repo.get())).toBe(7);
    expect(calls).toEqual(["transaction", "children"]);
    expect(observer.exportSamples()[0]!.spans.filter((p: { phase: string }) => p.phase === "write_children")).toHaveLength(1);
  });

  it("observes the original queued query once and preserves promise/callback shapes", async () => {
    const observer = new PostgresDiagnosisObserver();
    let submits = 0, connections = 0;
    class FakeClient {
      _queryQueue: any[] = []; active: any = null;
      _getActiveQuery() { return this.active; }
      connect(cb?: (e: unknown) => void) { connections++; if (cb) { cb(null); return; } return Promise.resolve(); }
      query(text: string, cb?: (e: unknown, result: unknown) => void) {
        let resolve!: (r: unknown) => void;
        const promise = cb ? undefined : new Promise(r => { resolve = r; });
        const query = { text, values: ["private-parameter"], callback: cb ?? ((_e: unknown, r: unknown) => resolve(r)),
          submit: () => { submits++; setTimeout(() => { query.callback(null, { rowCount: 1 }); this.active = null; this._pulseQueryQueue(); }, 1); } };
        this._queryQueue.push(query); this._pulseQueryQueue(); return promise;
      }
      _pulseQueryQueue() { if (!this.active && this._queryQueue.length) { this.active = this._queryQueue.shift(); this.active.submit(); } }
    }
    const pool = { Client: FakeClient, totalCount: 0, idleCount: 0, waitingCount: 0,
      connect(cb?: (e: unknown, c: FakeClient, release: () => void) => unknown) {
        const c = new this.Client();
        if (cb) { c.connect(() => cb(null, c, () => {})); return; }
        return c.connect()!.then(() => c);
      } };
    observer.attachPool(pool);
    observer.explainCapture = () => { throw new Error("observation cannot block SQL"); };
    await observer.sample({ endpoint: "direct", operation: "get", phase: "measured", index: 1 }, async () => {
      const c = await pool.connect()!;
      await observer.span("aggregate_fetch", async () => {
        const first = c.query('SELECT * FROM "public"."TrainingSession"'), second = c.query("SELECT 1");
        expect(first).toBeInstanceOf(Promise); await Promise.all([first, second]);
      });
      await new Promise<void>(resolve => {
        expect(pool.connect((_e, client) => { expect(client.query("SELECT 1", () => resolve())).toBeUndefined(); })).toBeUndefined();
      });
    });
    const sample = observer.exportSamples()[0]!;
    expect(submits).toBe(3); expect(connections).toBe(2);
    expect(sample.queries).toHaveLength(3); expect(sample.acquisitions).toHaveLength(2);
    expect(sample.queries.every((q: { wireMs: number | null; clientMs: number | null }) => q.wireMs !== null && q.clientMs !== null)).toBe(true);
    expect(sample.queries[1]!.queuedAhead).toBe(1);
    expect(sample.queries[0]!.spanId).toBe(sample.queries[1]!.spanId);
    expect(JSON.stringify(sample)).not.toMatch(/SELECT \*|SELECT 1|private-parameter|public/);
  });

  it("isolates concurrent measurement contexts and records failure without error bodies", async () => {
    const observer = new PostgresDiagnosisObserver(), error = new Error("secret-url-and-password");
    await Promise.all([1, 2].map(index => observer.sample({ endpoint: "direct", operation: "get", phase: "measured", index },
      () => observer.span("aggregate_fetch", async () => { await Promise.resolve(); return index; }))));
    expect(observer.exportSamples().every(s => s.spans.length === 1)).toBe(true);
    await expect(observer.sample({ endpoint: "direct", operation: "get", phase: "control", index: 3 }, () => Promise.reject(error))).rejects.toBe(error);
    expect(JSON.stringify(observer.exportSamples())).not.toContain("secret");
  });

  it("correlates engine dispatch under parent context using enclosing delegate intervals", () => {
    const observer = new PostgresDiagnosisObserver();
    (observer.samples as any[]).push({ queries: [
      { spanId: 1, phase: "transaction", startMs: 4, command: "SELECT", queuedAt: 0, submitAt: 1 },
      { spanId: 1, phase: "transaction", startMs: 9, command: "COMMIT", queuedAt: 0, submitAt: 1 }],
      spans: [{ id: 2, parent: 1, kind: "delegate", phase: "aggregate_fetch", startMs: 3, durationMs: 4 }] });
    expect(observer.exportSamples()[0]!.queries).toEqual([
      { dispatchSpanId: 1, spanId: 2, phase: "aggregate_fetch", startMs: 4, command: "SELECT" },
      { spanId: 1, phase: "transaction", startMs: 9, command: "COMMIT" }]);
  });

  it("awaits lazy work inside sample and delegate async contexts exactly once", async () => {
    const observer = new PostgresDiagnosisObserver(); let executions = 0;
    const lazy = () => ({ then(resolve: (v: string) => void) {
      executions++; resolve(observer.storage.getStore()?.phase ?? "MISSING");
    } });
    expect(await observer.sample({ endpoint: "direct", operation: "prisma_rtt", phase: "measured", index: 1 }, lazy)).toBe("operation");
    expect(await observer.sample({ endpoint: "direct", operation: "get", phase: "measured", index: 1 },
      () => observer.span("aggregate_fetch", lazy))).toBe("aggregate_fetch");
    expect(executions).toBe(2);
  });

  it("guards dedicated same-project targets and retains fail-closed TLS", () => {
    const config = { POSTGRES_TEST_DATABASE_URL: "postgres://postgres.projectref:secret@aws-0.pooler.supabase.com:5432/mitjee_test",
      DIRECT_URL: "postgres://postgres:secret@db.projectref.supabase.co:5432/mitjee_test?sslmode=require&sslaccept=strict",
      DATABASE_URL: "postgres://user:secret@other.example/runtime", POSTGRES_TEST_TLS_CA: rootCertificates[0] };
    const targets = diagnosisTargets(config);
    expect(targets.urls.direct).not.toContain("?"); expect(targets.tlsCa).toBe(rootCertificates[0]);
    for (const override of [{ DATABASE_URL: "postgres://user:secret@other.example/mitjee_test" },
      { DIRECT_URL: config.DIRECT_URL.replace("projectref", "another") }, { POSTGRES_TEST_TLS_CA: "PRIVATE KEY secret" },
      { DIRECT_URL: config.DIRECT_URL + "&sslmode=disable" }, { POSTGRES_TEST_DATABASE_URL: config.POSTGRES_TEST_DATABASE_URL.replace("5432", "6543") }]) {
      expect(() => diagnosisTargets({ ...config, ...override })).toThrow("POSTGRES_DIAGNOSIS_TARGET_OR_CA_REJECTED");
    }
  });

  it("computes median/nearest-rank percentiles and ignores invalid timings", () => {
    expect(statistics([4, 1, 2, 3, NaN])).toEqual({ n: 4, min: 1, p50: 2.5, p95: 4, max: 4 });
    expect(statistics([]).n).toBe(0);
  });

  it("ignores local certificate and key files, including nested filenames", () => {
    const paths = ["certs/local.pem", "certificates/root.txt", "local/key.key", "local/identity.p12", "local/root.crt", "local/server.pfx"];
    const ignored = execFileSync("git", ["check-ignore", "--stdin"], { input: paths.join("\n"), encoding: "utf8" }).trim().split(/\r?\n/);
    expect(ignored).toEqual(paths);
    expect(() => execFileSync("git", ["check-ignore", "src/core.ts"], { stdio: "ignore" })).toThrow();
  });
});
