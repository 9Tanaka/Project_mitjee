// Real Groq semantic verification, all stories even after failure; no provider bodies/keys logged.
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
let lastAt = 0;
async function pace() {
  if (process.argv.includes("--paced")) await new Promise(r => setTimeout(r, Math.max(0, 30000 - (Date.now() - lastAt))));
  lastAt = Date.now();
}
const report = await runAllCallStories(async story => {
  const turns = [], failures = [];
  try {
    assert.equal(process.env.AI_PROVIDER, "groq"); const actual = createScenarioProvider(process.env);
    const provider = { async generateCharacterResponse(c, options) {
      try { return await actual.generateCharacterResponse(c, options); }
      catch (e) { failures.push({ state: c.currentState, category: e instanceof GroqProviderError ? e.category : "PROVIDER_ERROR",
        ...(e instanceof GroqProviderError && e.detail ? { detail: e.detail } : {}) }); throw e; }
    } };
    const repo = new InMemoryTrainingRepository(), owner = { id: randomUUID() };
    const app = await createApplication(repo, provider, Date.now, undefined, () => story);
    let s = (await app.start("call-center", owner, { startId: randomUUID(), expectedRevision: 0 })).session;
    async function act(a, payload = {}) { s = (await app.action(s.sessionId, owner, { actionId: randomUUID(), expectedRevision: s.revision, actionDefinitionId: a.id, payload })).session; }
    await act(s.availableActions.find(a => a.label === "รับสาย"));
    for (let step = 0; step < 24 && s.status === "ACTIVE"; step++) {
      assert.ok(!s.availableActions.some(a => /ดำเนินบทสนทนาต่อ|ฟังคำขอ/.test(a.label)));
      if (s.phone.openingStatus === "PENDING") { await pace(); s = (await app.opening(s.sessionId, owner, { expectedRevision: s.revision })).session; }
      else if (s.phone.contextualDecision) {
        const a = s.availableActions.find(a => s.phone.contextualDecision.actionIds.includes(a.id));
        const label = s.phone.state !== "MAIN_REQUEST" ? "ฟังข้อมูลต่อโดยยังไม่ให้ข้อมูลเพิ่มเติม" : story === "CC-01" ? "ไม่ดำเนินการโอนตามคำขอ" : story === "CC-02" ? "ไม่บอกรหัสตามคำขอ" : story === "CC-N01" ? "ยืนยันช่วงจัดส่งจำลอง" : "รับทราบข้อมูลรายการ";
        await act(a, { choiceId: a.options.find(o => o.label === label).id });
      } else {
        const before = await repo.get(s.sessionId, owner.id);
        await pace();
        s = (await app.message(s.sessionId, owner, { turnId: randomUUID(), expectedRevision: s.revision, text: "ขอชื่อและเลขอ้างอิงหน่อยครับ ขอรายละเอียดเพิ่มเติมก่อน" })).session;
        const after = await repo.get(s.sessionId, owner.id);
        assert.deepEqual(after.events, before.events); assert.equal(after.result, null);
        assert.ok(after.opportunities.every(o => o.finalizedAt === null));
      }
    }
    const raw = await repo.get(s.sessionId, owner.id);
    for (const t of raw.dialogueTurns) turns.push({ state: t.state, signal: t.response.interaction_signal,
      conversationStatus: t.response.conversation_status, usedFallback: t.usedFallback, attempts: t.attempts, failureReason: t.failureReason });
    assert.equal(s.status, "COMPLETED"); assert.equal(raw.result.outcome, "PASSED");
    return { status: turns.every(t => !t.usedFallback && t.failureReason === null) ? "PASSED" : "FAILED", turns, failures };
  } catch { return { status: "FAILED", failureCategory: "VERIFICATION_OR_RUNTIME_FAILURE", turns, failures }; }
});
report.scope = "Real Groq + in-memory Core; not deployed Auth/MySQL/browser or live Azure";
await mkdir("frontend-artifacts/call-ux", { recursive: true });
await writeFile("frontend-artifacts/call-ux/live.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report)); if (report.status !== "PASSED") process.exitCode = 1;
