import { readFileSync, writeFileSync } from "node:fs";
import { createHash, } from "node:crypto";
import { statistics } from "./postgres-diagnosis-config.mjs";

const read = name => JSON.parse(readFileSync(`docs/performance/postgres-phase5f-${name}.json`, "utf8"));
const before = read("before"), after = read("after");
if (before.status !== "PASS" || after.status !== "PASS" || JSON.stringify(before.plan) !== JSON.stringify(after.plan)) throw new Error("UNMATCHED_BENCHMARKS");
if (before.sourceSha256["scripts/benchmark-postgres-turns.mjs"] !== after.sourceSha256["scripts/benchmark-postgres-turns.mjs"]) throw new Error("WORKLOAD_CHANGED");
function descendants(sample, root) {
  const spans = new Map(sample.spans.map(s => [s.id, s]));
  return sample.queries.filter(q => { let id = q.spanId; while (id) { if (id === root.id) return true; id = spans.get(id)?.parent; } return false; });
}
function summarize(report, cohort) {
  const samples = report.samples.filter(s => s.cohort === cohort && s.phase === "measured"), gets = [], saves = [];
  const result = { totalMs: statistics(samples.map(s => s.durationMs)), statementCounts: samples.map(s => s.queries.length),
    transactionControls: samples.map(s => s.queries.filter(q => ["BEGIN", "SET_ISOLATION", "COMMIT"].includes(q.command)).length),
    combinedGetMs: [], saveSharePercent: [], saveReloadSelects: [], retryCounts: samples.map(s => s.trace.retryCount) };
  for (const s of samples) {
    const operations = s.ormOperations.filter(o => o.model === "aggregate"), sg = operations.filter(o => o.method === "get"), ss = operations.filter(o => o.method === "save");
    for (const [group, output] of [[sg, gets], [ss, saves]]) for (const op of group) {
      const queries = descendants(s, op); output.push({ statements: queries.length, selects: queries.filter(q => q.command === "SELECT").length, durationMs: op.durationMs });
    }
    result.combinedGetMs.push(sg.reduce((sum, g) => sum + g.durationMs, 0));
    result.saveSharePercent.push(ss.reduce((sum, g) => sum + g.durationMs, 0) / s.durationMs * 100);
    result.saveReloadSelects.push(s.queries.filter(q => q.phase === "save_reload" && q.command === "SELECT").length);
  }
  return { ...result, combinedGetMs: statistics(result.combinedGetMs), saveSharePercent: statistics(result.saveSharePercent),
    get: { statements: [...new Set(gets.map(g => g.statements))], selects: [...new Set(gets.map(g => g.selects))], durationMs: statistics(gets.map(g => g.durationMs)) },
    save: { statements: [...new Set(saves.map(g => g.statements))], selects: [...new Set(saves.map(g => g.selects))], durationMs: statistics(saves.map(g => g.durationMs)) },
    getCounts: report.summary[cohort].getCounts };
}
const result = { phase: "5F", sourceCommit: after.sourceCommit, before: {}, after: {}, changesPercent: {},
  plan: after.plan, environment: after.environment,
  runtimeReaderSha256: createHash("sha256").update(readFileSync("src/persistence/aggregate-reader.ts")).digest("hex"),
  benchmarkWorkloadSha256: after.sourceSha256["scripts/benchmark-postgres-turns.mjs"], completedAt: new Date().toISOString() };
for (const mode of ["text", "voice"]) {
  result.before[mode] = summarize(before, mode); result.after[mode] = summarize(after, mode);
  result.changesPercent[mode] = Object.fromEntries(["p50", "p95"].map(p => [p, (result.after[mode].totalMs[p] / result.before[mode].totalMs[p] - 1) * 100]));
}
writeFileSync("docs/performance/postgres-phase5f-comparison.json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
