// Opt-in real runtime DB diagnostic; synthetic sessions only, no reset/cleanup or provider calls.
import nextEnv from "@next/env";
import { register } from "tsx/esm/api";
import { randomUUID } from "node:crypto";
register();
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { createDatabase } = await import("../src/server/database.ts");
const { PrismaTrainingRepository } = await import("../src/persistence/prisma-repository.ts");
const { createApplication } = await import("../src/application/composition.ts");
const { trainingFailureCategory } = await import("../src/server/training-diagnostics.ts");
const provider = { async generateCharacterResponse() { throw new Error("NO_PROVIDER_ALLOWED_IN_START_DIAGNOSTIC"); } };
const report = { scope: "Real MySQL startup/start, no AI request or browser-auth acceptance", workers: [] };
await Promise.all([0, 1].map(async worker => {
  const db = createDatabase(), entry = { worker, initializationMs: null, starts: [], category: null };
  report.workers.push(entry);
  const began = Date.now();
  try {
    const app = await createApplication(new PrismaTrainingRepository(db), provider, Date.now, undefined, () => "CC-02");
    entry.initializationMs = Date.now() - began;
    for (let i = 0; i < 2; i++) {
      const now = Date.now(), user = { id: `start-diagnostic-${randomUUID()}` }, input = { startId: randomUUID(), expectedRevision: 0 };
      const started = await app.start("call-center", user, input);
      const replay = await app.start("call-center", user, input);
      entry.starts.push({ ms: Date.now() - now, status: started.session.status, state: started.session.phone.state,
        replayDuplicate: replay.duplicate, sameSession: started.session.sessionId === replay.session.sessionId });
    }
  } catch (error) { entry.category = trainingFailureCategory(error); process.exitCode = 1; }
  finally { await db.$disconnect(); }
}));
console.log(JSON.stringify(report));
