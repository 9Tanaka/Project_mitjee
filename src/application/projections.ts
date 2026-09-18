import type { ScenarioTemplate } from "../domain/schema.js";
import type { TrainingSession } from "../domain/types.js";
import type { PublicTrainingSession, PublicTrainingResult } from "./contracts.js";
import { ApplicationError } from "./errors.js";
import { availableActions, publicScenario } from "./catalog.js";

const stateLabels = {
  contact: "รับข้อความ", build_trust: "พิจารณาหลักฐาน", create_pressure: "ข้อความเพิ่มเติม",
  request_action: "คำขอจากผู้ส่ง", user_verification: "ตอบสนองต่อเหตุการณ์", end_scenario: "สิ้นสุดแบบฝึก",
};
export function projectSession(s: TrainingSession, t: ScenarioTemplate): PublicTrainingSession {
  return { sessionId: s.id, scenario: publicScenario(t), status: s.status,
    currentStatePublicLabel: stateLabels[s.state], revision: s.revision,
    messages: s.messages.map(m => ({ turnId: m.turnId, role: m.role, text: m.text })),
    availableActions: availableActions(s, t) };
}
export function projectResult(s: TrainingSession): PublicTrainingResult {
  if (!s.result || !["COMPLETED", "FAILED"].includes(s.status)) throw new ApplicationError("RESULT_NOT_FOUND");
  const r = s.result;
  return { sessionId: s.id, revision: s.revision, D: r.scores.D.normalized, W: r.scores.W.normalized,
    S: r.scores.S.normalized, trainingScore: r.trainingScore, outcome: r.outcome, weakestSkills: [...r.weakestSkills],
    recommendation: { recommendationType: r.recommendation.recommendationType, recommendationKey: r.recommendation.recommendationKey, reason: r.recommendation.reason } };
}
