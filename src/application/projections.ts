import { createHash } from "node:crypto";
import type { ScenarioTemplate } from "../domain/schema.js";
import type { TrainingResult, TrainingSession } from "../domain/types.js";
import type { PublicTrainingSession, PublicTrainingResult } from "./contracts.js";
import { ApplicationError } from "./errors.js";
import { availableActions, publicScenario } from "./catalog.js";
import { callerOpening } from "../domain/call-center.js";

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
    availableActions: availableActions(s, t), ...(t.callCenter ? { phone: projectPhone(s) } : {}) };
}
function projectPhone(s: TrainingSession): NonNullable<PublicTrainingSession["phone"]> {
  const incoming = s.state === "INCOMING_CALL";
  const ready = !!callerOpening(s);
  const declined = s.actions.some(a => a.kind === "DECLINE_CALL");
  const callStatus = declined ? "DECLINED" : s.status !== "ACTIVE" || s.state === "END_SCENARIO" ? "ENDED"
    : incoming ? "RINGING" : s.state === "CALL_ENDING" ? "ENDING" : "CONNECTED";
  return { state: s.state as NonNullable<PublicTrainingSession["phone"]>["state"], callStatus, callerLabel: "ผู้ติดต่อไม่รู้จัก",
    openingStatus: ready ? "READY" : incoming ? "NOT_STARTED" : "PENDING",
    availableInternalApps: callStatus === "CONNECTED" && ready ? [
      { id: "MESSAGES", label: "ข้อความ", availability: "FOUNDATION" }, { id: "BANK", label: "ธนาคาร", availability: "FOUNDATION" },
      { id: "PARCEL", label: "พัสดุ", availability: "FOUNDATION" }, { id: "CALLER_INFO", label: "ข้อมูลผู้โทร", availability: "FOUNDATION" },
    ] : [] };
}
export function projectResult(s: TrainingSession): PublicTrainingResult {
  if (!s.result || !["COMPLETED", "FAILED"].includes(s.status)) throw new ApplicationError("RESULT_NOT_FOUND");
  const r = s.result;
  return { sessionId: s.id, revision: s.revision, D: r.scores.D.normalized, W: r.scores.W.normalized,
    S: r.scores.S.normalized, trainingScore: r.trainingScore, outcome: r.outcome, weakestSkills: [...r.weakestSkills],
    recommendation: { recommendationType: r.recommendation.recommendationType, recommendationKey: r.recommendation.recommendationKey, reason: r.recommendation.reason },
    ...(r.evaluationMode === "DECISION_RULES_V1" ? { evaluationMode: r.evaluationMode,
      decisionSummary: projectDecisionSummary(r) } : {}) };
}
