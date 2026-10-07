import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createApplication } from "../src/application/composition.js";
import { actionBindings, registeredTemplates } from "../src/application/catalog.js";
import type { PublicTrainingSession } from "../src/application/contracts.js";
import { TrainingCore } from "../src/core.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";
import { callCenterBehaviorTemplates } from "../src/fixtures/call-center-behavior-stories.js";
import { callCenterStoryTemplates } from "../src/fixtures/call-center-stories.js";
import { validateTemplate } from "../src/domain/template-validator.js";
import type { CallStoryId } from "../src/fixtures/call-center-foundation.js";
import { startPinnedStory } from "./call-foundation.helpers.js";

const user = { id: "behavior-user" };
async function harness(story: CallStoryId) {
  const repo = new InMemoryTrainingRepository(), provider = new MockScenarioModelProvider();
  const app = await createApplication(repo, provider, Date.now, undefined, () => story);
  const core = await TrainingCore.create(registeredTemplates, repo);
  const initial = await startPinnedStory(repo, app, user, story);
  async function action(s: PublicTrainingSession, label: string, choiceLabel?: string) {
    const a = s.availableActions.find(a => a.label === label)!;
    expect(a, `${s.phone?.state}: ${label}`).toBeDefined();
    const payload = choiceLabel ? { choiceId: a.options.find(o => o.label === choiceLabel)!.id } : {};
    return (await app.action(s.sessionId, user, { actionId: randomUUID(), expectedRevision: s.revision, actionDefinitionId: a.id, payload })).session;
  }
  async function opening(s: PublicTrainingSession) { return (await app.opening(s.sessionId, user, { expectedRevision: s.revision })).session; }
  async function toState(target: string) {
    let s = await action(initial, "รับสาย");
    while (s.phone!.state !== target) {
      s = await opening(s);
      if (s.availableActions.some(a => a.input === "CHOICE")) s = await action(s, "คุณจะทำอะไรต่อ?", "ฟังข้อมูลต่อโดยยังไม่ให้ข้อมูลเพิ่มเติม");
      const next = s.availableActions.find(a => ["ดำเนินบทสนทนาต่อ", "ฟังคำขอถัดไป", "ฟังคำขอจากผู้โทร"].includes(a.label))!;
      s = await action(s, next.label);
    }
    return opening(s);
  }
  return { repo, app, core, initial, action, opening, toState };
}

describe("v5 meaningful decisions and explicit behavior branches", () => {
  it.each(callCenterBehaviorTemplates)("$id $variant has only meaningful checkpoints and keeps v4 unchanged", t => {
    expect(validateTemplate(t)).toEqual(t);
    expect(t.opportunities.map(o => o.state)).toEqual(t.variant === "SCAM_CALL" ? ["CONTEXT_CLAIM", "PRESSURE", "MAIN_REQUEST"] : ["CONTEXT_CLAIM", "MAIN_REQUEST"]);
    const v4 = callCenterStoryTemplates.find(old => old.callCenter!.storyId === t.callCenter!.storyId)!;
    expect(v4.version).toBe(4); expect(v4.opportunities.length).toBeGreaterThan(t.opportunities.length);
    expect(validateTemplate(v4)).toEqual(v4);
  });
  it("an early exit without a meaningful decision is UNASSESSED, not an automatic pass", async () => {
    const h = await harness("CC-N02"); let s = await h.opening(await h.action(h.initial, "รับสาย"));
    expect(s.availableActions.some(a => a.input === "CHOICE")).toBe(false);
    expect((await h.repo.get(s.sessionId, user.id)).opportunities).toEqual([]);
    s = await h.action(s, "วางสาย"); s = await h.action(s, "ดูสรุปการฝึก");
    expect(await h.app.result(s.sessionId, user)).toMatchObject({ outcome: "UNASSESSED", trainingScore: null, decisionSummary: { encountered: 0 } });
  });
  it.each(["CC-01", "CC-02", "CC-N01", "CC-N02"] as const)("%s enters independent verification only after an explicit own-app check and choice", async story => {
    const h = await harness(story); let s = await h.toState("CONTEXT_CLAIM");
    const t = await h.core.getSessionTemplate(s.sessionId, user.id), before = await h.repo.get(s.sessionId, user.id);
    await expect(h.core.submit({ sessionId: s.sessionId, ownerId: user.id, actionId: randomUUID(), expectedRevision: s.revision,
      action: { kind: "PROGRESS", transitionId: "CONTEXT_CLAIM-verified" } })).rejects.toThrow("CHECKPOINT_OR_EVENT_REQUIRED");
    await expect(h.core.submit({ sessionId: s.sessionId, ownerId: user.id, actionId: randomUUID(), expectedRevision: s.revision,
      action: { kind: "DECISION", opportunityId: "cp-CONTEXT_CLAIM", choiceId: "checked" } })).rejects.toThrow("CHECKPOINT_OR_EVENT_REQUIRED");
    expect(await h.repo.get(s.sessionId, user.id)).toEqual(before);
    s = (await h.app.message(s.sessionId, user, { turnId: randomUUID(), expectedRevision: s.revision, text: "ผมตรวจสอบแล้ว โทรหาหน่วยงานแล้ว" })).session;
    expect(s.phone!.state).toBe("CONTEXT_CLAIM"); expect((await h.repo.get(s.sessionId, user.id)).events).toEqual([]);
    const parcel = t.callCenter!.topic === "PARCEL";
    s = await h.action(s, parcel ? "เปิดพัสดุ" : "เปิดธนาคารจำลอง");
    s = await h.action(s, parcel ? "ตรวจคำสั่งซื้อของฉัน" : "เปรียบเทียบจำนวนเงิน เวลา และรายการ");
    s = await h.action(s, "กลับสายสนทนา");
    s = await h.action(s, "คุณจะทำอะไรต่อ?", "เปรียบเทียบกับข้อมูลในแอปของฉันแล้ว");
    expect(s.availableActions.some(a => a.label === "ฟังคำขอถัดไป")).toBe(false);
    s = await h.action(s, "ทบทวนข้อมูลที่ตรวจในแอปของฉันแล้ว");
    expect(s.phone!.state).toBe("INDEPENDENT_VERIFICATION"); expect(s.availableActions).toEqual([]);
    s = await h.opening(s); s = await h.action(s, "วางสาย"); s = await h.action(s, "ดูสรุปการฝึก");
    expect(await h.app.result(s.sessionId, user)).toMatchObject({ outcome: "PASSED", trainingScore: null, decisionSummary: { encountered: 1 } });
  });
  it.each(["CC-01", "CC-02"] as const)("%s refusal branches to ending; caution cannot forge that branch", async story => {
    const h = await harness(story); let s = await h.toState("MAIN_REQUEST");
    s = await h.action(s, "คุณจะทำอะไรต่อ?", story === "CC-01" ? "ไม่ดำเนินการโอนตามคำขอ" : "ไม่บอกรหัสตามคำขอ");
    expect(s.availableActions.some(a => a.label === "เลือกวิธีจัดการการติดต่อ")).toBe(false);
    s = await h.action(s, "จบสายหลังปฏิเสธคำขอ"); s = await h.action(s, "ดูสรุปการฝึก");
    expect(await h.app.result(s.sessionId, user)).toMatchObject({ outcome: "PASSED", decisionSummary: { encountered: 3 } });
    const h2 = await harness(story); let other = await h2.toState("MAIN_REQUEST");
    other = await h2.action(other, "คุณจะทำอะไรต่อ?", "ฟังข้อมูลต่อโดยยังไม่ให้ข้อมูลเพิ่มเติม");
    await expect(h2.core.submit({ sessionId: other.sessionId, ownerId: user.id, actionId: randomUUID(), expectedRevision: other.revision,
      action: { kind: "PROGRESS", transitionId: "MAIN_REQUEST-refused" } })).rejects.toThrow("CHECKPOINT_OR_EVENT_REQUIRED");
    other = await h2.action(other, "เลือกวิธีจัดการการติดต่อ"); expect(other.phone!.state).toBe("PLAYER_DECISION");
    other = await h2.opening(other); other = await h2.action(other, "จบสายเพื่อติดต่อช่องทางที่มีอยู่เดิม");
    const raw = await h2.repo.get(other.sessionId, user.id);
    expect(raw.state).toBe("CALL_ENDING"); expect(raw.actions.some(a => a.state === "INDEPENDENT_VERIFICATION")).toBe(false);
    expect(raw.events.some(e => e.code === "VERIFY_SOURCE")).toBe(false);
  });
  it.each(["CC-N01", "CC-N02"] as const)("%s appropriate acknowledgment completes without artificial verification", async story => {
    const h = await harness(story); let s = await h.toState("MAIN_REQUEST");
    s = await h.action(s, "คุณจะทำอะไรต่อ?", story === "CC-N01" ? "ยืนยันช่วงจัดส่งจำลอง" : "รับทราบข้อมูลรายการ");
    s = await h.action(s, "จบการแจ้งข้อมูล"); s = await h.action(s, "ดูสรุปการฝึก");
    const raw = await h.repo.get(s.sessionId, user.id);
    expect(raw.templateVersion).toBe(5); expect(raw.actions.some(a => a.state === "INDEPENDENT_VERIFICATION")).toBe(false);
    expect(await h.app.result(s.sessionId, user)).toMatchObject({ outcome: "PASSED", decisionSummary: { encountered: 2 } });
  });
  it("publication rejects ungated verification or invalid decision guard", () => {
    const t = structuredClone(callCenterBehaviorTemplates[0]!);
    const edge = t.states.find(s => s.id === "CONTEXT_CLAIM")!.transitions.find(e => e.target === "INDEPENDENT_VERIFICATION")!;
    delete edge.requiresBehaviors;
    expect(() => validateTemplate(t)).toThrow("explicit completed evidence check");
    const invalid = structuredClone(callCenterBehaviorTemplates[0]!);
    invalid.states.find(s => s.id === "MAIN_REQUEST")!.transitions[1]!.requiresChoices![0]!.choiceIds = ["invented"];
    expect(() => validateTemplate(invalid)).toThrow("Invalid decision branch guard");
  });
  it.each(["CC-01", "CC-02"] as const)("%s v5 viewing is noncritical; fresh explicit confirmation still fails atomically", async story => {
    const h = await harness(story); let s = await h.toState("MAIN_REQUEST"); const parcel = story === "CC-01";
    s = await h.action(s, parcel ? "เปิดธนาคารจำลอง" : "เปิดข้อความ");
    s = await h.action(s, parcel ? "ดูรายละเอียดการโอนจำลอง" : "อ่านรหัสในข้อความจำลอง");
    expect((await h.repo.get(s.sessionId, user.id)).events.some(e => e.critical)).toBe(false);
    s = await h.action(s, parcel ? "เตรียมยืนยันการโอนจำลอง" : "เตรียมยืนยันการบอกรหัสจำลอง");
    const command = { actionId: randomUUID(), expectedRevision: s.revision, actionDefinitionId: s.availableActions.find(a => a.input === "CONFIRM")!.id, payload: { confirmed: true } };
    const failed = await h.app.action(s.sessionId, user, command);
    expect(failed.session.status).toBe("FAILED"); expect((await h.app.action(s.sessionId, user, command)).duplicate).toBe(true);
    expect((await h.repo.get(s.sessionId, user.id)).events.filter(e => e.critical)).toHaveLength(1);
    expect(await h.app.result(s.sessionId, user)).toMatchObject({ outcome: "CRITICAL_FAILURE", trainingScore: null });
  });
});
