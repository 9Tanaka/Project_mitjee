// Opt-in real Groq; all four stories run independently. No raw responses, prompts, or secrets emitted.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { register } from "tsx/esm/api";
import { runAllCallStories } from "./call-live-runner.mjs";
register(); nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { createApplication } = await import("../src/application/composition.ts");
const { InMemoryTrainingRepository } = await import("../src/domain/repository.ts");
const { createScenarioProvider } = await import("../src/server/scenario-provider.ts");
const { GroqProviderError } = await import("../src/providers/groq-scenario-provider.ts");
let lastRequestAt = Date.now();
const report = await runAllCallStories(async story => {
  const turns = [], providerFailures = [];
  let state = "INCOMING_CALL", turnType = "ANSWER";
  try {
    assert.equal(process.env.AI_PROVIDER, "groq");
    const actual = createScenarioProvider(process.env);
    const provider = { async generateCharacterResponse(context, options) {
      try { return await actual.generateCharacterResponse(context, options); }
      catch (error) {
        providerFailures.push({ turnType, state, category: error instanceof GroqProviderError ? error.category : "PROVIDER_ERROR",
          ...(error instanceof GroqProviderError && error.detail ? { detail: error.detail } : {}) });
        throw error;
      }
    } };
    async function pace() {
      if (process.argv.includes("--paced")) await new Promise(r => setTimeout(r, Math.max(0, 30_000 - (Date.now() - lastRequestAt))));
      lastRequestAt = Date.now();
    }
    const repo = new InMemoryTrainingRepository(), user = { id: `live-call-${randomUUID()}` };
    const app = await createApplication(repo, provider, Date.now, undefined, () => story);
    let s = (await app.start("call-center", user, { startId: randomUUID(), expectedRevision: 0 })).session;
    async function act(label) {
      const a = s.availableActions.find(a => a.label === label); assert.ok(a);
      s = (await app.action(s.sessionId, user, { actionId: randomUUID(), expectedRevision: s.revision, actionDefinitionId: a.id, payload: {} })).session;
    }
    async function record() {
      const saved = await repo.get(s.sessionId, user.id), t = saved.dialogueTurns.at(-1);
      turns.push({ turnType, state: t.state, usedFallback: t.usedFallback, attempts: t.attempts, failureReason: t.failureReason,
        nonEmpty: !!t.response.character_message.trim() });
    }
    await act("รับสาย"); assert.equal(s.phone.openingStatus, "PENDING");
    turnType = "CHARACTER_OPENING"; state = s.phone.state; await pace();
    s = (await app.opening(s.sessionId, user, { expectedRevision: s.revision })).session; await record();
    const before = await repo.get(s.sessionId, user.id);
    turnType = "USER_MESSAGE"; await pace();
    s = (await app.message(s.sessionId, user, { turnId: randomUUID(), expectedRevision: s.revision,
      text: "ขอชื่อและข้อมูลอ้างอิงก่อนครับ ผมจะตรวจสอบจากช่องทางที่มีอยู่เอง" })).session; await record();
    const after = await repo.get(s.sessionId, user.id);
    assert.equal(after.state, before.state); assert.equal(after.result, null);
    assert.deepEqual(after.events, before.events); assert.deepEqual(after.opportunities, before.opportunities);
    await act("ดำเนินบทสนทนาต่อ");
    turnType = "CHARACTER_STATE_TURN"; state = s.phone.state; await pace();
    s = (await app.opening(s.sessionId, user, { expectedRevision: s.revision })).session; await record();
    return { status: turns.every(t => !t.usedFallback && t.failureReason === null && t.nonEmpty) ? "PASSED" : "FAILED",
      turns, providerFailures, freeTextStateUnchanged: true, freeTextEvaluationUnchanged: true, noDirectCritical: true };
  } catch {
    return { status: "FAILED", failureCategory: "VERIFICATION_OR_RUNTIME_FAILURE", turnType, state, turns, providerFailures };
  }
});
report.scope = "Real Groq; in-memory repository, not deployed Auth/MySQL E2E";
await mkdir("frontend-artifacts", { recursive: true });
await writeFile("frontend-artifacts/call-stories-live.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (report.status !== "PASSED") process.exitCode = 1;
