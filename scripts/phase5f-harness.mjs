// Reuse the exact Phase 5B workloads without overwriting historical evidence.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

const [task, label] = process.argv.slice(2);
if (!(task === "benchmark" && ["before", "after"].includes(label) || task === "correctness" && !label)) throw new Error("USE_BENCHMARK_BEFORE_AFTER_OR_CORRECTNESS");
const original = task === "benchmark" ? "scripts/benchmark-postgres-turns.mjs" : "scripts/verify-postgres-phase5b.mjs";
const bytes = readFileSync(original), originalHash = createHash("sha256").update(bytes).digest("hex");
let source = bytes.toString("utf8");
if (task === "benchmark") {
  const old = JSON.parse(readFileSync("docs/performance/postgres-phase5b-after.json", "utf8"));
  if (old.sourceSha256[original] !== originalHash) throw new Error("PHASE5B_WORKLOAD_CHANGED");
  source = source.replace('baseline = "595a579498814317843907a65b7d09e9a5505ca4"', 'baseline = "ec5b180313ca347e3ff9e9f5ace2034685e706d3"')
    .replace('const output = `docs/performance/postgres-phase5b-${label}.json`', 'const output = `docs/performance/postgres-phase5f-${label}.json`');
} else {
  if (existsSync("docs/performance/postgres-phase5f-correctness.json")) throw new Error("CORRECTNESS_ARTIFACT_ALREADY_EXISTS");
  source = source.replaceAll("phase5b", "phase5f");
  // The original script hashes its own source; point that metadata at the retained file.
  source = source.replace('"scripts/verify-postgres-phase5f.mjs"', '"scripts/verify-postgres-phase5b.mjs"');
}
// Only module locations change for execution from ignored scratch; workload logic stays identical.
const relocate = p => pathToFileURL(resolve(dirname(original), p)).href;
source = source.replace(/from "(\.{1,2}\/[^\"]+)"/g, (_, p) => `from "${relocate(p)}"`)
  .replace(/import\("(\.{1,2}\/[^\"]+)"\)/g, (_, p) => `import("${relocate(p)}")`);
mkdirSync("test-results", { recursive: true });
const scratch = `test-results/phase5f-${task}-${label ?? "all"}.mjs`;
writeFileSync(scratch, source);
const child = spawn(process.execPath, [scratch, ...(label ? [label] : [])], { windowsHide: true, stdio: "inherit" });
const code = await new Promise((done, reject) => { child.once("error", reject); child.once("close", done); });
process.exitCode = code ?? 1;
