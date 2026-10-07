import type { ScenarioTemplate } from "../domain/schema.js";
import { callCenterStoryTemplates } from "./call-center-stories.js";

/** New publication: v4 remains byte-for-byte compatible for historical sessions. */
export const callCenterBehaviorTemplates: ScenarioTemplate[] = callCenterStoryTemplates.map(source => {
  const t = structuredClone(source);
  t.version = 5;
  const scam = t.variant === "SCAM_CALL", parcel = t.callCenter!.topic === "PARCEL";
  const meaningful = ["CONTEXT_CLAIM", ...(scam ? ["PRESSURE"] : []), "MAIN_REQUEST"];
  t.opportunities = t.opportunities.filter(o => meaningful.includes(o.state));
  const checkedBehavior = parcel ? "CHECKED_EXISTING_ORDER" as const : "CHECKED_TRANSACTION" as const;
  const branch = (state: ScenarioTemplate["states"][number], suffix: string, target: typeof state.id, label: string, choices: string[]) => ({
    id: `${state.id}-${suffix}`, target, publicLabel: label, requiresFinalized: [`cp-${state.id}`], requiresEvents: [],
    requiresChoices: [{ opportunityId: `cp-${state.id}`, choiceIds: choices }], safeResolution: false,
  });
  for (const state of t.states) {
    const opportunity = t.opportunities.find(o => o.state === state.id);
    for (const edge of state.transitions) edge.requiresFinalized = edge.requiresFinalized.filter(id => t.opportunities.some(o => o.id === id));
    if (!opportunity) for (const interaction of state.interactions ?? []) delete interaction.resolutionChoiceId;
    if (opportunity?.skill === "D") {
      // A proposed callback is an intention, not completed independent verification.
      const callback = opportunity.choices.find(c => c.id === "callback")!;
      callback.eventCodes = [];
      callback.publicFeedback = "จบสายโดยตั้งใจใช้ช่องทางที่มีอยู่เดิม ยังไม่ได้ยืนยันว่าได้ติดต่อหรือตรวจสอบสำเร็จ";
    }
    const end = state.transitions.find(e => e.id === `${state.id}-end`);
    if (state.id === "CONTEXT_CLAIM") {
      state.transitions = [end!, branch(state, "continue", scam ? "PRESSURE" : "MAIN_REQUEST", "ฟังคำขอถัดไป", scam ? ["caution", "trust"] : ["caution"]),
        { ...branch(state, "verified", "INDEPENDENT_VERIFICATION", "ทบทวนข้อมูลที่ตรวจในแอปของฉันแล้ว", ["checked"]),
          requiresEvents: ["VERIFY_SOURCE"], requiresBehaviors: [checkedBehavior] }];
    }
    if (state.id === "PRESSURE") state.transitions = [end!, branch(state, "continue", "MAIN_REQUEST", "ฟังคำขอจากผู้โทร", ["caution", "trust"])];
    if (state.id === "MAIN_REQUEST") state.transitions = [end!,
      ...(scam ? [branch(state, "refused", "CALL_ENDING", "จบสายหลังปฏิเสธคำขอ", ["refuse"]),
        branch(state, "undecided", "PLAYER_DECISION", "เลือกวิธีจัดการการติดต่อ", ["caution", "trust"])]
        : [branch(state, "resolved", "CALL_ENDING", "จบการแจ้งข้อมูล", parcel ? ["caution", "confirm", "reschedule", "limit"] : ["caution", "acknowledge"])])];
    if (state.id === "PLAYER_DECISION") state.transitions = [end!];
    if (state.id === "INDEPENDENT_VERIFICATION") {
      state.objective = state.fallbackMessage = parcel
        ? "คุณได้เปิดและตรวจข้อมูลคำสั่งซื้อจำลองที่มีอยู่เองแล้ว ข้อมูลนี้ไม่ยืนยันตัวตนผู้โทรหรือคดีที่กล่าวอ้าง และไม่ได้มีการโทรตรวจสอบกับหน่วยงานจริง"
        : "คุณได้ตรวจจำนวนเงิน เวลา และรายการในแอปธนาคารจำลองที่มีอยู่เองแล้ว การเปรียบเทียบนี้ไม่ยืนยันตัวตนผู้โทร และไม่ได้มีการติดต่อธนาคารจริง";
      state.allowedBehaviors = [state.objective, "ทบทวนเฉพาะข้อมูลที่ผู้เรียนตรวจผ่านตัวควบคุมแล้ว ห้ามกล่าวว่าได้โทรหาหรือยืนยันกับองค์กรจริง"];
      state.transitions = [end!];
    }
  }
  if (!scam) t.states = t.states.filter(s => s.id !== "PLAYER_DECISION");
  return t;
});
