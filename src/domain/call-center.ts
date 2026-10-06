import type { ScenarioTemplate } from "./schema.js";
import type { TrainingSession } from "./types.js";

export function terminalState(t: ScenarioTemplate) { return t.callCenter ? "END_SCENARIO" as const : "end_scenario" as const; }
export const OPENING_INPUT_KEY = JSON.stringify({ kind: "CHARACTER_OPENING" });
export const CALL_OPENING_TURN_ID = "caller-opening";
export function callerOpening(s: TrainingSession) {
  return s.dialogueTurns.find(turn => turn.id === CALL_OPENING_TURN_ID && turn.inputKey === OPENING_INPUT_KEY);
}
