import { AsyncLocalStorage } from "node:async_hooks";
import { mismatchCategories } from "./oracle.mjs";
import { errorCategory } from "./save-reload.mjs";
export { errorCategory } from "./save-reload.mjs";

/** Actual one-SELECT SAVE stays authoritative. Old include is a read-only oracle.
 * This instrumentation is confined to dedicated test repository instances. */
export function installImplementedSaveParity(repository, { readAggregate, decode, assertUpdate, include, sample }) {
  const storage = new AsyncLocalStorage(), attempts = [], comparisons = [];
  const originalSave = repository.save, originalTransaction = repository.transaction;
  const validation = (row, c) => {
    const current = decode(row); current.revision = c.expected;
    try { assertUpdate(current, structuredClone(c.next), c.expected); return "ACCEPT"; } catch (e) { return errorCategory(e); }
  };
  repository.save = async function(next, expected) {
    const c = { ...storage.getStore(), next: structuredClone(next), expected, casMatched: null, reloads: 0, record: null };
    const attempt = { case: c.label ?? "unlabelled", casMatched: null, reloads: 0, outcome: null }; attempts.push(attempt);
    try { const result = await storage.run(c, () => originalSave.call(this, next, expected)); attempt.outcome = "COMMITTED"; return result; }
    catch (error) {
      attempt.outcome = errorCategory(error);
      if (c.record && error?.message === "UNSUPPORTED_PERSISTED_ORDERING") c.record.candidateError = "UNSUPPORTED_PERSISTED_ORDERING";
      throw error;
    } finally { attempt.casMatched = c.casMatched; attempt.reloads = c.reloads; }
  };
  repository.transaction = function(operation, run, options) {
    if (operation !== "SAVE") return originalTransaction.call(this, operation, run, options);
    return originalTransaction.call(this, operation, tx => {
      const c = storage.getStore(), session = new Proxy(tx.trainingSession, { get(target, key) {
        const fn = Reflect.get(target, key);
        if (key === "updateMany") return async (...args) => { const changed = await fn.apply(target, args); c.casMatched = changed.count === 1; return changed; };
        return typeof fn === "function" ? fn.bind(target) : fn;
      } });
      const proxy = new Proxy(tx, { get(target, key) {
        if (key === "trainingSession") return session;
        if (key === "$queryRawUnsafe") return async (...args) => {
          if (c.casMatched !== true || !String(args[0]).endsWith("WHERE s.id=$1") || args.length !== 2) throw new Error("INVALID_POST_CAS_RELOAD_SCOPE");
          c.reloads++;
          const actual = await sample("implemented", () => target.$queryRawUnsafe(...args));
          const reference = await sample("baseline", () => target.trainingSession.findUniqueOrThrow({ where: { id: args[1] }, include }));
          // Invoke the unchanged runtime codec on a detached wire copy, never on
          // the returned authoritative wire object. No additional query is issued.
          const { hydrateAggregate } = await import("../../src/persistence/aggregate-reader.ts");
          const row = hydrateAggregate(structuredClone(actual.value[0]?.aggregate ?? null));
          const record = { case: c.label ?? "unlabelled", malformed: c.malformed === true, baselineStatements: reference.statements, candidateStatements: actual.statements,
            baselineValidation: validation(reference.value, c), candidateValidation: row ? validation(row, c) : null,
            rowMismatches: mismatchCategories(reference.value, row), domainMismatches: row ? mismatchCategories(decode(reference.value), decode(row)) : ["NULLNESS"],
            candidateError: null, postCasRevisionEquivalent: reference.value.revision === c.expected + 1 && row?.revision === reference.value.revision };
          if (c.probeGetScope) record.unadaptedGetScopeReturnedNull = await readAggregate(target, args[1], c.next.ownerId) === null;
          comparisons.push(record); c.record = record;
          return actual.value;
        };
        const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
      } });
      return run(proxy);
    }, options);
  };
  return { attempts, comparisons, run: (label, work, flags = {}) => storage.run({ label, ...flags }, work) };
}
