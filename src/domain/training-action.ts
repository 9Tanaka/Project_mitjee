import { z } from "zod";
import { DomainError } from "./types.js";

const id = z.string().min(1).max(120);
export const actionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("FREE_TEXT"), text: z.string().max(8000) }),
  z.strictObject({ kind: z.literal("DECISION"), opportunityId: id, choiceId: id }),
  z.strictObject({ kind: z.literal("WARNING_FINALIZE"), opportunityId: id, selectedEvidenceIds: z.array(id).max(100) }),
  z.strictObject({ kind: z.literal("SAFE_ACTION"), opportunityId: id, actionId: id }),
  z.strictObject({ kind: z.literal("SIMULATED_ACTION"), ruleId: id, confirmed: z.boolean() }),
  z.strictObject({ kind: z.literal("PROGRESS"), transitionId: id }),
  z.strictObject({ kind: z.literal("QUIT_SESSION") }),
]);
export type ActionInput = z.infer<typeof actionSchema>;

export function parseAction(input: unknown): ActionInput {
  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("INVALID_ACTION", parsed.error.message);
  return parsed.data;
}

export function fingerprint(action: ActionInput): string {
  // Free text never has scoring authority and is intentionally not retained.
  if (action.kind === "FREE_TEXT") return "FREE_TEXT";
  if (action.kind === "WARNING_FINALIZE") return JSON.stringify({ ...action, selectedEvidenceIds: [...action.selectedEvidenceIds].sort() });
  return JSON.stringify(action);
}
