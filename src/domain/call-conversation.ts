import { callCharacterResponseSchema } from "../dialogue/contracts.js";
import type { AICharacterResponse } from "../dialogue/contracts.js";
import type { ScenarioTemplate } from "./schema.js";
import type { TrainingSession } from "./types.js";
import { DomainError } from "./types.js";
import { transitionAvailable, advanceState } from "./state-machine.js";
import { openStateOpportunities } from "./session-opportunity.js";

export function validateCallOutput(response: AICharacterResponse, t: ScenarioTemplate, state: TrainingSession["state"]) {
  if (!t.callCenter?.continuousConversation) return;
  const policy = t.states.find(s => s.id === state)?.conversation;
  const parsed = callCharacterResponseSchema.safeParse(response);
  if (!policy || !parsed.success || !policy.allowedSignals.includes(parsed.data.interaction_signal)) throw new DomainError("INVALID_AI_SIGNAL");
}
export function committedSignal(s: TrainingSession, t: ScenarioTemplate, signals: readonly string[]) {
  return s.dialogueTurns.some(turn => turn.state === s.state && turn.templateVersion === t.version &&
    !!turn.response.interaction_signal && signals.includes(turn.response.interaction_signal));
}
export function phoneAppAllowed(s: TrainingSession, t: ScenarioTemplate, app: string) {
  const gate = t.states.find(state => state.id === s.state)?.appSignalGates?.find(g => g.app === app);
  return !gate || committedSignal(s, t, gate.signals);
}

/** Backend-only authored edge selection. No score/event/choice is inferred from AI. */
export function progressConversation(s: TrainingSession, t: ScenarioTemplate, now: number) {
  if (!t.callCenter?.continuousConversation || s.status !== "ACTIVE") return;
  for (let step = 0; step < 3; step++) {
    const state = t.states.find(state => state.id === s.state)!;
    const policy = state.conversation;
    if (!policy) return;
    const turns = s.dialogueTurns.filter(turn => turn.state === s.state);
    const last = turns.at(-1);
    if (state.callerTurnRequired && !last) return;
    const resolved = t.opportunities.some(o => o.state === s.state) &&
      s.opportunities.some(o => o.state === s.state && o.finalizedAt !== null);
    const exhausted = turns.length >= policy.maxConversationalTurns;
    if (state.callerTurnRequired && !resolved && !exhausted && last?.response.conversation_status !== "STATE_COMPLETE") return;
    const edgeId = policy.autoTransitionIds.find(id => transitionAvailable(s, t, id));
    if (!edgeId) return; // Required opportunities/evidence cannot be bypassed, even at the bound.
    const next = advanceState(s, t, edgeId); s.state = next.state;
    if (next.safeResolution) { s.status = "COMPLETED"; return; }
    openStateOpportunities(s, t, now);
    if (t.states.find(state => state.id === s.state)!.callerTurnRequired) return;
  }
}
