import { sanitizeMessage } from "../dialogue/sanitize.js";
import { DomainError } from "./types.js";
import type { TrainingSession } from "./types.js";
import { callerTurnId, callerTurnKey, isCallerTurnId } from "./call-center.js";

// MySQL JSON may reorder object keys; equality must not depend on serialization order.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

/** Recheck the existing demo sanitization contract at both persistence boundaries.
 * This is not a claim that local regex redaction detects all real-world PII. */
export function assertSanitized(session: TrainingSession): void {
  const check = (value: string) => {
    if (sanitizeMessage(value) !== value) throw new DomainError("UNSANITIZED_CONTENT");
  };
  for (const message of session.messages) check(message.text);
  for (const turn of session.dialogueTurns) {
    check(turn.response.character_message);
    if (isCallerTurnId(turn.id)) {
      const action = session.actions.find(a => a.id === `dialogue:${turn.id}`);
      const messages = session.messages.filter(m => m.turnId === turn.id);
      if (turn.id !== callerTurnId(turn.state) || action?.kind !== (turn.state === "CALL_CONNECTED" ? "CHARACTER_OPENING" : "CHARACTER_STATE_TURN") || action.fingerprint !== callerTurnKey(turn.state) || turn.inputKey !== action.fingerprint || action.state !== turn.state ||
        messages.length !== 1 || messages[0]?.role !== "character" || messages[0]?.state !== turn.state) throw new DomainError("INVALID_TURN_RECEIPT");
      continue;
    }
    const input: unknown = JSON.parse(turn.inputKey);
    if (!input || typeof input !== "object" || !("sanitizedText" in input) || typeof input.sanitizedText !== "string") throw new DomainError("INVALID_TURN_RECEIPT");
    check(input.sanitizedText);
  }
  for (const action of session.actions) {
    if (action.kind === "CHARACTER_OPENING" || action.kind === "CHARACTER_STATE_TURN") {
      const turn = session.dialogueTurns.find(t => `dialogue:${t.id}` === action.id);
      if (!turn || turn.id !== callerTurnId(action.state) || turn.inputKey !== callerTurnKey(action.state) || action.fingerprint !== turn.inputKey) throw new DomainError("INVALID_TURN_RECEIPT");
    }
    if (action.kind === "FREE_TEXT" && action.fingerprint !== "FREE_TEXT") {
      const turn = session.dialogueTurns.find(t => `dialogue:${t.id}` === action.id);
      if (!turn || turn.inputKey !== action.fingerprint) throw new DomainError("INVALID_TURN_RECEIPT");
    }
  }
}

/** Persisted history is append-only; only an open opportunity may be finalized. */
export function assertUpdate(current: TrainingSession, next: TrainingSession, expected: number): void {
  if (current.revision !== expected || next.revision !== expected + 1) throw new DomainError("REVISION_CONFLICT");
  for (const field of ["id", "ownerId", "templateId", "templateVersion", "variant", "startedAt"] as const) {
    if (current[field] !== next[field]) throw new DomainError("SESSION_IDENTITY_IMMUTABLE");
  }
  for (const field of ["actions", "events", "messages", "dialogueTurns"] as const) {
    if (canonical(current[field]) !== canonical(next[field].slice(0, current[field].length))) throw new DomainError("HISTORY_IMMUTABLE");
  }
  if (current.result && canonical(current.result) !== canonical(next.result)) throw new DomainError("RESULT_IMMUTABLE");
  for (const [index, before] of current.opportunities.entries()) {
    const after = next.opportunities[index];
    if (!after) throw new DomainError("OPPORTUNITY_IMMUTABLE");
    if (before.finalizedAt !== null && canonical(before) !== canonical(after)) throw new DomainError("OPPORTUNITY_IMMUTABLE");
    for (const field of ["definitionId", "skill", "state", "eligibleMaximum", "openedAt"] as const) {
      if (before[field] !== after[field]) throw new DomainError("OPPORTUNITY_IMMUTABLE");
    }
  }
  assertSanitized(next);
}
