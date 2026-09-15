import type { ActionInput } from "./training-action.js";
import type { ScenarioTemplate, CriticalFailureRule } from "./schema.js";
import { requireOpenOpportunity } from "./session-opportunity.js";
import { DomainError } from "./types.js";
import type { TrainingSession } from "./types.js";

/** Free text/candidates cannot enter this validation route. No keyword/confidence rules. */
export function validateCriticalAction(
  action: ActionInput, session: TrainingSession, template: ScenarioTemplate,
): CriticalFailureRule | null {
  if (action.kind !== "SIMULATED_ACTION") return null;
  if (!action.confirmed) throw new DomainError("EXPLICIT_CONFIRMATION_REQUIRED");
  const rule = template.criticalFailureRules.find(r => r.id === action.ruleId);
  if (!rule || rule.state !== session.state) throw new DomainError("CRITICAL_ACTION_NOT_ALLOWED");
  const state = template.states.find(s => s.id === session.state)!;
  if (!state.allowedEventCodes.includes(rule.eventCode)) throw new DomainError("EVENT_NOT_ALLOWED");
  requireOpenOpportunity(session, rule.opportunityId);
  if (rule.requiresAbsentEvents.some(code => session.events.some(e => e.code === code))) {
    throw new DomainError("CRITICAL_PRECONDITION_NOT_MET");
  }
  return rule;
}
