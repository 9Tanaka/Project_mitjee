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
