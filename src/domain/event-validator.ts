import { z } from "zod";
import { EVENT_CODES } from "./constants.js";
import { validateCriticalAction } from "./critical-failure.js";
import { isCritical } from "./event-registry.js";
import type { ScenarioTemplate } from "./schema.js";
import { requireOpenOpportunity } from "./session-opportunity.js";
import type { ActionInput } from "./training-action.js";
import { DomainError } from "./types.js";
import type { DecisionAssessment, EventCode, TrainingSession, ValidationStatus } from "./types.js";

export interface ValidatedPlan {
  status: ValidationStatus;
  opportunityId: string | null;
  earned: number;
  eventCodes: EventCode[];
  ruleId: string;
  critical: boolean;
  correctWarningSignIds: string[];
  incorrectEvidenceIds: string[];
  assessment: DecisionAssessment | null;
}

export function validateAction(action: ActionInput, session: TrainingSession, t: ScenarioTemplate): ValidatedPlan {
  if (session.status !== "ACTIVE") throw new DomainError("SESSION_NOT_ACTIVE");
  const plan: ValidatedPlan = {
    status: "NO_EVENT", opportunityId: null, earned: 0, eventCodes: [],
    ruleId: action.kind, critical: false, correctWarningSignIds: [], incorrectEvidenceIds: [], assessment: null,
  };
  // Free-text interpretation can NEVER commit a Critical Failure (even explicit-sounding text).
  if (action.kind === "FREE_TEXT") return { ...plan, status: "CLARIFICATION_REQUIRED" };
  if (action.kind === "PROGRESS" || action.kind === "QUIT_SESSION") return plan;
  if (action.kind === "SIMULATED_ACTION") {
    const rule = validateCriticalAction(action, session, t)!;
    return { ...plan, status: "ACCEPTED", opportunityId: rule.opportunityId,
      eventCodes: [rule.eventCode], ruleId: rule.id, critical: true };
  }

  requireOpenOpportunity(session, action.opportunityId);
  const definition = t.opportunities.find(o => o.id === action.opportunityId)!;
  plan.opportunityId = definition.id;
  plan.status = "ACCEPTED";
  if (action.kind === "DECISION" && definition.skill === "D") {
    const choice = definition.choices.find(c => c.id === action.choiceId);
    if (!choice) throw new DomainError("UNKNOWN_CHOICE");
    plan.earned = t.evaluationMode === "DECISION_RULES_V1" ? 0 : choice.score!;
    plan.eventCodes = [...choice.eventCodes];
    plan.ruleId = `${definition.id}:${choice.id}`;
    if (t.evaluationMode === "DECISION_RULES_V1") plan.assessment = choice.assessment ?? "UNASSESSED";
  } else if (action.kind === "SAFE_ACTION" && definition.skill === "S") {
    const choice = definition.actions.find(c => c.id === action.actionId);
    if (!choice) throw new DomainError("UNKNOWN_SAFE_ACTION");
    plan.earned = t.evaluationMode === "DECISION_RULES_V1" ? 0 : choice.score!;
    plan.eventCodes = [...choice.eventCodes];
    plan.ruleId = `${definition.id}:${choice.id}`;
    if (t.evaluationMode === "DECISION_RULES_V1") plan.assessment = choice.assessment ?? "UNASSESSED";
  } else if (action.kind === "WARNING_FINALIZE" && definition.skill === "W") {
    if (new Set(action.selectedEvidenceIds).size !== action.selectedEvidenceIds.length) throw new DomainError("DUPLICATE_EVIDENCE");
    for (const id of action.selectedEvidenceIds) {
      const evidence = definition.evidence.find(e => e.id === id);
      if (!evidence) throw new DomainError("UNKNOWN_EVIDENCE");
      if (evidence.warningSignId === null) plan.incorrectEvidenceIds.push(id);
      else plan.correctWarningSignIds.push(evidence.warningSignId);
    }
    plan.earned = t.evaluationMode === "DECISION_RULES_V1" ? 0 : plan.correctWarningSignIds.length;
    plan.eventCodes = plan.correctWarningSignIds.length > 0 ? ["IDENTIFY_WARNING_SIGN"] : [];
    plan.ruleId = `${definition.id}:finalize`;
    if (t.evaluationMode === "DECISION_RULES_V1") {
      const expected = definition.evidence.filter(e => e.warningSignId !== null).map(e => e.warningSignId!);
      plan.assessment = plan.incorrectEvidenceIds.length === 0 &&
        expected.length === plan.correctWarningSignIds.length &&
        expected.every(id => plan.correctWarningSignIds.includes(id)) ? "SAFE" : "REVIEW";
    }
  } else throw new DomainError("ACTION_OPPORTUNITY_MISMATCH");

  const allowed = t.states.find(s => s.id === session.state)!.allowedEventCodes;
  for (const code of plan.eventCodes) {
    if (!allowed.includes(code) || isCritical(code)) throw new DomainError("EVENT_NOT_ALLOWED");
  }
  return plan;
}

const candidateSchema = z.strictObject({
  eventCode: z.enum(EVENT_CODES).nullable(), opportunityId: z.string().nullable(),
  sourceMessageId: z.string().min(1), confidence: z.number().finite().nullable(),
});

/** Read-only interpretation: no event, state transition, score, or repository write. */
export function inspectCandidate(input: unknown, session: TrainingSession, t: ScenarioTemplate): ValidationStatus {
  const parsed = candidateSchema.safeParse(input);
  if (!parsed.success || session.status !== "ACTIVE") return "REJECTED";
  const candidate = parsed.data;
  if (candidate.eventCode === null) return "NO_EVENT";
  if (!t.states.find(s => s.id === session.state)!.allowedEventCodes.includes(candidate.eventCode)) return "REJECTED";
  if (candidate.opportunityId !== null && !session.opportunities.some(o =>
    o.definitionId === candidate.opportunityId && o.state === session.state && o.finalizedAt === null)) return "REJECTED";
  // confidence is deliberately never read. Interpretation only requests explicit confirmation.
  return "CLARIFICATION_REQUIRED";
}
