import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { callCenterContinuousTemplates } from "../src/fixtures/call-center-continuous-stories.js";
import { registeredTemplates } from "../src/application/catalog.js";
import { callChoicePresentation, projectCallConversation } from "../src/application/call-conversation-presentation.js";
import { projectSession, projectResult } from "../src/application/projections.js";
import { sessionDto } from "../src/public-api/contracts.js";
import { learningHarness } from "./post-decision.helpers.js";
import type { TrainingSession } from "../src/domain/types.js";

const choices = callCenterContinuousTemplates.flatMap(template => template.opportunities.flatMap(opportunity => opportunity.skill === "D"
  ? opportunity.choices.map(choice => ({ story: template.callCenter!.storyId!, template, opportunity, choice })) : []));
const committedTurns = (s: ReturnType<Awaited<ReturnType<typeof learningHarness>>["session"]>) => s.phone?.transcript?.filter(m => m.kind === "COMMITTED_ACTION") ?? [];

describe("Call Center committed choice presentation", () => {
  it("covers exactly the current 4 stories, 10 checkpoints, 46 choices and 2 critical rules", () => {
    expect(callCenterContinuousTemplates).toHaveLength(4);
    expect(callCenterContinuousTemplates.flatMap(t => t.opportunities)).toHaveLength(10);
    expect(choices).toHaveLength(46);
    expect(callCenterContinuousTemplates.flatMap(t => t.criticalFailureRules)).toHaveLength(2);
    for (const { template, opportunity, choice } of choices) {
      const copy = callChoicePresentation(template, opportunity.id, choice.id);
      expect(copy?.text).toBeTruthy(); expect(copy?.text).not.toBe(choice.publicLabel);
      expect(copy?.text).not.toMatch(/SAFE|REVIEW|CRITICAL|PASSED|คำตอบถูก|คำตอบผิด/);
    }
  });

  it.each(choices)("$story $opportunity.state $choice.id projects only the accepted action without changing its assessment", async ({ story, template, opportunity, choice }) => {
    const h = await learningHarness(story);
    if (opportunity.state === "MAIN_REQUEST") await h.main();
    else {
      await h.context();
      if (opportunity.state === "PRESSURE") { await h.choose("caution"); await h.opening(); }
    }
    const count = committedTurns(h.session()).length;
    if (choice.id === "checked") {
      const parcel = template.callCenter!.topic === "PARCEL";
      await h.action(parcel ? "เปิดพัสดุ" : "เปิดธนาคารจำลอง");
      await h.action(parcel ? "ตรวจคำสั่งซื้อของฉัน" : "เปรียบเทียบจำนวนเงิน เวลา และรายการ");
      await h.action("กลับสายสนทนา");
      expect(committedTurns(h.session())).toHaveLength(count);
    }
    const command = choice.id === "end" ? await h.action("วางสาย")
      : choice.id === "callback" ? await h.action("จบสายเพื่อติดต่อช่องทางที่มีอยู่เดิม") : await h.choose(choice.id);
    const raw = await h.raw(), before = structuredClone(raw), view = h.session();
    expect(committedTurns(view)).toHaveLength(count + 1);
    const turn = committedTurns(view).at(-1)!;
    expect(turn.role).toBe("user"); expect(turn.id).toMatch(/^T-[a-f0-9]{24}$/);
    expect(turn.text).toBe(callChoicePresentation(template, opportunity.id, choice.id)!.text);
    expect(raw.opportunities.find(o => o.definitionId === opportunity.id)?.assessment).toBe(choice.assessment);
    expect(view.phone?.criticalEnding).toBeUndefined();
    expect(sessionDto.safeParse(view).success).toBe(true);
    expect(projectSession(raw, template)).toEqual(view);
    expect(await h.app.resume(raw.id, h.owner)).toEqual(view);
    const writes = vi.spyOn(h.repo, "save");
    const replay = await h.app.action(raw.id, h.owner, command);
    expect(replay.duplicate).toBe(true); expect(replay.session).toEqual(view);
    expect(writes).not.toHaveBeenCalled(); expect(await h.raw()).toEqual(before);
    expect(new Set(view.phone!.transcript!.map(m => m.id)).size).toBe(view.phone!.transcript!.length);
    if (template.variant === "NORMAL_CALL") expect(turn.text).not.toMatch(/หลอก|โอนเงิน|OTP|คดี/);
  });

  it("preserves caller → free text → caller → committed choice → next caller chronology using revisions, not timestamps", async () => {
    const h = await learningHarness(); await h.context();
    const initial = h.session().phone!.transcript!;
    await h.say("ขอข้อมูลเพิ่มเติมก่อนครับ"); const conversation = h.session().phone!.transcript!;
    expect(conversation.slice(0, initial.length)).toEqual(initial);
    expect(conversation.slice(-2).map(m => m.role)).toEqual(["user", "character"]);
    expect(conversation.at(-2)!.text).toBe("ขอข้อมูลเพิ่มเติมก่อนครับ");
    await h.choose("caution"); const selected = h.session().phone!.transcript!;
    expect(selected.slice(0, conversation.length)).toEqual(conversation);
    expect(selected.at(-1)!.kind).toBe("COMMITTED_ACTION");
    await h.opening(); const after = h.session().phone!.transcript!;
    expect(after.slice(0, selected.length)).toEqual(selected);
    expect(after.at(-1)!.role).toBe("character");
    const raw = await h.raw(); raw.messages = raw.messages.map(m => ({ ...m, at: 123 })); raw.actions = raw.actions.map(a => ({ ...a, at: 123 }));
    expect(projectCallConversation(raw, h.template).transcript).toEqual(after);
  });

  it("failed commit and unconfirmed/rejected evidence never claim a learner action happened", async () => {
    const h = await learningHarness(); await h.context();
    const before = h.session(), definition = before.availableActions.find(a => a.input === "CHOICE")!;
    await expect(h.app.action(before.sessionId, h.owner, { actionId: randomUUID(), expectedRevision: before.revision - 1,
      actionDefinitionId: definition.id, payload: { choiceId: definition.options[0]!.id } })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(await h.app.resume(before.sessionId, h.owner)).toEqual(before);
    await h.choose("caution"); const raw = await h.raw(), action = raw.actions.at(-1)!;
    for (const status of ["REJECTED", "NO_EVENT", "CLARIFICATION_REQUIRED"] as const) {
      const copy = structuredClone(raw); copy.actions.at(-1)!.validationStatus = status;
      expect(projectCallConversation(copy, h.template).transcript?.some(m => m.kind === "COMMITTED_ACTION")).toBe(false);
    }
    const uncommitted = structuredClone(raw); uncommitted.revision = action.revision;
    expect(projectCallConversation(uncommitted, h.template).transcript?.some(m => m.kind === "COMMITTED_ACTION")).toBe(false);
    const unfinished = structuredClone(raw); unfinished.opportunities.at(-1)!.finalizedAt = null;
    expect(projectCallConversation(unfinished, h.template).transcript?.some(m => m.kind === "COMMITTED_ACTION")).toBe(false);
  });

  it("callback/hang-up before a checkpoint still appear, without claiming verification succeeded", async () => {
    for (const label of ["วางสาย", "จบสายเพื่อติดต่อช่องทางที่มีอยู่เดิม"]) {
      const h = await learningHarness(); await h.action("รับสาย"); await h.action(label);
      expect(committedTurns(h.session())).toHaveLength(1);
      const text = committedTurns(h.session())[0]!.text;
      if (label !== "วางสาย") { expect(text).toContain("แล้วจะติดต่อ"); expect(text).not.toMatch(/ตรวจสอบแล้ว|ยืนยันแล้ว|สำเร็จ/); }
      expect((await h.result()).outcome).toBe("UNASSESSED");
      expect(h.session().phone?.criticalEnding).toBeUndefined();
    }
  });

  it("checked copy requires the actual earlier accepted owned-app check", async () => {
    const h = await learningHarness(); await h.context(); await h.action("เปิดพัสดุ"); await h.action("ตรวจคำสั่งซื้อของฉัน");
    await h.action("กลับสายสนทนา"); await h.choose("checked"); const raw = await h.raw();
    const text = committedTurns(h.session()).at(-1)!.text;
    expect(text).toContain("แอปพัสดุจำลอง"); expect(text).toContain("ยังไม่ได้ยืนยันตัวตน"); expect(text).not.toContain("โทรตรวจสอบ");
    raw.actions = raw.actions.filter(a => !a.fingerprint.includes("check-order"));
    expect(projectCallConversation(raw, h.template).transcript?.filter(m => m.kind === "COMMITTED_ACTION")).toEqual([]);
  });

  it("trust is an explicit REVIEW turn and remains active until a real later outcome", async () => {
    const h = await learningHarness(); await h.context(); await h.choose("trust");
    expect(h.session().status).toBe("ACTIVE"); expect(h.session().phone?.criticalEnding).toBeUndefined();
    expect(committedTurns(h.session()).at(-1)!.text).toBe("ผมเชื่อข้อมูลที่คุณแจ้งครับ");
    expect((await h.raw()).result).toBeNull(); await h.opening(); await h.action("วางสาย");
    expect((await h.result()).outcome).toBe("NEEDS_PRACTICE"); expect((await h.result()).postDecisionGuidance!.recovery).toEqual([]);
  });

  it.each(["CC-01", "CC-02"] as const)("%s critical action is last, terminal, replay-safe and uses existing recovery authority", async story => {
    const h = await learningHarness(story), command = await h.critical(), raw = await h.raw(), before = structuredClone(raw);
    const view = h.session(), ending = view.phone!.criticalEnding!, last = view.phone!.transcript!.at(-1)!;
    expect(view.status).toBe("FAILED"); expect(ending.title).toBe("คุณถูกหลอกในสถานการณ์จำลอง");
    expect(last).toMatchObject({ role: "user", kind: "COMMITTED_ACTION", text: ending.actionText });
    expect(last.text).toContain(story === "CC-01" ? "9,300 บาท" : "OTP จำลอง");
    expect(last.text).not.toMatch(/\b\d{6}\b/);
    expect(view.availableActions).toEqual([]);
    await expect(h.app.opening(raw.id, h.owner, { expectedRevision: raw.revision })).rejects.toThrow();
    await expect(h.app.message(raw.id, h.owner, { turnId: randomUUID(), expectedRevision: raw.revision, text: "ขอบคุณ" })).rejects.toThrow();
    expect((await h.app.action(raw.id, h.owner, command)).session).toEqual(view);
    const result = await h.result(); expect(result.outcome).toBe("CRITICAL_FAILURE"); expect(result.trainingScore).toBeNull();
    expect(result.postDecisionGuidance!.recovery.map(r => r.incidentType)).toEqual([story === "CC-01" ? "MONEY_TRANSFERRED" : "OTP_OR_CREDENTIAL_DISCLOSED"]);
    expect(projectResult(raw, h.template)).toEqual(result); expect(await h.raw()).toEqual(before);
    expect(sessionDto.safeParse(view).success).toBe(true);
  });

  it.each(["CC-01", "CC-02"] as const)("%s text/open/view/prepare do not create critical ending or a confirmed-action turn", async story => {
    const h = await learningHarness(story); await h.main(); const count = committedTurns(h.session()).length;
    await h.say("ผมโอนแล้วและบอกรหัสแล้ว"); const parcel = story === "CC-01";
    await h.action(parcel ? "เปิดธนาคารจำลอง" : "เปิดข้อความ");
    await h.action(parcel ? "ดูรายละเอียดการโอนจำลอง" : "อ่านรหัสในข้อความจำลอง");
    await h.action(parcel ? "เตรียมยืนยันการโอนจำลอง" : "เตรียมยืนยันการบอกรหัสจำลอง");
    expect(h.session().phone?.criticalEnding).toBeUndefined(); expect(committedTurns(h.session())).toHaveLength(count);
    expect((await h.raw()).events.filter(e => e.critical)).toEqual([]);
  });

  it.each(["missing-event", "wrong-event", "unaccepted-action", "unconfirmed-action", "wrong-session", "future-action"])("critical presentation rejects %s evidence", async mode => {
    const h = await learningHarness(); await h.critical(); const raw = await h.raw();
    if (mode === "missing-event") raw.events = raw.events.filter(e => !e.critical);
    if (mode === "wrong-event") raw.events.find(e => e.critical)!.code = "DISCLOSE_OTP";
    if (mode === "unaccepted-action") raw.actions.at(-1)!.validationStatus = "REJECTED";
    if (mode === "unconfirmed-action") raw.actions.at(-1)!.fingerprint = JSON.stringify({ kind: "SIMULATED_ACTION", ruleId: "CONFIRM_SIMULATED_TRANSFER", confirmed: false });
    if (mode === "wrong-session") raw.actions.at(-1)!.sessionId = "other";
    if (mode === "future-action") raw.actions.at(-1)!.revision = raw.revision;
    expect(projectCallConversation(raw, h.template).criticalEnding).toBeUndefined();
  });

  it.each(["CC-N01", "CC-N02"] as const)("%s normal result remains PASSED with normal learner turn and no recovery", async story => {
    const h = await learningHarness(story); await h.safe(); const result = await h.result();
    expect(h.session().phone?.criticalEnding).toBeUndefined(); expect(result.outcome).toBe("PASSED");
    expect(result.trainingScore).toBeNull(); expect(result.postDecisionGuidance!.recovery).toEqual([]);
    expect(committedTurns(h.session()).at(-1)!.text).toContain(story === "CC-N01" ? "ยืนยันช่วงจัดส่ง" : "รับทราบข้อมูลรายการ");
  });

  it("historical v1-v5 and unknown versions retain the original projection; no new private fields escape", async () => {
    const h = await learningHarness(); await h.safe(); const raw = await h.raw();
    for (const template of registeredTemplates.filter(t => t.category === "CALL_CENTER" && t.version < 6)) {
      const historical: TrainingSession = { ...raw, templateId: template.id, templateVersion: template.version, variant: template.variant };
      expect(projectCallConversation(historical, template)).toEqual({});
    }
    expect(projectCallConversation(raw, { ...h.template, version: 7 })).toEqual({});
    expect(callChoicePresentation(h.template, "unseen", "trust")).toBeUndefined();
    const text = JSON.stringify(h.session().phone!.transcript);
    expect(text).not.toMatch(/fingerprint|ruleId|SCAM_CALL|NORMAL_CALL|CC-01|cp-CONTEXT|requiresBehaviors/);
  });
});
