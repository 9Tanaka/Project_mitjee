// Existing real-PG suite plus the same new guard contract as in-memory tests.
// Raw Vitest output stays private in ignored test-results; shared evidence is allowlisted.
import nextEnv from "@next/env";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { diagnosisTargets } from "./postgres-diagnosis-config.mjs";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const files = ["tests/persistence.postgres.test.ts", "tests/accounts.postgres.test.ts", "tests/quiz.postgres.test.ts",
  "tests/call-variants.postgres.test.ts", "tests/postgres.metadata.test.ts", "tests/http.integration.test.ts", "tests/preflight-sharing.postgres.test.ts"];
const rawPath = "test-results/postgres-phase5b-private.json";
const started = Date.now(), report = { status: "RUNNING", startedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  target: "dedicated PostgreSQL test database / session pooler / trusted CA", files,
  runner: { maxWorkers: 1, testTimeoutMs: 300000, hookTimeoutMs: 60000 },
  sourceSha256: Object.fromEntries([...files, "tests/preflight-contract.ts", "src/application/training-service.ts", "src/dialogue/orchestrator.ts",
    "src/core.ts", "src/persistence/prisma-repository.ts", "scripts/verify-postgres-phase5b.mjs"].map(f => [f, createHash("sha256").update(readFileSync(f)).digest("hex")])),
  cases: [], counts: {}, postgres: {} };
try {
  diagnosisTargets(process.env); mkdirSync("test-results", { recursive: true });
  console.log(JSON.stringify({ event: "phase5b_postgres_correctness_start", files: files.length }));
  const child = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", ...files, "--maxWorkers=1", "--testTimeout=300000", "--hookTimeout=60000",
    "--reporter=json", `--outputFile=${rawPath}`], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", () => {}); child.stderr.on("data", () => {});
  const exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  const raw = JSON.parse(readFileSync(rawPath, "utf8"));
  for (const f of raw.testResults ?? []) for (const a of f.assertionResults ?? []) {
    const file = files.find(p => f.name.replaceAll("\\", "/").endsWith(p));
    const postgres = file !== "tests/http.integration.test.ts" || a.fullName.includes("real PostgreSQL");
    report.cases.push({ file: file ?? "unknown", name: a.fullName, status: a.status, durationMs: a.duration ?? null, postgres,
      failureCategory: a.status === "failed" ? "ASSERTION_OR_TEST_FAILURE" : null });
  }
  const count = cases => ({ total: cases.length, passed: cases.filter(c => c.status === "passed").length,
    failed: cases.filter(c => c.status === "failed").length, skipped: cases.filter(c => !["passed", "failed"].includes(c.status)).length });
  report.counts = count(report.cases); report.postgres = count(report.cases.filter(c => c.postgres));
  report.exitCode = exitCode;
  report.status = exitCode === 0 && raw.success && report.postgres.passed === 69 && report.postgres.skipped === 0 && report.postgres.failed === 0 ? "PASS" : "FAIL";
} catch { report.status = "FAIL"; report.failureCategory = "POSTGRES_VERIFICATION_FAILED"; }
finally {
  report.completedAt = new Date().toISOString(); report.durationMs = Date.now() - started;
  mkdirSync("docs/performance", { recursive: true });
  writeFileSync("docs/performance/postgres-phase5b-correctness.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ event: "phase5b_postgres_correctness_complete", status: report.status, counts: report.counts, postgres: report.postgres }));
  if (report.status !== "PASS") process.exitCode = 1;
}
