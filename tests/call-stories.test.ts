import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createApplication } from "../src/application/composition.js";
import { actionBindings, registeredTemplates } from "../src/application/catalog.js";
import type { PublicTrainingSession, PublicActionPayload } from "../src/application/contracts.js";
import { TrainingCore } from "../src/core.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";
import { callCenterStoryTemplates } from "../src/fixtures/call-center-stories.js";
import type { CallStoryId } from "../src/fixtures/call-center-foundation.js";
import { validateTemplate } from "../src/domain/template-validator.js";
import { demoCallStory } from "../src/server/call-story.js";
import { sessionDto, resultDto } from "../src/public-api/contracts.js";
import { answer, deferred } from "./openai.fixtures.js";

const user = { id: "story-user" };
async function harness(story: CallStoryId) {
  const repo = new InMemoryTrainingRepository(), provider = new MockScenarioModelProvider();
  const app = await createApplication(repo, provider, Date.now, undefined, () => story);
  const session = (await app.start("call-center", user, { startId: randomUUID(), expectedRevision: 0 })).session;
  const core = await TrainingCore.create(registeredTemplates, repo);
  async function action(s: PublicTrainingSession, label: string, payload: PublicActionPayload = {}) {
    const definition = s.availableActions.find(a => a.label === label);
    expect(definition, `${s.phone?.state}: ${label}`).toBeDefined();
    return (await app.action(s.sessionId, user, { actionId: randomUUID(), expectedRevision: s.revision, actionDefinitionId: definition!.id, payload })).session;
  }
  async function opening(s: PublicTrainingSession) { return (await app.opening(s.sessionId, user, { expectedRevision: s.revision })).session; }
  async function toState(target: string) {
    let s = await action(session, "รับสาย");
    expect(provider.callCount).toBe(0);
    while (s.phone!.state !== target) {
      expect(s.availableActions).toEqual([]); s = await opening(s);
      s = await action(s, "คุณจะทำอะไรต่อ?", { choiceId: "o3" });
      s = await action(s, "ดำเนินบทสนทนาต่อ");
    }
    return s;
  }
  return { app, repo, core, session, provider, action, opening, toState };
}

describe("full immutable Call Center stories", () => {
  it("valid exact override ignores even invalid legacy configuration", () => {
    expect(demoCallStory({ CALL_CENTER_DEMO_STORY: "CC-02", CALL_CENTER_DEMO_VARIANT: "PRIVATE_INVALID" })!()).toBe("CC-02");
    expect(() => demoCallStory({ CALL_CENTER_DEMO_VARIANT: "PRIVATE_INVALID" })).toThrow("Invalid CALL_CENTER_DEMO_VARIANT");
  });
  it.each(callCenterStoryTemplates)("validates v4 $variant $id with explicit state metadata", t => {
    expect(validateTemplate(t)).toEqual(t);
    const invalid = structuredClone(t); delete invalid.states[1]!.callerTurnRequired;
    expect(() => validateTemplate(invalid)).toThrow("explicit beat metadata");
  });
  it.each(["CC-01", "CC-02", "CC-N01", "CC-N02"] as const)("%s caller-first safe complete path and reflection", async story => {
    const h = await harness(story);
    const raw = await h.repo.get(h.session.sessionId, user.id);
    expect(raw.templateVersion).toBe(4);
    expect(sessionDto.parse(h.session)).toEqual(h.session);
    expect(JSON.stringify(h.session)).not.toMatch(/CC-N?0|SCAM_CALL|NORMAL_CALL|call-center-parcel|call-center-bank/);
    let s = await h.toState("MAIN_REQUEST");
    expect(s.availableActions).toEqual([]); expect(s.phone!.availableInternalApps).toEqual([]); expect(s.phone!.appData).toEqual({});
    s = await h.opening(s);
    const before = await h.repo.get(s.sessionId, user.id);
    s = (await h.app.message(s.sessionId, user, { turnId: randomUUID(), expectedRevision: s.revision, text: "ขอข้อมูลอ้างอิงก่อนครับ" })).session;
    const after = await h.repo.get(s.sessionId, user.id);
    expect(after.state).toBe(before.state); expect(after.events).toEqual(before.events); expect(after.opportunities).toEqual(before.opportunities);
    s = await h.action(s, "วางสาย"); s = await h.action(s, "ดูสรุปการฝึก");
    const result = await h.app.result(s.sessionId, user);
    expect(resultDto.parse(result)).toEqual(result);
    expect(result).toMatchObject({ outcome: "PASSED", trainingScore: null, D: null, W: null, S: null, decisionSummary: { unassessed: 0, critical: 0 } });
    expect(result.decisionSummary!.encountered).toBeGreaterThan(0);
    expect(result.callReflection!.behaviorTimeline[0]!.label).toBe("รับสาย");
    expect(result.callReflection!.behaviorTimeline.at(-1)!.label).toBe("วางสาย");
    expect(result.callReflection!.behaviorTimeline.map(b => b.elapsedSeconds)).toEqual([...result.callReflection!.behaviorTimeline.map(b => b.elapsedSeconds)].sort((a,b) => a-b));
    if (story === "CC-N02") expect(result.callReflection!.note).toContain("ตัวอย่างสายธนาคารปกติในสถานการณ์จำลอง");
  });
  it.each(["CC-01", "CC-02"] as const)("%s app/view/text are noncritical; fresh explicit confirmation is critical", async story => {
    const h = await harness(story); let s = await h.toState("MAIN_REQUEST");
    const t = await h.core.getSessionTemplate(s.sessionId, user.id);
    const future = actionBindings(t).find(b => b.public.label === (story === "CC-01" ? "เปิดธนาคารจำลอง" : "เปิดข้อความ") && b.state === "MAIN_REQUEST")!;
    await expect(h.app.action(s.sessionId, user, { actionId: "early-app", expectedRevision: s.revision, actionDefinitionId: future.public.id, payload: {} })).rejects.toThrow("CALL_NOT_READY");
    s = await h.opening(s);
    const otp = s.phone!.appData?.MESSAGES?.lines[0]?.match(/\d{6}/)?.[0];
    if (story === "CC-02") {
      expect(otp).toMatch(/^\d{6}$/); expect((await h.app.resume(s.sessionId, user)).phone!.appData!.MESSAGES!.lines[0]).toContain(otp!);
      s = (await h.app.message(s.sessionId, user, { turnId: randomUUID(), expectedRevision: s.revision, text: `เขาขอรหัส ${otp}` })).session;
      expect(s.status).toBe("ACTIVE"); expect(s.messages.at(-2)!.text).not.toContain(otp!);
    }
    s = await h.action(s, story === "CC-01" ? "เปิดธนาคารจำลอง" : "เปิดข้อความ");
    expect(s.phone!.activeApp).toBe(story === "CC-01" ? "BANK" : "MESSAGES");
    expect(s.status).toBe("ACTIVE"); expect(s.availableActions.some(a => a.input === "CONFIRM")).toBe(false);
    s = await h.action(s, story === "CC-01" ? "ดูรายละเอียดการโอนจำลอง" : "อ่านรหัสในข้อความจำลอง");
    expect((await h.repo.get(s.sessionId, user.id)).events.filter(e => e.critical)).toEqual([]);
    s = await h.action(s, story === "CC-01" ? "เตรียมยืนยันการโอนจำลอง" : "เตรียมยืนยันการบอกรหัสจำลอง");
    const critical = s.availableActions.find(a => a.input === "CONFIRM")!;
    const command = { actionId: "explicit-critical", expectedRevision: s.revision, actionDefinitionId: critical.id, payload: { confirmed: true } };
    s = (await h.app.action(s.sessionId, user, command)).session;
    expect(s.status).toBe("FAILED"); expect((await h.app.action(s.sessionId, user, command)).duplicate).toBe(true);
    const result = await h.app.result(s.sessionId, user);
    expect(result).toMatchObject({ outcome: "CRITICAL_FAILURE", trainingScore: null, decisionSummary: { critical: 1 } });
    expect((await h.repo.get(s.sessionId, user.id)).events.filter(e => e.critical)).toHaveLength(1);
  });
  it.each(["CC-N01", "CC-N02"] as const)("%s normal app boundaries, verification and reasonable callback", async story => {
    const h = await harness(story); let s = await h.toState("CONTEXT_CLAIM"); s = await h.opening(s);
    expect(s.phone!.availableInternalApps.some(a => a.id === "MESSAGES")).toBe(false);
    expect(s.availableActions.some(a => a.input === "CONFIRM")).toBe(false);
    s = await h.action(s, story === "CC-N01" ? "เปิดพัสดุ" : "เปิดธนาคารจำลอง");
    s = await h.action(s, story === "CC-N01" ? "ตรวจคำสั่งซื้อของฉัน" : "เปรียบเทียบจำนวนเงิน เวลา และรายการ");
    s = await h.action(s, "กลับสายสนทนา");
    expect(s.availableActions.find(a => a.input === "CHOICE")!.options.some(o => o.label === "เปรียบเทียบกับข้อมูลในแอปของฉันแล้ว")).toBe(true);
    s = await h.action(s, "จบสายเพื่อติดต่อช่องทางที่มีอยู่เดิม"); s = await h.action(s, "ดูสรุปการฝึก");
    expect((await h.app.result(s.sessionId, user)).outcome).toBe("PASSED");
    const t = await h.core.getSessionTemplate(s.sessionId, user.id);
    expect(t.criticalFailureRules).toEqual([]); expect(t.states.some(s => s.id === "PRESSURE")).toBe(false);
    expect(t.states.flatMap(s => s.allowedBehaviors).join(" ")).not.toMatch(/ขอให้โอน|ขอให้บอกรหัส|เก็บเรื่องนี้เป็นความลับ|รีบทำตาม/);
  });
  it("state-turn concurrent retry commits exactly one turn and checkpoint", async () => {
    const h = await harness("CC-02"), s = await h.toState("MAIN_REQUEST");
    const replies = await Promise.all([h.app.opening(s.sessionId, user, { expectedRevision: s.revision }), h.app.opening(s.sessionId, user, { expectedRevision: s.revision })]);
    expect(replies.map(r => r.duplicate).sort()).toEqual([false, true]);
    expect((await h.app.opening(s.sessionId, user, { expectedRevision: s.revision })).duplicate).toBe(true);
    const raw = await h.repo.get(s.sessionId, user.id);
    expect(raw.dialogueTurns.filter(t => t.state === "MAIN_REQUEST")).toHaveLength(1);
    expect(raw.opportunities.filter(o => o.state === "MAIN_REQUEST")).toHaveLength(1);
  });
  it("required checkpoint cannot be skipped; revision conflicts have no partial write", async () => {
    const h = await harness("CC-01"); const pending = await h.action(h.session, "รับสาย"); const s = await h.opening(pending);
    const t = await h.core.getSessionTemplate(s.sessionId, user.id), next = actionBindings(t).find(b => b.state === "CALL_CONNECTED" && b.public.label === "ดำเนินบทสนทนาต่อ")!;
    await expect(h.app.action(s.sessionId, user, { actionId: "skip", expectedRevision: s.revision, actionDefinitionId: next.public.id, payload: {} })).rejects.toThrow("CHECKPOINT_OR_EVENT_REQUIRED");
    const command = { actionId: "first", expectedRevision: s.revision, actionDefinitionId: s.availableActions.find(a => a.input === "CHOICE")!.id, payload: { choiceId: "o3" } };
    await h.app.action(s.sessionId, user, command); const before = await h.repo.get(s.sessionId, user.id);
    await expect(h.app.action(s.sessionId, user, { ...command, actionId: "second" })).rejects.toThrow("REVISION_CONFLICT");
    expect(await h.repo.get(s.sessionId, user.id)).toEqual(before);
  });
  it("a confirmation prepared before intervening dialogue is stale, even with a fresh request revision", async () => {
    const h = await harness("CC-02"); let s = await h.opening(await h.toState("MAIN_REQUEST"));
    s = await h.action(s, "เปิดข้อความ"); s = await h.action(s, "อ่านรหัสในข้อความจำลอง"); s = await h.action(s, "เตรียมยืนยันการบอกรหัสจำลอง");
    const critical = s.availableActions.find(a => a.input === "CONFIRM")!;
    s = (await h.app.message(s.sessionId, user, { turnId: randomUUID(), expectedRevision: s.revision, text: "ขอถามอีกเรื่องก่อน" })).session;
    const before = await h.repo.get(s.sessionId, user.id);
    await expect(h.app.action(s.sessionId, user, { actionId: "stale-preparation", expectedRevision: s.revision, actionDefinitionId: critical.id, payload: { confirmed: true } })).rejects.toThrow();
    expect(await h.repo.get(s.sessionId, user.id)).toEqual(before); expect(s.availableActions.some(a => a.input === "CONFIRM")).toBe(false);
  });
  it("review behavior is retained after a later safe hangup, not converted to automatic pass", async () => {
    const h = await harness("CC-01"); let s = await h.opening(await h.toState("MAIN_REQUEST"));
    const choice = s.availableActions.find(a => a.input === "CHOICE")!;
    s = await h.action(s, choice.label, { choiceId: choice.options.find(o => o.label === "เชื่อคำกล่าวอ้างโดยยังไม่ได้ตรวจสอบ")!.id });
    s = await h.action(s, "วางสาย"); s = await h.action(s, "ดูสรุปการฝึก");
    expect((await h.app.result(s.sessionId, user)).outcome).toBe("NEEDS_PRACTICE");
  });
  it("failed caller-state commit is recoverable without partial exposure", async () => {
    const h = await harness("CC-01"), s = await h.toState("MAIN_REQUEST");
    const save = vi.spyOn(h.repo, "save").mockRejectedValueOnce(new Error("SYNTHETIC_FAILURE"));
    await expect(h.app.opening(s.sessionId, user, { expectedRevision: s.revision })).rejects.toThrow("SYNTHETIC_FAILURE");
    expect(await h.app.resume(s.sessionId, user)).toEqual(s); save.mockRestore();
    expect((await h.opening(s)).phone!.openingStatus).toBe("READY");
  });
  it("state fallback commits the authored request and opens only that beat's contextual apps", async () => {
    const h = await harness("CC-02"), pending = await h.toState("MAIN_REQUEST");
    const generate = vi.spyOn(h.provider, "generateCharacterResponse").mockRejectedValue(new Error("SYNTHETIC_PROVIDER_FAILURE"));
    const s = await h.opening(pending), raw = await h.repo.get(s.sessionId, user.id);
    expect(s.phone!.openingStatus).toBe("READY"); expect(s.phone!.availableInternalApps.some(a => a.id === "MESSAGES")).toBe(true);
    expect(raw.dialogueTurns.at(-1)).toMatchObject({ state: "MAIN_REQUEST", usedFallback: true, failureReason: "ERROR", attempts: 2 });
    expect(raw.events.filter(e => e.critical)).toEqual([]); generate.mockRestore();
  });
  it.each(["CC-N01", "CC-N02"] as const)("%s full normal acknowledgment path needs real encountered decisions", async story => {
    const h = await harness(story); let s = await h.opening(await h.toState("MAIN_REQUEST"));
    const choice = s.availableActions.find(a => a.input === "CHOICE")!;
    const label = story === "CC-N01" ? "ให้เฉพาะข้อมูลจำเป็นต่อการจัดส่ง" : "รับทราบข้อมูลรายการ";
    s = await h.action(s, choice.label, { choiceId: choice.options.find(o => o.label === label)!.id });
    s = await h.action(s, "ดำเนินบทสนทนาต่อ");
    while (s.phone!.callStatus === "CONNECTED") {
      s = await h.opening(s); s = await h.action(s, "คุณจะทำอะไรต่อ?", { choiceId: "o3" }); s = await h.action(s, "ดำเนินบทสนทนาต่อ");
    }
    s = await h.action(s, "ดูสรุปการฝึก"); const result = await h.app.result(s.sessionId, user);
    expect(result).toMatchObject({ outcome: "PASSED", trainingScore: null, decisionSummary: { unassessed: 0, critical: 0 } });
    expect(result.callReflection!.behaviorTimeline.some(item => item.label === (story === "CC-N01" ? "จำกัดข้อมูลที่ให้" : "รับทราบรายการ"))).toBe(true);
  });
  it("slow caller provider cannot block Answer; high-confidence candidate cannot fail", async () => {
    const repo = new InMemoryTrainingRepository(), late = deferred<ReturnType<typeof answer>>();
    const generate = vi.fn(() => late.promise);
    const app = await createApplication(repo, { generateCharacterResponse: generate }, Date.now, undefined, () => "CC-02");
    let s = (await app.start("call-center", user, { startId: randomUUID(), expectedRevision: 0 })).session;
    s = (await app.action(s.sessionId, user, { actionId: "answer", expectedRevision: 0, actionDefinitionId: s.availableActions[0]!.id, payload: {} })).session;
    expect(s.phone).toMatchObject({ callStatus: "CONNECTED", openingStatus: "PENDING" }); expect(generate).not.toHaveBeenCalled();
    const work = app.opening(s.sessionId, user, { expectedRevision: s.revision });
    late.resolve(answer({ candidate_event: "POSSIBLE_CRITICAL_FAILURE", event_code: "DISCLOSE_OTP", confidence: 1 }));
    await work; const raw = await repo.get(s.sessionId, user.id);
    expect(raw.status).toBe("ACTIVE"); expect(raw.events).toEqual([]); expect(raw.result).toBeNull(); expect(raw.dialogueTurns[0]!.candidateStatus).toBe("REJECTED");
  });
});
