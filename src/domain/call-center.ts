import type { ScenarioTemplate } from "./schema.js";
import type { TrainingSession } from "./types.js";

export function terminalState(t: ScenarioTemplate) { return t.callCenter ? "END_SCENARIO" as const : "end_scenario" as const; }
export const OPENING_INPUT_KEY = JSON.stringify({ kind: "CHARACTER_OPENING" });
export const CALL_OPENING_TURN_ID = "caller-opening";
export function callerOpening(s: TrainingSession) {
  return s.dialogueTurns.find(turn => turn.id === CALL_OPENING_TURN_ID && turn.inputKey === OPENING_INPUT_KEY);
}
export function callerTurnRequired(t: ScenarioTemplate, state: TrainingSession["state"]) {
  return !!t.callCenter && (t.states.find(s => s.id === state)?.callerTurnRequired ?? state === "CALL_CONNECTED");
}
export function callerTurnId(state: TrainingSession["state"]) { return state === "CALL_CONNECTED" ? CALL_OPENING_TURN_ID : `caller-state-${state}`; }
export function callerTurnKey(state: TrainingSession["state"]) { return state === "CALL_CONNECTED" ? OPENING_INPUT_KEY : JSON.stringify({ kind: "CHARACTER_STATE_TURN", state }); }
export function callerStateTurn(s: TrainingSession, state = s.state) {
  return s.dialogueTurns.find(turn => turn.id === callerTurnId(state) && turn.inputKey === callerTurnKey(state) && turn.state === state);
}
export function callerTurnReady(s: TrainingSession, t: ScenarioTemplate) { return !callerTurnRequired(t, s.state) || !!callerStateTurn(s); }
export function isCallerTurnId(id: string) { return id === CALL_OPENING_TURN_ID || id.startsWith("caller-state-"); }
