import { createHash } from "node:crypto";
import type { ScenarioTemplate } from "../domain/schema.js";
import type { TrainingResult, TrainingSession } from "../domain/types.js";
import type { PublicTrainingSession, PublicTrainingResult } from "./contracts.js";
import { ApplicationError } from "./errors.js";
import { availableActions, publicScenario } from "./catalog.js";

const stateLabels = {
  contact: "รับข้อความ", build_trust: "พิจารณาหลักฐาน", create_pressure: "ข้อความเพิ่มเติม",
  request_action: "คำขอจากผู้ส่ง", user_verification: "ตอบสนองต่อเหตุการณ์", end_scenario: "สิ้นสุดแบบฝึก",
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
    availableActions: availableActions(s, t) };
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
