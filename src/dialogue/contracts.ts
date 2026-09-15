import { z } from "zod";
import { EVENT_CODES } from "../domain/constants.js";
import type { ScenarioCategory, ScenarioState, ValidationStatus } from "../domain/types.js";

export const aiCharacterResponseSchema = z.strictObject({
  character_message: z.string().trim().min(1).max(8000),
  observed_intent: z.enum([
    "continue", "verify_source", "refuse", "share_sensitive_data",
    "follow_suspicious_link", "transfer_money", "end_contact", "unknown",
  ]),
  candidate_event: z.enum(["NONE", "WARNING_SIGN", "SAFE_ACTION", "DECISION", "POSSIBLE_CRITICAL_FAILURE"]),
  event_code: z.enum(EVENT_CODES).nullable(),
  confidence: z.number().finite().nullable(), // Metadata only. No acceptance threshold.
  safety: z.strictObject({ contains_real_pii: z.boolean(), out_of_scope: z.boolean() }),
}).refine(r => (r.candidate_event === "NONE") === (r.event_code === null), {
  message: "NONE requires null event_code; a candidate requires an event_code",
});

export type AICharacterResponse = z.infer<typeof aiCharacterResponseSchema>;

export interface SanitizedMessage {
  readonly id: string;
  readonly role: "user" | "character";
  readonly text: string;
  readonly state: ScenarioState;
}

// Data-only projection: no Core instance, repository, transitions, answer keys or scoring rules.
export interface ScenarioAIContext {
  readonly scenario: {
    readonly templateId: string;
    readonly templateVersion: number;
    readonly category: ScenarioCategory;
    readonly variant: "DEFAULT" | "NORMAL_CALL" | "SCAM_CALL";
    readonly title: string;
  };
  readonly currentState: ScenarioState;
  readonly characterRole: string;
  readonly allowedBehaviors: readonly string[];
  readonly forbiddenBehaviors: readonly string[];
  readonly recentSanitizedMessages: readonly SanitizedMessage[];
  readonly currentUserMessage: SanitizedMessage;
}

export interface ScenarioModelProvider {
  generateCharacterResponse(context: ScenarioAIContext, options?: ProviderOptions): Promise<AICharacterResponse>;
}

export interface ProviderOptions {
  signal?: AbortSignal;
  requestId?: string;
}

export type ProviderFailure = "REFUSAL" | "INVALID_OUTPUT" | "TIMEOUT" | "ERROR" | "SAFETY_BLOCKED";

export class ProviderRefusal extends Error {}

export interface TrainingMessage extends SanitizedMessage {
  readonly turnId: string;
  readonly at: number;
}

// The stored receipt is committed atomically with its FREE_TEXT action and two messages.
export interface DialogueTurn {
  id: string;
  inputKey: string;
  state: ScenarioState;
  templateVersion: number;
  snapshotRevision: number;
  committedRevision: number;
  response: AICharacterResponse;
  candidateStatus: ValidationStatus;
  usedFallback: boolean;
  failureReason: ProviderFailure | null;
  attempts: number;
}

export interface CommitDialogueTurn {
  sessionId: string;
  ownerId: string;
  turnId: string;
  expectedRevision: number;
  sanitizedUserMessage: string;
  response: AICharacterResponse;
  usedFallback: boolean;
  failureReason: ProviderFailure | null;
  attempts: number;
}

export interface DialogueReply {
  turn: DialogueTurn;
  duplicate: boolean;
}
