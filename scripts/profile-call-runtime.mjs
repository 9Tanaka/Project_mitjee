// Non-destructive, opt-in runtime profiling. Emits categories/timings only, never arguments or SQL.
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { register } from "tsx/esm/api";
register(); nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { createDatabase } = await import("../src/server/database.ts");
const { PrismaTrainingRepository } = await import("../src/persistence/prisma-repository.ts");
const { createApplication } = await import("../src/application/composition.ts");
const categories = ["publish", "getTemplate", "get", "create", "save"];
const report = { status: "FAILED", scope: "Real runtime MySQL; synthetic owned sessions retained; no AI/auth benchmark", workers: [] };
for (let worker = 0; worker < 2; worker++) {
  const db = createDatabase(), spans = [], repo = new PrismaTrainingRepository(db);
  const measured = Object.fromEntries(categories.map(category => [category, async (...args) => {
    const at = performance.now(); try { return await repo[category](...args); }
    finally { spans.push({ category, ms: Math.round(performance.now() - at) }); }
  }]));
  async function measure(category, operation) {
    spans.length = 0; const at = performance.now(); const value = await operation();
    return { value, timing: { category, ms: Math.round(performance.now() - at), repositorySpans: [...spans] } };
  }
  try {
    const connection = await measure("connection_and_probe", () => db.$queryRawUnsafe("SELECT 1"));
    const init = await measure("application_initialization", () => createApplication(measured, { async generateCharacterResponse() { throw new Error("NO_PROVIDER_CALL_ALLOWED"); } }, Date.now, undefined, () => "CC-01"));
    const app = init.value, user = { id: `profile-${randomUUID()}` }, samples = [];
    for (let i = 0; i < 3; i++) {
      const input = { startId: randomUUID(), expectedRevision: 0 };
      const fresh = await measure("fresh_start", () => app.start("call-center", user, input));
      const replay = await measure("idempotent_replay", () => app.start("call-center", user, input));
      const resume = await measure("resume", () => app.resume(fresh.value.session.sessionId, user));
      if (!replay.value.duplicate || fresh.value.session.sessionId !== replay.value.session.sessionId) throw new Error("PROFILE_INVARIANT_FAILED");
      samples.push(fresh.timing, replay.timing, resume.timing);
    }
    report.workers.push({ worker, connection: connection.timing, initialization: init.timing, samples });
  } catch { report.workers.push({ worker, category: "RUNTIME_PROFILE_FAILED" }); process.exitCode = 1; }
  finally { await db.$disconnect(); }
}
report.status = process.exitCode ? "FAILED" : "PASSED";
await mkdir("frontend-artifacts", { recursive: true });
const label = process.argv.includes("--after") ? "after" : "before";
await writeFile(`frontend-artifacts/call-performance-${label}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
