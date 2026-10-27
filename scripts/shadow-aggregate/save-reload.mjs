import { AsyncLocalStorage } from "node:async_hooks";
import { mismatchCategories } from "./oracle.mjs";

const getRoot = 'WHERE s.id=$1 AND s."ownerId"=$2';
const saveRoot = 'WHERE s.id=$1';
const known = new Set(["REVISION_CONFLICT", "SESSION_IDENTITY_IMMUTABLE", "HISTORY_IMMUTABLE", "OPPORTUNITY_IMMUTABLE", "RESULT_IMMUTABLE",
  "UNSANITIZED_CONTENT", "UNSUPPORTED_PERSISTED_ORDERING", "INJECTED_SHADOW_ROLLBACK", "P2002", "P2003", "P2028"]);
export const errorCategory = error => known.has(error?.code) ? error.code : known.has(error?.message) ? error.message : "OPERATION_REJECTED";

/** Proof-only SAVE scope: preserve the existing reload's ID-only predicate.
 * Reuse the runtime SQL/codec/ordering guard; never borrow owner from the oracle. */
export function saveScopeTransaction(tx) {
  return new Proxy(tx, { get(target, key) {
    if (key === "$queryRawUnsafe") return (sql, id, _owner) => {
      if (typeof sql !== "string" || !sql.endsWith(getRoot)) throw new Error("UNEXPECTED_AGGREGATE_QUERY");
      return target.$queryRawUnsafe(sql.slice(0, -getRoot.length) + saveRoot, id);
    };
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } });
}

/** Observe the actual unmodified SAVE. Candidate rows/validation never feed it.
 * Private-method interception is confined to this test instance, not its class. */
export function installSaveReloadShadow(repository, { readAggregate, decode, assertUpdate, sample = async (_name, run) => ({ value: await run(), statements: null }) }) {
  const storage = new AsyncLocalStorage(), attempts = [], comparisons = [];
  const originalSave = repository.save, originalTransaction = repository.transaction;
  function validation(row, context) {
    const current = decode(row); current.revision = context.expected;
    try { assertUpdate(current, structuredClone(context.next), context.expected); return "ACCEPT"; }
    catch (error) { return errorCategory(error); }
  }
  repository.save = async function(next, expected) {
    const context = { ...storage.getStore(), next: structuredClone(next), expected, casMatched: null, reloads: 0 };
    const attempt = { case: context.label ?? "unlabelled", casMatched: null, reloads: 0, outcome: null };
    attempts.push(attempt);
    try { const result = await storage.run(context, () => originalSave.call(this, next, expected)); attempt.outcome = "COMMITTED"; return result; }
    catch (error) { attempt.outcome = errorCategory(error); throw error; }
    finally { attempt.casMatched = context.casMatched; attempt.reloads = context.reloads; }
  };
  repository.transaction = function(operation, run, options) {
    if (operation !== "SAVE") return originalTransaction.call(this, operation, run, options);
    return originalTransaction.call(this, operation, tx => {
      const context = storage.getStore();
      const session = new Proxy(tx.trainingSession, { get(target, method) {
        const fn = Reflect.get(target, method);
        if (method === "updateMany") return async (...args) => { const changed = await fn.apply(target, args); context.casMatched = changed.count === 1; return changed; };
        if (method === "findUniqueOrThrow") return async (...args) => {
          if (context.casMatched !== true) throw new Error("RELOAD_WITHOUT_SUCCESSFUL_CAS");
          context.reloads++;
          const reference = await sample("baseline", () => fn.apply(target, args));
          const record = { case: context.label ?? "unlabelled", malformed: context.malformed === true, baselineStatements: reference.statements,
            baselineValidation: validation(reference.value, context), rowMismatches: [], domainMismatches: [], candidateValidation: null, candidateError: null };
          try {
            const candidate = await sample("candidate", () => readAggregate(saveScopeTransaction(tx), args[0].where.id, context.next.ownerId));
            record.candidateStatements = candidate.statements;
            if (!candidate.value) throw new Error("MISSING_POST_CAS_AGGREGATE");
            record.rowMismatches = mismatchCategories(reference.value, candidate.value);
            record.domainMismatches = mismatchCategories(decode(reference.value), decode(candidate.value));
            record.candidateValidation = validation(candidate.value, context);
            record.postCasRevisionEquivalent = reference.value.revision === context.expected + 1 && candidate.value.revision === reference.value.revision;
            if (context.probeGetScope) {
              const getScoped = await readAggregate(tx, args[0].where.id, context.next.ownerId);
              record.unadaptedGetScopeReturnedNull = getScoped === null;
            }
          } catch (error) { record.candidateError = errorCategory(error); }
          comparisons.push(record);
          // The original row alone goes to the authoritative decoder/assertUpdate/writer.
          return reference.value;
        };
        return typeof fn === "function" ? fn.bind(target) : fn;
      } });
      const proxy = new Proxy(tx, { get(target, key) {
        if (key === "trainingSession") return session;
        const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
      } });
      return run(proxy);
    }, options);
  };
  return { attempts, comparisons, run: (label, work, flags = {}) => storage.run({ label, ...flags }, work) };
}
