import { z } from "zod";
import { DomainError } from "../domain/types.js";

/** Closed taxonomy only: never serialize error message, stack, meta, SQL or request data. */
export function trainingFailureCategory(error: unknown): string {
  if (error instanceof z.ZodError) return "SCHEMA_VALIDATION";
  if (error instanceof DomainError) {
    if (error.code === "PUBLISHED_TEMPLATE_IMMUTABLE") return "TEMPLATE_IMMUTABILITY";
    if (error.code === "INVALID_TEMPLATE") return "TEMPLATE_VALIDATION";
    if (error.code === "SESSION_NOT_FOUND") return "SESSION_NOT_FOUND";
    return "DOMAIN_FAILURE";
  }
  if (error && typeof error === "object" && "code" in error) {
    const code = error.code;
    if (code === "P2028") return "DATABASE_TRANSACTION";
    if (typeof code === "string" && ["P1001", "P1002", "P1008", "P1017", "P2024", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"].includes(code)) return "DATABASE_CONNECTION";
    if (code === "P2002") return "DATABASE_UNIQUE";
    if (code === "P2003") return "DATABASE_FOREIGN_KEY";
  }
  return "UNKNOWN_INTERNAL";
}
