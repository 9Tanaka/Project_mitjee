import { PASS_SCORE, SCORE_WEIGHTS, SKILLS } from "./constants.js";
import type { ScenarioTemplate } from "./schema.js";
import { DomainError } from "./types.js";
import type { Skill, SkillScore, TrainingResult, TrainingSession } from "./types.js";

export function calculateSkillScores(session: TrainingSession): Record<Skill, SkillScore> {
  const scores = {} as Record<Skill, SkillScore>;
  for (const skill of SKILLS) {
    const opportunities = session.opportunities.filter(o => o.skill === skill);
    const earned = opportunities.reduce((sum, o) => sum + o.earned, 0);
    const eligibleMaximum = opportunities.reduce((sum, o) => sum + o.eligibleMaximum, 0);
    if (!Number.isFinite(earned) || !Number.isFinite(eligibleMaximum) || earned < 0 || earned > eligibleMaximum) {
      throw new DomainError("INVALID_SCORE_DATA");
    }
    scores[skill] = { earned, eligibleMaximum, normalized: eligibleMaximum === 0 ? null : earned / eligibleMaximum * 100 };
  }
  return scores;
}

export function calculateResult(session: TrainingSession, t: ScenarioTemplate, now: number): TrainingResult {
  if (session.status !== "COMPLETED" && session.status !== "FAILED") throw new DomainError("NO_OFFICIAL_RESULT");
  if (t.evaluationMode === "DECISION_RULES_V1") return calculateDecisionResult(session, t, now);
  const scores = calculateSkillScores(session);
  const criticalEventIds = session.events.filter(e => e.critical).map(e => e.id);
  const critical = criticalEventIds.length > 0;
  if ((session.status === "FAILED") !== critical) throw new DomainError("INVALID_TERMINAL_RESULT");
  const complete = SKILLS.every(skill => scores[skill].normalized !== null);
  // Defence in depth: even a corrupted snapshot cannot create an official safe result.
  if (!critical && !complete) throw new DomainError("OFFICIAL_RESULT_REQUIRES_D_W_S");
  const trainingScore = complete
    ? SKILLS.reduce((sum, skill) => sum + scores[skill].normalized! * SCORE_WEIGHTS[skill], 0)
    : null;
  const measured = SKILLS.filter(skill => scores[skill].normalized !== null);
  const minimum = Math.min(...measured.map(skill => scores[skill].normalized!));
  const weakestSkills = measured.filter(skill => Math.abs(scores[skill].normalized! - minimum) < 1e-10);
  const mapping = critical ? t.recommendations.critical : t.recommendations[weakestSkills[0]!];
  return {
    sessionId: session.id, templateId: t.id, templateVersion: t.version,
    scores, trainingScore,
    outcome: critical ? "CRITICAL_FAILURE" : trainingScore! >= PASS_SCORE ? "PASSED" : "NOT_PASSED",
    criticalEventIds, weakestSkills,
    recommendation: { recommendationType: mapping.type, recommendationKey: mapping.key, reason: mapping.reason },
    calculatedAt: now,
  };
}

function calculateDecisionResult(session: TrainingSession, t: ScenarioTemplate, now: number): TrainingResult {
  const criticalEventIds = session.events.filter(e => e.critical && e.authority === "BACKEND_VALIDATED").map(e => e.id);
  if ((session.status === "FAILED") !== (criticalEventIds.length > 0)) throw new DomainError("INVALID_TERMINAL_RESULT");
  // STATE_ENTRY opens a checkpoint when the learner actually reaches that state.
  // An explicit early safe exit exempts only unanswered checkpoints in its own state.
  const terminalAction = session.actions.at(-1);
  const earlyExit = terminalAction?.kind === "PROGRESS" && t.states
    .find(state => state.id === terminalAction.state)?.transitions
    .some(edge => edge.earlySafeResolution && terminalAction.fingerprint === JSON.stringify({ kind: "PROGRESS", transitionId: edge.id }));
  const encountered = session.opportunities.filter(o => !earlyExit || o.state !== terminalAction?.state || o.finalizedAt !== null);
  const summary = {
    encountered: encountered.length,
    safe: encountered.filter(o => o.assessment === "SAFE").length,
    review: encountered.filter(o => o.assessment === "REVIEW").length,
    unassessed: encountered.filter(o => o.assessment === "UNASSESSED" || o.assessment == null).length,
  };
  const outcome = criticalEventIds.length > 0 ? "CRITICAL_FAILURE"
    : session.status !== "COMPLETED" || session.state !== "end_scenario" || summary.unassessed > 0 ? "UNASSESSED"
      : summary.review > 0 ? "NEEDS_PRACTICE" : "PASSED";
  const review = encountered.find(o => o.assessment === "REVIEW");
  const mapping = outcome === "CRITICAL_FAILURE" ? t.recommendations.critical
    : outcome === "NEEDS_PRACTICE" && review ? t.recommendations[review.skill]
      : { type: "PATH_REFLECTION" as const, key: "encountered-path", reason: outcome === "UNASSESSED"
        ? "ยืนยันการตัดสินใจที่ยังไม่ชัดเจนก่อนประเมินเส้นทางนี้"
        : "ผ่านเส้นทางที่พบในรอบนี้ ลองฝึกเส้นทางอื่นเพื่อเรียนรู้เพิ่มเติม" };
  const empty = { earned: 0, eligibleMaximum: 0, normalized: null };
  return {
    sessionId: session.id, templateId: t.id, templateVersion: t.version,
    scores: { D: { ...empty }, W: { ...empty }, S: { ...empty } }, trainingScore: null,
    outcome, criticalEventIds, weakestSkills: [],
    recommendation: { recommendationType: mapping.type, recommendationKey: mapping.key, reason: mapping.reason },
    calculatedAt: now, evaluationMode: "DECISION_RULES_V1", decisionSummary: summary,
  };
}
