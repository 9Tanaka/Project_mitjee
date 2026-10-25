import { describe, expect, it, vi } from "vitest";
import { callCenterLearningContent, type CallCenterLearningContent } from "../src/fixtures/call-center-learning-content.js";
import { callCenterContinuousTemplates } from "../src/fixtures/call-center-continuous-stories.js";
import { registeredTemplates } from "../src/application/catalog.js";
import { validateCallLearningContent, projectPostDecisionGuidance } from "../src/application/post-decision-guidance.js";
import { projectResult } from "../src/application/projections.js";
import { resultDto } from "../src/public-api/contracts.js";
import { normalMockResponse } from "../src/dialogue/mock-provider.js";
import { learningHarness } from "./post-decision.helpers.js";
import { startPinnedStory } from "./call-foundation.helpers.js";

describe("authored Call Center learning content", () => {
  it.each(callCenterLearningContent)("$contentId covers every exact v6 checkpoint/choice/rule and is deeply frozen", content => {
    expect(() => validateCallLearningContent(content)).not.toThrow();
    expect(Object.isFrozen(content)).toBe(true); expect(Object.isFrozen(content.checkpoints[0]!.choices)).toBe(true);
    expect(() => { content.contentVersion++; }).toThrow();
    const template = callCenterContinuousTemplates.find(t => t.id === content.binding.templateId && t.variant === content.binding.variant)!;
    expect(content.checkpoints.map(c => c.checkpointId)).toEqual(template.opportunities.map(o => o.id));
    expect(content.recovery).toHaveLength(template.criticalFailureRules.length);
    expect(content.sources.every(s => s.reviewedAt === "2026-10-25")).toBe(true);
  });
  it.each([
    (c: CallCenterLearningContent) => { c.binding.templateId = "unknown"; },
    (c: CallCenterLearningContent) => { c.binding.templateVersion = 7; },
    (c: CallCenterLearningContent) => { c.binding.variant = "NORMAL_CALL"; },
    (c: CallCenterLearningContent) => { c.checkpoints[0]!.checkpointId = "unknown"; },
    (c: CallCenterLearningContent) => { c.checkpoints[0]!.choices.unknown = "unknown"; },
    (c: CallCenterLearningContent) => { delete c.checkpoints[0]!.choices.caution; },
    (c: CallCenterLearningContent) => { c.recovery[0]!.ruleId = "unknown"; },
    (c: CallCenterLearningContent) => { c.recovery[0]!.eventCode = "DISCLOSE_OTP"; },
    (c: CallCenterLearningContent) => { c.recovery[0]!.incidentType = "OTP_OR_CREDENTIAL_DISCLOSED"; },
    (c: CallCenterLearningContent) => { c.tutorials[0]!.signal = "OTP_REQUEST"; },
    (c: CallCenterLearningContent) => { c.sources[0]!.url = "https://untrusted.example/"; },
    (c: CallCenterLearningContent) => { c.reviewedAt = "unknown"; },
  ])("rejects unknown or incompatible content references %#", mutate => {
    const copy = structuredClone(callCenterLearningContent[0]!); mutate(copy);
    expect(() => validateCallLearningContent(copy)).toThrow("INVALID_CALL_LEARNING_CONTENT");
  });
});

describe("read-only post-decision projection", () => {
  it.each(["CC-01", "CC-02", "CC-N01", "CC-N02"] as const)("%s safe path keeps existing assessments and filters the actual caller beats", async story => {
    const h = await learningHarness(story); await h.safe(); const raw = await h.raw(), before = structuredClone(raw), r = await h.result();
    expect(r.outcome).toBe("PASSED"); expect([r.D, r.W, r.S, r.trainingScore]).toEqual([null, null, null, null]);
    expect(r.postDecisionGuidance!.recovery).toEqual([]);
    expect(r.postDecisionGuidance!.checkpoints.map(({ ruleRef, label, assessment, explanation }) => ({ ruleRef, label, assessment, explanation }))).toEqual(r.decisionSummary!.checkpoints);
    expect(r.postDecisionGuidance!.checkpoints.every(c => c.assessment === "SAFE" && c.selectedAction && c.saferAlternative)).toBe(true);
    expect(raw).toEqual(before); expect(resultDto.safeParse(r).success).toBe(true);
    if (story.includes("N")) {
      expect(r.postDecisionGuidance!.tutorial).toHaveLength(2);
      expect(JSON.stringify(r.postDecisionGuidance)).not.toMatch(/OTP|โอนเงิน|ความลับ|การเร่งให้ตัดสินใจ/);
    } else expect(r.postDecisionGuidance!.tutorial).toHaveLength(3);
  });
  it("early context exit exposes neither pressure nor final-request content and callback never claims completed verification", async () => {
    const h = await learningHarness(); await h.context(); await h.action("จบสายเพื่อติดต่อช่องทางที่มีอยู่เดิม");
    const r = await h.result(), g = r.postDecisionGuidance!;
    expect(g.tutorial).toHaveLength(1); expect(g.recovery).toEqual([]);
    expect(JSON.stringify(g)).not.toMatch(/9,300|OTP|คำขอให้โอน|คำขอให้เก็บ|การเร่งให้/);
    expect(g.checkpoints[0]!.selectedAction).toBe("ตรวจผ่านช่องทางที่มีอยู่เดิม");
    expect(g.checkpoints[0]!.explanation).toContain("ยังไม่ได้ยืนยัน"); expect(g.checkpoints[0]!.saferAlternative).toContain("ยังไม่ยืนยัน");
    expect((await h.raw()).events.some(e => e.code === "VERIFY_SOURCE")).toBe(false);
  });
  it("early exit without any meaningful checkpoint is UNASSESSED and reveals no future content", async () => {
    const h = await learningHarness(); await h.action("รับสาย"); await h.action("วางสาย"); const r = await h.result();
    expect(r.outcome).toBe("UNASSESSED"); expect(r.postDecisionGuidance).toMatchObject({ checkpoints: [], tutorial: [], recovery: [] });
    expect(JSON.stringify(r.postDecisionGuidance)).not.toMatch(/OTP|โอนเงิน|คดี/);
  });
  it("trust remains REVIEW/NEEDS_PRACTICE, caution remains SAFE, neither triggers recovery", async () => {
    const h = await learningHarness(); await h.context(); await h.choose("trust"); await h.opening(); await h.action("วางสาย");
    const r = await h.result(); expect(r.outcome).toBe("NEEDS_PRACTICE");
    expect(r.postDecisionGuidance!.checkpoints.some(c => c.assessment === "REVIEW" && c.selectedAction === "เชื่อคำกล่าวอ้างโดยยังไม่ได้ตรวจสอบ")).toBe(true);
    expect(r.postDecisionGuidance!.recovery).toEqual([]);
  });
  it.each(["CC-01", "CC-02"] as const)("%s exact explicit critical action opens only its recovery, never contradictory unassessed feedback", async story => {
    const h = await learningHarness(story); const command = await h.critical(); const r = await h.result();
    expect(r.outcome).toBe("CRITICAL_FAILURE"); expect(r.trainingScore).toBeNull();
    expect(r.postDecisionGuidance!.recovery.map(c => c.incidentType)).toEqual([story === "CC-01" ? "MONEY_TRANSFERRED" : "OTP_OR_CREDENTIAL_DISCLOSED"]);
    const checkpoints = r.postDecisionGuidance!.checkpoints;
    expect(checkpoints.filter(c => c.assessment === "CRITICAL")).toHaveLength(1);
    expect(checkpoints.some(c => c.assessment === "UNASSESSED")).toBe(false);
    expect(checkpoints.at(-1)!.selectedAction).toContain(story === "CC-01" ? "โอนเงินจำลอง" : "บอกรหัสจำลอง");
    const writes = vi.spyOn(h.repo, "save"), raw = await h.raw(), before = structuredClone(raw);
    expect(await h.result()).toEqual(r); expect(projectResult(raw, h.template)).toEqual(r);
    expect(writes).not.toHaveBeenCalled(); expect(raw).toEqual(before);
    expect((await h.app.action(raw.id, h.owner, command)).duplicate).toBe(true);
    expect(await h.result()).toEqual(r); expect((await h.raw()).events.filter(e => e.critical)).toHaveLength(1);
    expect(writes).not.toHaveBeenCalled();
  });
  it.each(["CC-01", "CC-02"] as const)("%s free text/high-confidence candidate and open/view/prepare do not imply harm", async story => {
    const h = await learningHarness(story, { async generateCharacterResponse(c) { return { ...normalMockResponse(c), candidate_event: "POSSIBLE_CRITICAL_FAILURE", event_code: story === "CC-01" ? "CONFIRM_UNVERIFIED_TRANSFER" : "DISCLOSE_OTP", confidence: 1 }; } });
    await h.main(); await h.say("ผมโอนแล้วและบอกรหัสแล้ว"); const parcel = story === "CC-01";
    await h.action(parcel ? "เปิดธนาคารจำลอง" : "เปิดข้อความ");
    await h.action(parcel ? "ดูรายละเอียดการโอนจำลอง" : "อ่านรหัสในข้อความจำลอง");
    await h.action(parcel ? "เตรียมยืนยันการโอนจำลอง" : "เตรียมยืนยันการบอกรหัสจำลอง");
    await h.action("วางสาย"); expect((await h.result()).postDecisionGuidance!.recovery).toEqual([]);
    expect((await h.raw()).events.filter(e => e.critical)).toEqual([]);
  });
  it("an authored fallback committed with a valid signal teaches only that signal, not a missing secrecy beat", async () => {
    const h = await learningHarness("CC-02", { async generateCharacterResponse() { throw new Error("TEST_PROVIDER_FAILURE"); } });
    await h.safe(); const raw = await h.raw(), r = await h.result();
    expect(raw.dialogueTurns.every(t => t.usedFallback)).toBe(true);
    expect(r.postDecisionGuidance!.tutorial.some(t => t.title === "การเร่งให้ตัดสินใจ")).toBe(true);
    expect(JSON.stringify(r.postDecisionGuidance)).not.toContain("ความลับ");
  });
  it("requires committed matching caller messages and allowed state/signals, never wording", async () => {
    const h = await learningHarness(); await h.safe(); const raw = await h.raw();
    const context = raw.dialogueTurns.find(t => t.state === "CONTEXT_CLAIM")!;
    raw.messages = raw.messages.filter(m => m.turnId !== context.id);
    expect(projectPostDecisionGuidance(raw, h.template)!.tutorial.some(t => t.title === "การตรวจข้อมูลพัสดุ")).toBe(false);
    raw.dialogueTurns.forEach(t => { t.response.character_message = "OTP โอนเงิน ความลับ"; t.response.interaction_signal = "OTP_REQUEST"; });
    expect(projectPostDecisionGuidance(raw, h.template)!.tutorial).toEqual([]);
  });
  it("a receipt beyond the committed session revision cannot expose tutorial content", async () => {
    const h = await learningHarness(); await h.safe(); const raw = await h.raw();
    raw.dialogueTurns.forEach(turn => { turn.committedRevision = raw.revision + 1; });
    expect(projectPostDecisionGuidance(raw, h.template)!.tutorial).toEqual([]);
  });
  it("checked remains SAFE after actual owned-app verification without claiming an external call", async () => {
    const h = await learningHarness(); await h.context(); await h.action("เปิดพัสดุ"); await h.action("ตรวจคำสั่งซื้อของฉัน");
    await h.action("กลับสายสนทนา"); await h.choose("checked"); await h.opening(); await h.action("วางสาย"); const r = await h.result();
    expect(r.postDecisionGuidance!.checkpoints[0]).toMatchObject({ assessment: "SAFE", selectedAction: "เปรียบเทียบกับข้อมูลในแอปของฉันแล้ว" });
    expect(r.postDecisionGuidance!.checkpoints[0]!.saferAlternative).toContain("ไม่ใช่การโทรยืนยัน");
  });
  it.each(["confirm", "reschedule", "limit"])("normal delivery %s remains SAFE", async choice => {
    const h = await learningHarness("CC-N01"); await h.main(); await h.choose(choice);
    expect((await h.result()).postDecisionGuidance!.checkpoints.at(-1)!.assessment).toBe("SAFE");
  });
  it.each(["authority", "action", "rule", "confirmed", "variant"])("rejects incomplete or mismatched harm evidence: %s", async field => {
    const h = await learningHarness(); await h.critical(); const raw = await h.raw(), event = raw.events.find(e => e.critical)!;
    if (field === "authority") Object.assign(event, { authority: "AI" });
    if (field === "action") raw.actions = raw.actions.filter(a => a.id !== event.actionId);
    if (field === "rule") event.ruleId = "SHARE_SIMULATED_OTP";
    if (field === "confirmed") raw.actions.find(a => a.id === event.actionId)!.fingerprint = JSON.stringify({ kind: "SIMULATED_ACTION", ruleId: event.ruleId, confirmed: false });
    if (field === "variant") raw.variant = "NORMAL_CALL";
    expect(projectPostDecisionGuidance(raw, h.template)?.recovery ?? []).toEqual([]);
  });
  it("outcome alone cannot trigger recovery and does not suppress independently confirmed harm", async () => {
    const h = await learningHarness(); await h.safe(); const safe = await h.raw(); safe.result!.outcome = "CRITICAL_FAILURE";
    expect(projectPostDecisionGuidance(safe, h.template)!.recovery).toEqual([]);
    const failed = await learningHarness(); await failed.critical(); const raw = await failed.raw(); raw.result!.outcome = "PASSED";
    expect(projectPostDecisionGuidance(raw, failed.template)!.recovery).toHaveLength(1);
  });
  it.each([3, 4, 5])("historical v%s results keep their old DTO, without guidance or latest-content substitution", async version => {
    const h = await learningHarness(); h.set(await startPinnedStory(h.repo, h.app, h.owner, "CC-01", version));
    await h.action("รับสาย"); await h.opening();
    if (version === 3) {
      await h.action("พิจารณาข้อมูลผู้โทร");
      let choice = h.session().availableActions.find(a => a.input === "CHOICE")!;
      await h.action(choice.label, { choiceId: choice.options[0]!.id });
      await h.action("ไปขั้นตอนตรวจสอบ");
      choice = h.session().availableActions.find(a => a.input === "CHOICE")!;
      await h.action(choice.label, { choiceId: choice.options[0]!.id });
    }
    await h.action("วางสาย"); await h.action("ดูสรุปการฝึก");
    const raw = await h.raw(), old = registeredTemplates.find(t => t.id === raw.templateId && t.version === version && t.variant === raw.variant)!;
    const projected = projectResult(raw, old); expect(projected).not.toHaveProperty("postDecisionGuidance");
    expect(await h.result()).toEqual(projected); expect(raw.templateVersion).toBe(version);
    expect(resultDto.safeParse(projected).success).toBe(true);
  });
  it("wrong-owner result access is rejected at the unchanged application boundary", async () => {
    const h = await learningHarness(); await h.safe(); const before = await h.raw();
    await expect(h.app.result(before.id, { id: "another-owner" })).rejects.toThrow("SESSION_NOT_FOUND");
    expect(await h.raw()).toEqual(before);
  });
  it.each(["ACTIVE", "ABANDONED", "EXPIRED"] as const)("%s never manufactures a result or guidance", async status => {
    const h = await learningHarness(); await h.safe(); const raw = await h.raw(); raw.status = status;
    expect(projectPostDecisionGuidance(raw, h.template)).toBeUndefined(); expect(() => projectResult(raw, h.template)).toThrow("RESULT_NOT_FOUND");
  });
  it("strict public DTO excludes internal configuration and returns detached mutable response data", async () => {
    const h = await learningHarness(); await h.critical(); const r = await h.result(), raw = await h.raw(), before = structuredClone(raw);
    expect(resultDto.safeParse(r).success).toBe(true);
    for (const key of ["ruleId", "eventCode", "binding", "variant", "fingerprint", "storyId", "templateId", "interaction_signal"]) {
      expect(JSON.stringify(r.postDecisionGuidance)).not.toContain(`"${key}"`);
      expect(resultDto.safeParse({ ...r, postDecisionGuidance: { ...r.postDecisionGuidance, [key]: "hidden" } }).success).toBe(false);
    }
    r.postDecisionGuidance!.recovery[0]!.immediateActions[0] = "changed by a consumer";
    expect((await h.result()).postDecisionGuidance!.recovery[0]!.immediateActions[0]).not.toBe("changed by a consumer");
    expect(raw).toEqual(before);
  });
  it("invalid official-help links fail the public schema without throwing or accepting foreign hosts", async () => {
    const h = await learningHarness(); await h.critical();
    for (const url of ["not a URL", "javascript:alert(1)", "https://foreign.example/", "https://user:password@mdes.go.th/"]) {
      const r = await h.result(); r.postDecisionGuidance!.recovery[0]!.officialHelp[0]!.url = url;
      expect(resultDto.safeParse(r).success).toBe(false);
    }
  });
});
