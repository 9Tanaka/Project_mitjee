// Reuse matched workloads and Phase 5G cases; keep historical artifacts intact.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";

const [task, label] = process.argv.slice(2);
if (!(task === "benchmark" && ["before", "after"].includes(label) || ["correctness", "parity", "check"].includes(task) && !label)) throw new Error("USE_BENCHMARK_BEFORE_AFTER_CORRECTNESS_PARITY_OR_CHECK");
const hash = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const normalize = value => value.replaceAll("\r\n", "\n");
const baselineFile = "docs/performance/postgres-phase5h-baseline.json", scratchDir = "test-results/phase5h-baseline";
function baselineSource(name, metadata) {
  const local = `${scratchDir}/${name}`;
  if (task !== "check" && existsSync(local)) return normalize(readFileSync(local, "utf8"));
  // Clean-checkout fallback: reverse only this approved bounded delta and verify
  // the reconstructed Phase 5F source against its recorded normalized digest.
  let source = normalize(readFileSync(`src/persistence/${name}`, "utf8"));
  if (name === "prisma-repository.ts") source = source
    .replace('import { readTrainingAggregate, readTrainingAggregateAfterCas } from "./aggregate-reader.js";', 'import { readTrainingAggregate } from "./aggregate-reader.js";')
    .replace('readTrainingAggregateAfterCas(tx, snapshot.id)', 'tx.trainingSession.findUniqueOrThrow({ where: { id: snapshot.id }, include })');
  else {
    source = source.slice(0, source.indexOf("\n// SAVE-only post-CAS reload:")).trimEnd() + "\n";
    source = source.replace('import { Prisma }', 'import type { Prisma }').replace('Shared by both scopes.', 'GET only.');
  }
  if (createHash("sha256").update(source).digest("hex") !== metadata.normalizedBaselineSha256[name]) throw new Error("BASELINE_RECONSTRUCTION_FAILED");
  return source;
}
if (task === "benchmark" && label === "before") {
  if (existsSync(baselineFile)) throw new Error("BASELINE_ARTIFACT_ALREADY_EXISTS");
  const proof = JSON.parse(readFileSync("docs/performance/postgres-phase5g-save-proof.json", "utf8"));
  if (proof.status !== "PASS" || !Object.entries(proof.sourceSha256).every(([p, sha]) => hash(p) === sha)) throw new Error("PHASE5F_RUNTIME_BASELINE_REQUIRED");
  mkdirSync(scratchDir, { recursive: true });
  for (const file of ["prisma-repository.ts", "aggregate-reader.ts"]) writeFileSync(`${scratchDir}/${file}`, readFileSync(`src/persistence/${file}`));
  writeFileSync(baselineFile, JSON.stringify({ phase: "5H", capturedAt: new Date().toISOString(), head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), sourceSha256: proof.sourceSha256,
    normalizedBaselineSha256: Object.fromEntries(["prisma-repository.ts", "aggregate-reader.ts"].map(name => [name, createHash("sha256").update(normalize(readFileSync(`${scratchDir}/${name}`, "utf8"))).digest("hex")])) }, null, 2) + "\n");
} else {
  const base = JSON.parse(readFileSync(baselineFile, "utf8"));
  const allowed = ["src/persistence/prisma-repository.ts", "src/persistence/aggregate-reader.ts"];
  if (!Object.entries(base.sourceSha256).filter(([p]) => !allowed.includes(p)).every(([p, sha]) => hash(p) === sha)) throw new Error("UNRELATED_RUNTIME_CHANGE");
  const oldRepo = baselineSource("prisma-repository.ts", base);
  const expected = oldRepo.replace('import { readTrainingAggregate } from "./aggregate-reader.js";', 'import { readTrainingAggregate, readTrainingAggregateAfterCas } from "./aggregate-reader.js";')
    .replace('tx.trainingSession.findUniqueOrThrow({ where: { id: snapshot.id }, include })', 'readTrainingAggregateAfterCas(tx, snapshot.id)');
  if (normalize(readFileSync("src/persistence/prisma-repository.ts", "utf8")) !== expected) throw new Error("SAVE_CHANGE_EXCEEDS_APPROVED_DISPATCH");
  const oldReader = baselineSource("aggregate-reader.ts", base), reader = normalize(readFileSync("src/persistence/aggregate-reader.ts", "utf8"));
  for (const pattern of [/const sql = `[\s\S]*?`;/, /export function hydrateAggregate[\s\S]*?^}/m, /function assertSupportedOrdering[\s\S]*?^}/m, /export async function readTrainingAggregate\([\s\S]*?^}/m]) {
    if (oldReader.match(pattern)?.[0] !== reader.match(pattern)?.[0]) throw new Error("GET_CODEC_OR_ORDERING_CHANGED");
  }
}
if (task === "check") { console.log(JSON.stringify({ event: "phase5h_clean_checkout_source_check", status: "PASS" })); process.exit(0); }
const original = task === "benchmark" ? "scripts/benchmark-postgres-turns.mjs" : task === "parity" ? "scripts/prove-save-reload.mjs" : "scripts/verify-postgres-phase5b.mjs";
const originalHash = hash(original); let source = readFileSync(original, "utf8");
if (task === "benchmark") {
  if (JSON.parse(readFileSync("docs/performance/postgres-phase5f-after.json", "utf8")).sourceSha256[original] !== originalHash) throw new Error("WORKLOAD_CHANGED");
  source = source.replace('baseline = "595a579498814317843907a65b7d09e9a5505ca4"', 'baseline = "Phase 5F source digests"')
    .replace('const output = `docs/performance/postgres-phase5b-${label}.json`', 'const output = `docs/performance/postgres-phase5h-${label}.json`')
    .replace('if (label === "before") for (const f of runtimeFiles)', 'if (false) for (const f of runtimeFiles)'); // Exact Phase 5F baseline verified above, not the older Git HEAD.
} else if (task === "correctness") {
  if (existsSync("docs/performance/postgres-phase5h-correctness.json")) throw new Error("CORRECTNESS_ARTIFACT_ALREADY_EXISTS");
  source = source.replaceAll("phase5b", "phase5h").replace('"scripts/verify-postgres-phase5h.mjs"', '"scripts/verify-postgres-phase5b.mjs"');
} else {
  const g = JSON.parse(readFileSync("docs/performance/postgres-phase5g-save-proof.json", "utf8"));
  if (g.proofSha256[original] !== originalHash) throw new Error("PHASE5G_CASES_CHANGED");
  source = source.replaceAll("phase5g", "phase5h").replace('phase: "5G"', 'phase: "5H"')
    .replace('"./shadow-aggregate/save-reload.mjs"', '"./shadow-aggregate/implemented-save-parity.mjs"')
    .replace('installSaveReloadShadow, errorCategory', 'installImplementedSaveParity as installSaveReloadShadow, errorCategory')
    .replace('decode: oracle.decode, assertUpdate,', 'decode: oracle.decode, assertUpdate, include: oracle.include,')
    .replace('runtimeSaveChanged: false, candidateDrivesWrites: false', 'runtimeSaveChanged: true, candidateDrivesWrites: true')
    .replace('ensure(["src/persistence/prisma-repository.ts", "src/persistence/aggregate-reader.ts"].every(p => f.sourceSha256[p] === hash(p)), "PHASE5F_BASELINE_REQUIRED");', 'ensure(report.phase === "5H", "PHASE5H_BASELINE_REQUIRED");')
    .replace('report.status = "PASS"; report.recommendation = "IMPLEMENT_SAVE_ONE_SELECT";', 'report.status = "PASS"; report.recommendation = "IMPLEMENTED_SAVE_ONE_SELECT";');
}
const relocate = p => pathToFileURL(resolve(dirname(original), p)).href;
source = source.replace(/from "(\.{1,2}\/[^\"]+)"/g, (_, p) => `from "${relocate(p)}"`).replace(/import\("(\.{1,2}\/[^\"]+)"\)/g, (_, p) => `import("${relocate(p)}")`);
mkdirSync("test-results", { recursive: true }); const scratch = `test-results/phase5h-${task}-${label ?? "all"}.mjs`; writeFileSync(scratch, source);
const child = spawn(process.execPath, [scratch, ...(label ? [label] : [])], { windowsHide: true, stdio: "inherit" });
const code = await new Promise((done, reject) => { child.once("error", reject); child.once("close", done); }); process.exitCode = code ?? 1;
if (code === 0) {
  const path = task === "benchmark" ? `docs/performance/postgres-phase5h-${label}.json` : task === "parity" ? "docs/performance/postgres-phase5h-save-proof.json" : "docs/performance/postgres-phase5h-correctness.json";
  const result = JSON.parse(readFileSync(path, "utf8"));
  result.phase5hHarness = { original, originalSha256: originalHash, wrapperSha256: hash("scripts/phase5h-harness.mjs"), metadataAndImportRelocationOnly: task !== "parity" };
  result.phase5hRuntimeSha256 = Object.fromEntries(["src/persistence/prisma-repository.ts", "src/persistence/aggregate-reader.ts"].map(p => [p, hash(p)]));
  if (task === "parity") result.implementedObserverSha256 = hash("scripts/shadow-aggregate/implemented-save-parity.mjs");
  writeFileSync(path, JSON.stringify(result, null, 2) + "\n");
}
