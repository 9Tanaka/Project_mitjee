import { z } from "zod";
import { EVENT_CODES } from "./constants.js";
import { validateCriticalAction } from "./critical-failure.js";
import { isCritical } from "./event-registry.js";
import { callerTurnReady, callerTurnRequired, callerStateTurn } from "./call-center.js";
import { activePhoneApp, hasBehavior, interactionAvailable, interactionFor } from "./call-behavior.js";
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
  transitionId?: string;
}

export function validateAction(action: ActionInput, session: TrainingSession, t: ScenarioTemplate): ValidatedPlan {
  if (session.status !== "ACTIVE") throw new DomainError("SESSION_NOT_ACTIVE");
  const plan: ValidatedPlan = {
    status: "NO_EVENT", opportunityId: null, earned: 0, eventCodes: [],
    ruleId: action.kind, critical: false, correctWarningSignIds: [], incorrectEvidenceIds: [], assessment: null,
  };
  // Free-text interpretation can NEVER commit a Critical Failure (even explicit-sounding text).
  if (action.kind === "FREE_TEXT") {
    if (t.callCenter && (["INCOMING_CALL", "CALL_ENDING", "END_SCENARIO"].includes(session.state) || !callerTurnReady(session, t))) throw new DomainError("CALL_NOT_READY");
    return { ...plan, status: "CLARIFICATION_REQUIRED" };
  }
  if (action.kind === "CHARACTER_OPENING" || action.kind === "CHARACTER_STATE_TURN") {
    if (!callerTurnRequired(t, session.state) || callerStateTurn(session) || (action.kind === "CHARACTER_OPENING") !== (session.state === "CALL_CONNECTED")) throw new DomainError("INVALID_STATE");
    return plan;
  }
  if (action.kind === "DECLINE_CALL") {
    if (!t.callCenter || session.state !== "INCOMING_CALL") throw new DomainError("INVALID_STATE");
    return plan;
  }
  if (action.kind === "CALL_INTERACTION") {
    const interaction = interactionFor(t, session.state, action.interactionId);
    if (!callerTurnReady(session, t) && !(t.callCenter?.continuousConversation && interaction && ["HUNG_UP", "CALLED_OFFICIAL_CHANNEL"].includes(interaction.behavior))) throw new DomainError("CALL_NOT_READY");
    if (!t.callCenter?.fullStory || !interaction || !interactionAvailable(session, t, interaction)) throw new DomainError("INVALID_STATE");
    const o = t.opportunities.find(o => o.state === session.state);
    const open = session.opportunities.find(item => item.definitionId === o?.id && item.finalizedAt === null);
    if (t.callCenter?.continuousConversation && ["HUNG_UP", "CALLED_OFFICIAL_CHANNEL"].includes(interaction.behavior)) {
      const choice = o?.skill === "D" && o.choices.find(c => c.id === interaction.resolutionChoiceId);
      return { ...plan, ...(open && choice ? { status: "ACCEPTED" as const, opportunityId: o!.id,
        assessment: choice.assessment ?? null, eventCodes: choice.eventCodes, ruleId: `${o!.id}:${choice.id}` } : {}),
        transitionId: interaction.transitionId! };
    }
    const resolution = interaction.resolutionChoiceId && open && o && o.skill !== "W"
      ? validateAction(o.skill === "D" ? { kind: "DECISION", opportunityId: o.id, choiceId: interaction.resolutionChoiceId }
        : { kind: "SAFE_ACTION", opportunityId: o.id, actionId: interaction.resolutionChoiceId }, session, t) : plan;
    return { ...resolution, ...(interaction.transitionId ? { transitionId: interaction.transitionId } : {}) };
  }
  if (action.kind !== "QUIT_SESSION" && !callerTurnReady(session, t)) throw new DomainError("CALL_NOT_READY");
  if (t.callCenter?.fullStory && action.kind === "PROGRESS" && activePhoneApp(session, t) !== "CALL") throw new DomainError("INVALID_STATE");
  if (action.kind === "PROGRESS" && t.callCenter?.continuousConversation && t.states.find(s => s.id === session.state)?.transitions.find(e => e.id === action.transitionId)?.internalOnly) throw new DomainError("BACKEND_PROGRESSION_ONLY");
  if (action.kind === "PROGRESS" || action.kind === "QUIT_SESSION") return plan;
  if (action.kind === "SIMULATED_ACTION") {
    const rule = validateCriticalAction(action, session, t)!;
    return { ...plan, status: "ACCEPTED", opportunityId: rule.opportunityId,
      eventCodes: [rule.eventCode], ruleId: rule.id, critical: true };
  }

  requireOpenOpportunity(session, action.opportunityId);
  const definition = t.opportunities.find(o => o.id === action.opportunityId)!;
  if (definition.app && activePhoneApp(session, t) !== definition.app) throw new DomainError("INVALID_STATE");
  plan.opportunityId = definition.id;
  plan.status = "ACCEPTED";
  if (action.kind === "DECISION" && definition.skill === "D") {
    const choice = definition.choices.find(c => c.id === action.choiceId);
    if (!choice) throw new DomainError("UNKNOWN_CHOICE");
    if ((choice.requiresBehaviors ?? []).some(code => !hasBehavior(session, t, code))) throw new DomainError("CHECKPOINT_OR_EVENT_REQUIRED");
    plan.earned = t.evaluationMode === "DECISION_RULES_V1" ? 0 : choice.score!;
    plan.eventCodes = [...choice.eventCodes];
    plan.ruleId = `${definition.id}:${choice.id}`;
    if (t.evaluationMode === "DECISION_RULES_V1") plan.assessment = choice.assessment ?? "UNASSESSED";
  } else if (action.kind === "SAFE_ACTION" && definition.skill === "S") {
    const choice = definition.actions.find(c => c.id === action.actionId);
    if (!choice) throw new DomainError("UNKNOWN_SAFE_ACTION");
    if ((choice.requiresBehaviors ?? []).some(code => !hasBehavior(session, t, code))) throw new DomainError("CHECKPOINT_OR_EVENT_REQUIRED");
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
