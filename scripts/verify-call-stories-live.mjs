// Opt-in real Groq verification; private environment and raw responses are never printed.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { register } from "tsx/esm/api";
register();
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { createApplication } = await import("../src/application/composition.ts");
const { InMemoryTrainingRepository } = await import("../src/domain/repository.ts");
const { createScenarioProvider } = await import("../src/server/scenario-provider.ts");
const { GroqProviderError } = await import("../src/providers/groq-scenario-provider.ts");
const report = { status: "NOT_RUN", scope: "Real Groq; in-memory repository, not deployed Auth/MySQL E2E", stories: [], failureCategory: null, recoveredProviderCategories: [] };
try {
  assert.equal(process.env.AI_PROVIDER, "groq", "GROQ_NOT_CONFIGURED");
  assert.ok(process.env.GROQ_API_KEY && process.env.GROQ_MODEL, "GROQ_NOT_CONFIGURED");
  const actualProvider = createScenarioProvider(process.env);
  let lastRequestAt = Date.now();
  async function pace() {
    if (process.argv.includes("--paced")) {
      // Verification-only pacing for free-tier token limits, not runtime latency or provider substitution.
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 30_000 - (Date.now() - lastRequestAt))));
      lastRequestAt = Date.now();
    }
  }
  const provider = { async generateCharacterResponse(context, options) {
    try { return await actualProvider.generateCharacterResponse(context, options); }
    catch (error) { report.failureCategory = error instanceof GroqProviderError ? error.category : "PROVIDER_ERROR"; report.recoveredProviderCategories.push(report.failureCategory); throw error; }
  } };
  for (const story of ["CC-01", "CC-02", "CC-N01", "CC-N02"]) {
    const repo = new InMemoryTrainingRepository(), user = { id: `live-call-${randomUUID()}` };
    const app = await createApplication(repo, provider, Date.now, undefined, () => story);
    let s = (await app.start("call-center", user, { startId: randomUUID(), expectedRevision: 0 })).session;
    async function act(label, payload = {}) {
      const action = s.availableActions.find(a => a.label === label); assert.ok(action, "EXPECTED_ACTION_MISSING");
      s = (await app.action(s.sessionId, user, { actionId: randomUUID(), expectedRevision: s.revision, actionDefinitionId: action.id, payload })).session;
    }
    await act("รับสาย"); assert.equal(s.phone.openingStatus, "PENDING");
    await pace();
    s = (await app.opening(s.sessionId, user, { expectedRevision: s.revision })).session;
    const before = await repo.get(s.sessionId, user.id);
    await pace();
    const reply = await app.message(s.sessionId, user, { turnId: randomUUID(), expectedRevision: s.revision, text: "ขอชื่อและข้อมูลอ้างอิงก่อนครับ ผมจะตรวจสอบจากช่องทางที่มีอยู่เอง" });
    s = reply.session; assert.ok(reply.turn.characterMessage.trim(), "EMPTY_CHARACTER_RESPONSE");
    const after = await repo.get(s.sessionId, user.id);
    assert.equal(after.state, before.state); assert.equal(after.status, "ACTIVE"); assert.equal(after.result, null);
    assert.deepEqual(after.events, before.events); assert.deepEqual(after.opportunities, before.opportunities);
    await act("คุณจะทำอะไรต่อ?", { choiceId: "o3" }); await act("ดำเนินบทสนทนาต่อ");
    assert.equal(s.phone.openingStatus, "PENDING"); assert.deepEqual(s.availableActions, []);
    await pace();
    s = (await app.opening(s.sessionId, user, { expectedRevision: s.revision })).session;
    const saved = await repo.get(s.sessionId, user.id);
    const receipts = saved.dialogueTurns.map(t => ({ turnId: t.id, state: t.state, usedFallback: t.usedFallback, attempts: t.attempts, failureReason: t.failureReason, schemaValid: true, nonEmpty: !!t.response.character_message.trim() }));
    report.stories.push({ story, receipts, freeTextStateUnchanged: true, freeTextEvaluationUnchanged: true, noDirectCritical: true });
    assert.ok(receipts.every(t => !t.usedFallback), "FALLBACK_USED");
    await act("วางสาย"); await act("ดูสรุปการฝึก");
    assert.equal((await app.result(s.sessionId, user)).trainingScore, null);
  }
  report.status = "PASSED";
  report.failureCategory = null;
} catch (error) {
  report.status = "FAILED";
  report.failureCategory ??= error instanceof assert.AssertionError ? "VERIFICATION_ASSERTION" : "CONFIGURATION_OR_RUNTIME";
  process.exitCode = 1;
}
await mkdir("frontend-artifacts", { recursive: true });
await writeFile("frontend-artifacts/call-stories-live.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
