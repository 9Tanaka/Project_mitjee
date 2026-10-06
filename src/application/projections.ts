import { createHash } from "node:crypto";
import type { ScenarioTemplate } from "../domain/schema.js";
import type { TrainingResult, TrainingSession } from "../domain/types.js";
import type { PublicTrainingSession, PublicTrainingResult } from "./contracts.js";
import { ApplicationError } from "./errors.js";
import { availableActions, publicScenario } from "./catalog.js";
import { callerTurnReady } from "../domain/call-center.js";
import { activePhoneApp, actionBehavior } from "../domain/call-behavior.js";
import type { CallBehavior } from "../domain/phone-model.js";

const stateLabels = {
  contact: "รับข้อความ", build_trust: "พิจารณาหลักฐาน", create_pressure: "ข้อความเพิ่มเติม",
  request_action: "คำขอจากผู้ส่ง", user_verification: "ตอบสนองต่อเหตุการณ์", end_scenario: "สิ้นสุดแบบฝึก",
  INCOMING_CALL: "สายเรียกเข้า", CALL_CONNECTED: "กำลังสนทนา", IDENTITY_CLAIM: "ข้อมูลผู้โทร", CONTEXT_CLAIM: "บริบทการติดต่อ",
  PRESSURE: "พิจารณาบทสนทนา", MAIN_REQUEST: "คำขอจากผู้โทร", PLAYER_DECISION: "เลือกการตอบสนอง", INDEPENDENT_VERIFICATION: "ตรวจสอบผ่านช่องทางอื่น",
  CALL_ENDING: "สิ้นสุดสาย", END_SCENARIO: "สิ้นสุดรอบฝึก",
};
function projectDecisionSummary(r: TrainingResult): NonNullable<PublicTrainingResult["decisionSummary"]> | null {
  if (!r.decisionSummary) return null;
  const { checkpoints, ...counts } = r.decisionSummary;
  return { ...counts, ...(checkpoints ? { checkpoints: checkpoints.map(({ ruleId, checkpointId: _internalCheckpointId, ...feedback }) => ({
    ...feedback, ruleRef: `R-${createHash("sha256").update(`${r.templateId}@${r.templateVersion}:${ruleId}`).digest("hex").slice(0, 16)}`,
  })) } : {}) };
}
export function projectSession(s: TrainingSession, t: ScenarioTemplate): PublicTrainingSession {
  return { sessionId: s.id, scenario: publicScenario(t), status: s.status,
    currentStatePublicLabel: stateLabels[s.state], revision: s.revision,
    messages: s.messages.map(m => ({ turnId: m.turnId, role: m.role, text: m.text })),
    availableActions: availableActions(s, t), ...(t.callCenter ? { phone: projectPhone(s, t) } : {}) };
}
function projectPhone(s: TrainingSession, t: ScenarioTemplate): NonNullable<PublicTrainingSession["phone"]> {
  const incoming = s.state === "INCOMING_CALL";
  const ready = callerTurnReady(s, t);
  const declined = s.actions.some(a => a.kind === "DECLINE_CALL");
  const callStatus: NonNullable<PublicTrainingSession["phone"]>["callStatus"] = declined ? "DECLINED" : s.status !== "ACTIVE" || s.state === "END_SCENARIO" ? "ENDED"
    : incoming ? "RINGING" : s.state === "CALL_ENDING" ? "ENDING" : "CONNECTED";
  const base = { state: s.state as NonNullable<PublicTrainingSession["phone"]>["state"], callStatus, callerLabel: "ผู้ติดต่อไม่รู้จัก" as const,
    openingStatus: incoming ? "NOT_STARTED" as const : ready ? "READY" as const : "PENDING" as const };
  if (t.callCenter?.fullStory) {
    const c = t.callCenter.content!;
    const apps = callStatus === "CONNECTED" && ready ? t.states.find(state => state.id === s.state)!.internalApps!.filter(a => a !== "CALL") : [];
    const labels = { MESSAGES: "ข้อความ", BANK: "ธนาคารจำลอง", PARCEL: "พัสดุ", CALLER_INFO: "ข้อมูลผู้โทร" };
    const data: NonNullable<NonNullable<PublicTrainingSession["phone"]>["appData"]> = {};
    for (const app of apps) {
      if (app === "CALLER_INFO") data[app] = { title: "ข้อมูลที่ผู้โทรกล่าวอ้าง", lines: [c.caller.organisation, c.caller.claimedRole, c.caller.phoneLabel, c.caller.knownChannel, "ข้อมูลนี้ไม่ใช่การยืนยันตัวตนผู้โทร"] };
      if (app === "PARCEL" && c.parcel) data[app] = { title: "คำสั่งซื้อของฉัน", lines: [c.parcel.reference, c.parcel.item, c.parcel.deliveryWindow, c.parcel.status] };
      if (app === "BANK") data[app] = c.transfer && s.state === "MAIN_REQUEST" ? { title: "รายการโอนจำลองตามคำขอ", lines: [c.transfer.recipient, c.transfer.accountReference, `${c.transfer.amount.toLocaleString("th-TH")} บาทจำลอง`, c.transfer.purpose, "ไม่มีการโอนเงินจริง"] }
        : { title: "รายการในบัญชีจำลองของฉัน", lines: c.transaction ? [c.transaction.reference, `${c.transaction.amount.toLocaleString("th-TH")} บาท`, c.transaction.time, c.transaction.item, c.transaction.status] : [] };
      if (app === "MESSAGES") {
        // Stable simulation data derived from persisted session identity. Never sent to the model or stored as raw dialogue.
        const otp = String(100000 + parseInt(createHash("sha256").update(`mitjee-synthetic-otp:${s.id}`).digest("hex").slice(0, 8), 16) % 900000);
        data[app] = { title: "MITJEE Bank · ข้อความจำลอง", lines: [`รหัสยืนยันจำลองของคุณคือ ${otp}`, "ใช้สำหรับแบบฝึกนี้เท่านั้น ไม่มี SMS จริง"] };
      }
    }
    return { ...base, activeApp: activePhoneApp(s, t), appData: data, availableInternalApps: apps.map(id => ({ id, label: labels[id], availability: "AVAILABLE" as const })) };
  }
  return { ...base,
    availableInternalApps: callStatus === "CONNECTED" && ready ? [
      { id: "MESSAGES", label: "ข้อความ", availability: "FOUNDATION" }, { id: "BANK", label: "ธนาคาร", availability: "FOUNDATION" },
      { id: "PARCEL", label: "พัสดุ", availability: "FOUNDATION" }, { id: "CALLER_INFO", label: "ข้อมูลผู้โทร", availability: "FOUNDATION" },
    ] : [] };
}
const behaviorLabels: Record<CallBehavior, string> = {
  CALL_ANSWERED: "รับสาย", CALL_DECLINED: "ปฏิเสธสาย", ASKED_CALLER_IDENTITY: "ขอชื่อและฝ่ายที่ติดต่อ", ASKED_FOR_REFERENCE: "ขอข้อมูลอ้างอิง", REQUESTED_CLARIFICATION: "ขอคำอธิบายเพิ่มเติม",
  OPENED_MESSAGES: "เปิดข้อความ", OPENED_BANK_APP: "เปิดธนาคารจำลอง", OPENED_PARCEL_APP: "เปิดข้อมูลพัสดุ", OPENED_CALLER_INFO: "ดูข้อมูลผู้โทร", CHECKED_EXISTING_ORDER: "ตรวจคำสั่งซื้อ", CHECKED_TRANSACTION: "เปรียบเทียบรายการธนาคาร",
  USED_INDEPENDENT_CHANNEL: "ตรวจข้อมูลจากแหล่งที่มีอยู่เอง", RETURNED_TO_CALL: "กลับสายสนทนา", HUNG_UP: "วางสาย", REFUSED_OTP: "ปฏิเสธการบอกรหัส", SHARED_SIMULATED_OTP: "ยืนยันบอกรหัสจำลอง", REFUSED_TRANSFER: "ปฏิเสธคำขอโอน", CONFIRMED_SIMULATED_TRANSFER: "ยืนยันโอนเงินจำลอง", CALLED_OFFICIAL_CHANNEL: "เลือกติดต่อช่องทางที่มีอยู่เดิม",
  VIEWED_SIMULATED_OTP: "อ่านรหัสจำลอง", VIEWED_TRANSFER_DETAILS: "ดูรายละเอียดการโอนจำลอง", PREPARED_OTP_SHARE: "เตรียมยืนยันการบอกรหัส", PREPARED_TRANSFER: "เตรียมยืนยันการโอน", CONTINUED_CALL: "ฟังข้อมูลต่อ", ACKNOWLEDGED_NOTIFICATION: "รับทราบรายการ", CONFIRMED_DELIVERY: "ยืนยันช่วงจัดส่ง", RESCHEDULED_DELIVERY: "เปลี่ยนช่วงจัดส่ง", LIMITED_INFORMATION: "จำกัดข้อมูลที่ให้",
};
export function projectResult(s: TrainingSession, t?: ScenarioTemplate): PublicTrainingResult {
  if (!s.result || !["COMPLETED", "FAILED"].includes(s.status)) throw new ApplicationError("RESULT_NOT_FOUND");
  const r = s.result;
  return { sessionId: s.id, revision: s.revision, D: r.scores.D.normalized, W: r.scores.W.normalized,
    S: r.scores.S.normalized, trainingScore: r.trainingScore, outcome: r.outcome, weakestSkills: [...r.weakestSkills],
    recommendation: { recommendationType: r.recommendation.recommendationType, recommendationKey: r.recommendation.recommendationKey, reason: r.recommendation.reason },
    ...(t?.callCenter?.fullStory ? { callReflection: {
      note: t.callCenter.content!.reflectionNote,
      good: (r.decisionSummary?.checkpoints ?? []).filter(c => c.assessment === "SAFE").map(c => c.explanation),
      review: (r.decisionSummary?.checkpoints ?? []).filter(c => c.assessment !== "SAFE").map(c => c.explanation),
      behaviorTimeline: s.actions.flatMap(a => { const behavior = actionBehavior(a, t); return behavior ? [{ elapsedSeconds: Math.max(0, Math.floor((a.at - s.startedAt) / 1000)), label: behaviorLabels[behavior] }] : []; }),
      qualitativeInsights: s.dialogueTurns.flatMap(turn => { const label = ({ asked_caller_identity: "ข้อความอาจสะท้อนการขอข้อมูลผู้โทร", asked_for_reference: "ข้อความอาจสะท้อนการขอข้อมูลอ้างอิง", requested_clarification: "ข้อความอาจสะท้อนการขอคำอธิบายเพิ่มเติม" } as Record<string, string>)[turn.response.observed_intent]; return !turn.usedFallback && label && s.messages.some(m => m.turnId === turn.id && m.role === "user") ? [{ label, authority: "NON_AUTHORITATIVE" as const }] : []; }),
    } } : {}),
    ...(r.evaluationMode === "DECISION_RULES_V1" ? { evaluationMode: r.evaluationMode,
      decisionSummary: projectDecisionSummary(r) } : {}) };
}
