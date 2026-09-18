/** Semantic application failures; adapters decide their transport representation. */
export type ApplicationErrorCode = "SCENARIO_NOT_FOUND" | "RESULT_NOT_FOUND" | "SESSION_EXPIRED" | "INVALID_ACTION" | "INVALID_REQUEST";
export class ApplicationError extends Error {
  constructor(readonly code: ApplicationErrorCode) { super(code); this.name = "ApplicationError"; }
}
