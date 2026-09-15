import { z } from "zod";
import type { SubmitCommand, TrainingCore } from "../core.js";
import { copy } from "../domain/copy.js";
import { DomainError } from "../domain/types.js";
import { aiCharacterResponseSchema, ProviderRefusal } from "./contracts.js";
import type { AICharacterResponse, DialogueReply, ProviderFailure, ScenarioAIContext, ScenarioModelProvider } from "./contracts.js";
import { freezeData, sanitizeMessage } from "./sanitize.js";

const messageRequestSchema = z.strictObject({
  sessionId: z.string().min(1), ownerId: z.string().min(1),
  turnId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  expectedRevision: z.number().int().nonnegative(),
  text: z.string().trim().min(1).max(8000),
});
export type MessageRequest = z.infer<typeof messageRequestSchema>;

class AttemptFailure extends Error {
  constructor(readonly reason: ProviderFailure) { super(reason); }
}

// Timer handles are kept private to the bounded provider attempt.
const timers = globalThis as typeof globalThis & {
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
};

async function withDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  let handle: unknown;
  const controller = new AbortController();
  const deadline = new Promise<never>((_, reject) => {
    handle = timers.setTimeout(() => {
      reject(new AttemptFailure("TIMEOUT"));
      controller.abort(new AttemptFailure("TIMEOUT"));
    }, timeoutMs);
  });
  try {
    // Promise boundary catches providers that throw synchronously despite the interface.
    return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), deadline]);
  } finally {
    timers.clearTimeout(handle);
  }
}

export class ScenarioDialogueOrchestrator {
  constructor(
    private readonly core: TrainingCore,
    private readonly provider: ScenarioModelProvider,
    private readonly timeoutMs = 20_000,
  ) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new DomainError("INVALID_PROVIDER_TIMEOUT");
  }

  /** Only explicit commands, never model text/candidate interpretation, may advance Core. */
  performAction(command: SubmitCommand): ReturnType<TrainingCore["submit"]> {
    return this.core.submit(command);
  }

  async sendMessage(input: MessageRequest): Promise<DialogueReply> {
    const parsed = messageRequestSchema.safeParse(input);
    if (!parsed.success) throw new DomainError("INVALID_MESSAGE_REQUEST");
    const request = parsed.data;
    const text = sanitizeMessage(request.text);
    if (!text) throw new DomainError("EMPTY_SANITIZED_MESSAGE");
    const session = await this.core.resume(request.sessionId, request.ownerId);
    const prior = session.dialogueTurns.find(t => t.id === request.turnId);
    if (prior) {
      if (prior.inputKey !== JSON.stringify({ sanitizedText: text })) throw new DomainError("IDEMPOTENCY_CONFLICT");
      return { turn: copy(prior), duplicate: true };
    }
    if (session.status !== "ACTIVE") throw new DomainError("SESSION_NOT_ACTIVE");
    if (session.revision !== request.expectedRevision) throw new DomainError("REVISION_CONFLICT");
    const template = await this.core.getSessionTemplate(request.sessionId, request.ownerId);
    if (!template.characterRole) throw new DomainError("DIALOGUE_ROLE_NOT_CONFIGURED");
    const state = template.states.find(s => s.id === session.state)!;
    const context: ScenarioAIContext = freezeData({
      scenario: {
        templateId: template.id, templateVersion: template.version,
        category: template.category, variant: template.variant, title: sanitizeMessage(template.title),
      },
      currentState: session.state,
      characterRole: sanitizeMessage(template.characterRole),
      allowedBehaviors: state.allowedBehaviors.map(sanitizeMessage),
      forbiddenBehaviors: state.forbiddenBehaviors.map(sanitizeMessage),
      recentSanitizedMessages: session.messages.slice(-12).map(m => ({
        id: m.id, role: m.role, text: sanitizeMessage(m.text).slice(0, 2000), state: m.state,
      })),
      currentUserMessage: { id: `${request.turnId}:user`, role: "user", text, state: session.state },
    });

    let response: AICharacterResponse | null = null;
    let failureReason: ProviderFailure | null = null;
    let attempts = 0;
    for (let attempt = 0; attempt < 2; attempt++) { // Initial attempt + one retry (Demo assumption).
      attempts++;
      try {
        const raw: unknown = await withDeadline(signal => this.provider.generateCharacterResponse(context, {
          signal, requestId: `${request.sessionId}:${request.turnId}:${attempt + 1}`,
        }), this.timeoutMs);
        const output = aiCharacterResponseSchema.safeParse(raw);
        if (!output.success) throw new AttemptFailure("INVALID_OUTPUT");
        if (output.data.safety.contains_real_pii || output.data.safety.out_of_scope) throw new AttemptFailure("SAFETY_BLOCKED");
        response = { ...output.data, character_message: sanitizeMessage(output.data.character_message) };
        if (!response.character_message) throw new AttemptFailure("INVALID_OUTPUT");
        break;
      } catch (error) {
        response = null;
        failureReason = error instanceof AttemptFailure ? error.reason : error instanceof ProviderRefusal ? "REFUSAL" : "ERROR";
        if (failureReason === "SAFETY_BLOCKED") break; // Do not retry a known unsafe response.
      }
    }

    const usedFallback = response === null;
    if (!response) {
      response = {
        character_message: sanitizeMessage(state.fallbackMessage), observed_intent: "unknown",
        candidate_event: "NONE", event_code: null, confidence: null,
        safety: { contains_real_pii: false, out_of_scope: false },
      };
    }
    // Candidate inspection, EventValidator and domain rules run inside this CAS commit.
    // A concurrent action/expiry invalidates the response; it must not be returned as current.
    return this.core.commitDialogueTurn({
      sessionId: request.sessionId, ownerId: request.ownerId, turnId: request.turnId,
      expectedRevision: request.expectedRevision, sanitizedUserMessage: text, response,
      usedFallback, failureReason, attempts,
    });
  }
}
