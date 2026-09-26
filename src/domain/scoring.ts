import { PASS_SCORE, SCORE_WEIGHTS, SKILLS } from "./constants.js";
import type { ScenarioTemplate } from "./schema.js";
import { DomainError } from "./types.js";
import type { DecisionFeedback, SessionOpportunity, Skill, SkillScore, TrainingResult, TrainingSession } from "./types.js";
import { parseAction } from "./training-action.js";

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
  const criticalOpportunityIds = new Set(session.events.filter(e => e.critical).map(e => e.opportunityId));
  const encountered = session.opportunities.filter(o => !criticalOpportunityIds.has(o.definitionId) &&
    (!earlyExit || o.state !== terminalAction?.state || o.finalizedAt !== null));
  const checkpoints = t.publicFeedbackEnabled ? encountered.map(o => checkpointFeedback(o, session, t)) : undefined;
  for (const event of t.publicFeedbackEnabled ? session.events.filter(e => e.critical && e.authority === "BACKEND_VALIDATED") : []) {
    const opportunity = session.opportunities.find(o => o.definitionId === event.opportunityId);
    const rule = t.criticalFailureRules.find(r => r.id === event.ruleId);
    if (!opportunity || !rule) throw new DomainError("INVALID_RESULT_DATA");
    checkpoints!.push({ checkpointId: opportunity.definitionId, ruleId: rule.id,
      label: rule.publicLabel!, assessment: "CRITICAL", explanation: rule.publicFeedback! });
  }
  const summary = {
    encountered: encountered.length,
    safe: encountered.filter(o => o.assessment === "SAFE").length,
    review: encountered.filter(o => o.assessment === "REVIEW").length,
    unassessed: encountered.filter(o => o.assessment === "UNASSESSED" || o.assessment == null).length,
    ...(checkpoints ? { critical: criticalEventIds.length, checkpoints } : {}),
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

function checkpointLabel(o: SessionOpportunity, t: ScenarioTemplate): string {
  const definition = t.opportunities.find(d => d.id === o.definitionId);
  if (!definition?.publicCheckpointLabel) throw new DomainError("INVALID_RESULT_DATA");
  return definition.publicCheckpointLabel;
}

function checkpointFeedback(o: SessionOpportunity, session: TrainingSession, t: ScenarioTemplate): DecisionFeedback {
  const definition = t.opportunities.find(d => d.id === o.definitionId);
  if (!definition) throw new DomainError("INVALID_RESULT_DATA");
  const label = checkpointLabel(o, t);
  if (o.finalizedAt === null || o.assessment == null) return { checkpointId: o.definitionId,
    ruleId: `${o.definitionId}:unanswered`, label, assessment: "UNASSESSED",
    explanation: definition.unassessedFeedback! };
  const action = session.actions.find(a => a.id === o.finalizedByActionId);
  if (!action) throw new DomainError("INVALID_RESULT_DATA");
  const parsed = parseAction(JSON.parse(action.fingerprint));
  let ruleId: string;
  let explanation: string | undefined;
  if (definition.skill === "W" && parsed.kind === "WARNING_FINALIZE") {
    ruleId = `${definition.id}:finalize`;
    explanation = o.assessment === "SAFE" ? definition.safeFeedback : definition.reviewFeedback;
  } else if (definition.skill === "D" && parsed.kind === "DECISION") {
    ruleId = `${definition.id}:${parsed.choiceId}`;
    explanation = definition.choices.find(c => c.id === parsed.choiceId)?.publicFeedback;
  } else if (definition.skill === "S" && parsed.kind === "SAFE_ACTION") {
    ruleId = `${definition.id}:${parsed.actionId}`;
    explanation = definition.actions.find(c => c.id === parsed.actionId)?.publicFeedback;
  } else throw new DomainError("INVALID_RESULT_DATA");
  if (!explanation) throw new DomainError("INVALID_RESULT_DATA");
  return { checkpointId: o.definitionId, ruleId, label, assessment: o.assessment, explanation };
}
