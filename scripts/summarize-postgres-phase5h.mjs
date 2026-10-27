// Reuse the Phase 5F derivation, counting reload SELECTs by the SAVE boundary
// rather than a Prisma-delegate label (the new reader is an explicit query).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const original = "scripts/summarize-postgres-phase5f.mjs";
let source = readFileSync(original, "utf8").replaceAll("postgres-phase5f", "postgres-phase5h").replace('phase: "5F"', 'phase: "5H"')
  .replace('result.saveReloadSelects.push(s.queries.filter(q => q.phase === "save_reload" && q.command === "SELECT").length);',
    'result.saveReloadSelects.push(ss.flatMap(op => descendants(s, op)).filter(q => q.command === "SELECT").length);');
source = source.replace(/from "(\.{1,2}\/[^\"]+)"/g, (_, p) => `from "${pathToFileURL(resolve(dirname(original), p)).href}"`);
mkdirSync("test-results", { recursive: true }); const scratch = "test-results/phase5h-summary.mjs"; writeFileSync(scratch, source);
const child = spawn(process.execPath, [scratch], { windowsHide: true, stdio: "inherit" });
const code = await new Promise((done, reject) => { child.once("error", reject); child.once("close", done); }); process.exitCode = code ?? 1;
