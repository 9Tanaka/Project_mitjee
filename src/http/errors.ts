import { AccountError } from "../accounts/contracts.js";
import { DomainError } from "../domain/types.js";
import { ApplicationError } from "../application/errors.js";

const errors = {
  ACCOUNT_ALREADY_EXISTS: [409, "Account already exists."],
  INVALID_REQUEST: [400, "Invalid request."], UNAUTHENTICATED: [401, "Authentication required."],
  INVALID_ORIGIN: [403, "Request origin is not allowed."],
  SCENARIO_NOT_FOUND: [404, "Scenario not found."], SESSION_NOT_FOUND: [404, "Session not found."],
  RESULT_NOT_FOUND: [404, "Result not found."], REVISION_CONFLICT: [409, "Refresh the session before submitting a new request."],
  IDEMPOTENCY_CONFLICT: [409, "This request ID has already been used for a different request."],
  SESSION_EXPIRED: [410, "Session expired."], PAYLOAD_TOO_LARGE: [413, "Request body is too large."],
  INVALID_ACTION: [422, "Action is not available or valid."], INVALID_STATE: [422, "Complete the current step first."],
  SESSION_NOT_ACTIVE: [422, "Session is no longer active."],
  PROVIDER_UNAVAILABLE: [503, "Dialogue is temporarily unavailable."], INTERNAL_ERROR: [500, "Unable to process the request."],
} as const;
export type ApiErrorCode = keyof typeof errors;
export class ApiError extends Error {
  constructor(readonly code: ApiErrorCode) { super(code); }
}
const actionErrors = new Set([
  "INVALID_ACTION", "UNKNOWN_CHOICE", "UNKNOWN_SAFE_ACTION", "DUPLICATE_EVIDENCE", "UNKNOWN_EVIDENCE",
  "ACTION_OPPORTUNITY_MISMATCH", "EVENT_NOT_ALLOWED", "INELIGIBLE_OPPORTUNITY", "OPPORTUNITY_ALREADY_FINALIZED",
  "EXPLICIT_CONFIRMATION_REQUIRED", "CRITICAL_ACTION_NOT_ALLOWED", "CRITICAL_PRECONDITION_NOT_MET",
]);
export function publicError(error: unknown) {
  let code: ApiErrorCode = "INTERNAL_ERROR";
  if (error instanceof ApiError || error instanceof ApplicationError || error instanceof AccountError) code = error.code;
  else if (error instanceof DomainError) {
    if (["SESSION_NOT_FOUND", "REVISION_CONFLICT", "IDEMPOTENCY_CONFLICT", "SESSION_NOT_ACTIVE"].includes(error.code)) code = error.code as ApiErrorCode;
    else if (actionErrors.has(error.code)) code = "INVALID_ACTION";
    else if (["INVALID_TRANSITION", "CHECKPOINT_OR_EVENT_REQUIRED"].includes(error.code)) code = "INVALID_STATE";
    else if (["INVALID_COMMAND", "INVALID_MESSAGE_REQUEST", "INVALID_TURN_ID", "EMPTY_SANITIZED_MESSAGE", "RESERVED_ACTION_ID"].includes(error.code)) code = "INVALID_REQUEST";
  }
  const [status, message] = errors[code];
  return { status, body: { error: { code, message } } };
}
