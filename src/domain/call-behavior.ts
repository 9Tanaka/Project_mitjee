import type { ScenarioTemplate } from "./schema.js";
import type { TrainingAction, TrainingSession } from "./types.js";
import type { CallBehavior, PhoneAppId } from "./phone-model.js";
import { callerTurnReady } from "./call-center.js";
import { phoneAppAllowed } from "./call-conversation.js";

export function interactionFor(t: ScenarioTemplate, state: TrainingSession["state"], id: string) {
  return t.states.find(s => s.id === state)?.interactions?.find(i => i.id === id);
}
export function actionBehavior(a: TrainingAction, t: ScenarioTemplate): CallBehavior | null {
  if (!t.callCenter) return null;
  if (a.kind === "DECLINE_CALL") return "CALL_DECLINED";
  if (["FREE_TEXT", "CHARACTER_OPENING", "CHARACTER_STATE_TURN"].includes(a.kind)) return null;
  try {
    const p = JSON.parse(a.fingerprint);
    if (a.kind === "CALL_INTERACTION") return interactionFor(t, a.state, p.interactionId)?.behavior ?? null;
    if (a.kind === "PROGRESS") return p.transitionId === "ANSWER_CALL" ? "CALL_ANSWERED" : t.states.find(s => s.id === a.state)?.transitions.find(e => e.id === p.transitionId)?.behavior ?? null;
    if (a.kind === "SIMULATED_ACTION") return t.criticalFailureRules.find(r => r.id === p.ruleId)?.behavior ?? null;
    const o = t.opportunities.find(o => o.id === p.opportunityId);
    if (o?.skill === "D" && a.kind === "DECISION") return o.choices.find(c => c.id === p.choiceId)?.behavior ?? null;
    if (o?.skill === "S" && a.kind === "SAFE_ACTION") return o.actions.find(c => c.id === p.actionId)?.behavior ?? null;
  } catch { /* Historical opaque/free-text fingerprints are not observations. */ }
  return null;
}
export function hasBehavior(s: TrainingSession, t: ScenarioTemplate, code: CallBehavior) { return s.actions.some(a => actionBehavior(a, t) === code); }
/** Resolve the actual finalized command, not inferred text or a model observation. */
export function finalizedChoice(s: TrainingSession, t: ScenarioTemplate, opportunityId: string): string | null {
  const opportunity = s.opportunities.find(o => o.definitionId === opportunityId && o.finalizedAt !== null);
  const action = s.actions.find(a => a.id === opportunity?.finalizedByActionId);
  if (!action) return null;
  try {
    const input = JSON.parse(action.fingerprint);
    if (action.kind === "DECISION") return input.choiceId;
    if (action.kind === "CALL_INTERACTION") return interactionFor(t, action.state, input.interactionId)?.resolutionChoiceId ?? null;
  } catch { /* A malformed/historical fingerprint cannot satisfy a new behavior guard. */ }
  return null;
}
export function activePhoneApp(s: TrainingSession, t: ScenarioTemplate): PhoneAppId {
  for (const a of [...s.actions].reverse()) {
    if (a.state !== s.state) continue;
    if (a.kind === "CALL_INTERACTION") {
      const p = JSON.parse(a.fingerprint);
      const target = interactionFor(t, a.state, p.interactionId)?.navigationTarget;
      if (target) return target;
    }
  }
  return "CALL";
}
export function interactionAvailable(s: TrainingSession, t: ScenarioTemplate, i: NonNullable<ScenarioTemplate["states"][number]["interactions"]>[number]) {
  const state = t.states.find(state => state.id === s.state)!;
  if (t.callCenter?.continuousConversation && ["HUNG_UP", "CALLED_OFFICIAL_CHANNEL"].includes(i.behavior)) return s.status === "ACTIVE";
  return s.status === "ACTIVE" && callerTurnReady(s, t) && i.app === activePhoneApp(s, t) &&
    (!i.navigationTarget || i.navigationTarget === "CALL" || !!state.internalApps?.includes(i.navigationTarget)) &&
    (!i.navigationTarget || phoneAppAllowed(s, t, i.navigationTarget)) && phoneAppAllowed(s, t, i.app) &&
    (i.requiresBehaviors ?? []).every(code => hasBehavior(s, t, code));
}
export function freshConfirmation(s: TrainingSession, t: ScenarioTemplate, rule: ScenarioTemplate["criticalFailureRules"][number]) {
  if (!rule.preparationInteractionId) return true; // Historical contract unchanged.
  const latest = s.actions.at(-1);
  return !!latest && latest.kind === "CALL_INTERACTION" && latest.state === s.state && latest.revision === s.revision - 1 &&
    JSON.parse(latest.fingerprint).interactionId === rule.preparationInteractionId && !!interactionFor(t, s.state, rule.preparationInteractionId);
}
