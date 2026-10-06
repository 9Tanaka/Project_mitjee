import { z } from "zod";
import type { SubmitCommand, TrainingCore } from "../core.js";
import { copy } from "../domain/copy.js";
import { DomainError } from "../domain/types.js";
import { aiCharacterResponseSchema, ProviderRefusal } from "./contracts.js";
import type { AICharacterResponse, DialogueReply, ProviderFailure, ScenarioAIContext, ScenarioModelProvider } from "./contracts.js";
import { freezeData, sanitizeMessage } from "./sanitize.js";
import { callerTurnId, callerTurnKey, callerStateTurn, callerTurnRequired, callerTurnReady } from "../domain/call-center.js";
import { validateCallOutput } from "../domain/call-conversation.js";

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

  /** Explicit learner actions; bounded conversational progression uses separate authored guards. */
  performAction(command: SubmitCommand): ReturnType<TrainingCore["submit"]> {
    return this.core.submit(command);
  }

  async sendMessage(input: MessageRequest): Promise<DialogueReply> {
    const parsed = messageRequestSchema.safeParse(input);
    if (!parsed.success) throw new DomainError("INVALID_MESSAGE_REQUEST");
    const request = parsed.data;
    const text = sanitizeMessage(request.text);
    if (!text) throw new DomainError("EMPTY_SANITIZED_MESSAGE");
    const { session, template } = await this.core.getSessionContext(request.sessionId, request.ownerId);
    const prior = session.dialogueTurns.find(t => t.id === request.turnId);
    if (prior) {
      if (prior.inputKey !== JSON.stringify({ sanitizedText: text })) throw new DomainError("IDEMPOTENCY_CONFLICT");
      return { turn: copy(prior), duplicate: true };
    }
    if (session.status !== "ACTIVE") throw new DomainError("SESSION_NOT_ACTIVE");
    if (session.revision !== request.expectedRevision) throw new DomainError("REVISION_CONFLICT");
    if (template.callCenter && (["INCOMING_CALL", "CALL_ENDING", "END_SCENARIO"].includes(session.state) || !callerTurnReady(session, template))) throw new DomainError("CALL_NOT_READY");
    if (!template.characterRole) throw new DomainError("DIALOGUE_ROLE_NOT_CONFIGURED");
    const state = template.states.find(s => s.id === session.state)!;
    const context: ScenarioAIContext = freezeData({
      scenario: {
        templateId: template.id, templateVersion: template.version,
        category: template.category, variant: template.variant, title: sanitizeMessage(template.title),
        ...(template.callCenter ? { callStoryId: template.callCenter.storyId } : {}),
      },
      currentState: session.state,
      ...(state.conversation ? { callConversation: { allowedSignals: state.conversation.allowedSignals, fallbackSignal: state.conversation.fallbackSignal } } : {}),
      characterRole: sanitizeMessage(template.characterRole),
      allowedBehaviors: state.allowedBehaviors.map(sanitizeMessage),
      forbiddenBehaviors: state.forbiddenBehaviors.map(sanitizeMessage),
      recentSanitizedMessages: session.messages.slice(-12).map(m => ({
        id: m.id, role: m.role, text: sanitizeMessage(m.text).slice(0, 2000), state: m.state,
      })),
      currentUserMessage: { id: `${request.turnId}:user`, role: "user", text, state: session.state },
    });

    const generated = await this.generate(context, state.fallbackMessage, `${request.sessionId}:${request.turnId}`, template);
    // Candidate inspection, EventValidator and domain rules run inside this CAS commit.
    return this.core.commitDialogueTurn({ ...request, sanitizedUserMessage: text, ...generated });
  }

  async openCall(input: { sessionId: string; ownerId: string; expectedRevision: number }): Promise<DialogueReply> {
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new DomainError("INVALID_COMMAND");
    const { session, template } = await this.core.getSessionContext(input.sessionId, input.ownerId);
    if (!template.callCenter) throw new DomainError("INVALID_STATE");
    if (template.callCenter.continuousConversation && input.expectedRevision !== session.revision) {
      const replay = session.dialogueTurns.find(t => t.snapshotRevision === input.expectedRevision && (t.id === "caller-opening" || t.id.startsWith("caller-state-")));
      if (replay) return { turn: copy(replay), duplicate: true };
    }
    const prior = callerStateTurn(session);
    if (prior) {
      if (prior.inputKey !== callerTurnKey(session.state)) throw new DomainError("IDEMPOTENCY_CONFLICT");
      return { turn: copy(prior), duplicate: true };
    }
    if (session.status !== "ACTIVE") throw new DomainError("SESSION_NOT_ACTIVE");
    if (session.revision !== input.expectedRevision) throw new DomainError("REVISION_CONFLICT");
    if (!callerTurnRequired(template, session.state)) throw new DomainError("CALL_NOT_READY");
    const state = template.states.find(s => s.id === session.state)!;
    const kind = session.state === "CALL_CONNECTED" ? "CHARACTER_OPENING" : "CHARACTER_STATE_TURN";
    const turnId = callerTurnId(session.state);
    const context: ScenarioAIContext = freezeData({
      scenario: { templateId: template.id, templateVersion: template.version, category: template.category,
        variant: template.variant, title: sanitizeMessage(template.title), callStoryId: template.callCenter.storyId },
      currentState: session.state, characterRole: sanitizeMessage(template.characterRole!),
      ...(state.conversation ? { callConversation: { allowedSignals: state.conversation.allowedSignals, fallbackSignal: state.conversation.fallbackSignal } } : {}),
      allowedBehaviors: state.allowedBehaviors.map(sanitizeMessage), forbiddenBehaviors: state.forbiddenBehaviors.map(sanitizeMessage),
      recentSanitizedMessages: session.messages.slice(-12).map(m => ({ id: m.id, role: m.role, text: sanitizeMessage(m.text), state: m.state })), currentUserMessage: null, turnKind: kind,
    });
    const generated = await this.generate(context, state.fallbackMessage, `${session.id}:${turnId}`, template);
    return this.core.commitCharacterOpening({ ...input, kind, turnId, ...generated });
  }

  private async generate(context: ScenarioAIContext, fallback: string, requestKey: string, template: import("../domain/schema.js").ScenarioTemplate) {
    let response: AICharacterResponse | null = null;
    let failureReason: ProviderFailure | null = null;
    let attempts = 0;
    for (let attempt = 0; attempt < 2; attempt++) { // Initial attempt + one retry (Demo assumption).
      attempts++;
      try {
        const raw: unknown = await withDeadline(signal => this.provider.generateCharacterResponse(context, {
          signal, requestId: `${requestKey}:${attempt + 1}`,
        }), this.timeoutMs);
        const output = aiCharacterResponseSchema.safeParse(raw);
        if (!output.success) throw new AttemptFailure("INVALID_OUTPUT");
        try { validateCallOutput(output.data, template, context.currentState); } catch { throw new AttemptFailure("INVALID_OUTPUT"); }
        if (output.data.safety.contains_real_pii || output.data.safety.out_of_scope) throw new AttemptFailure("SAFETY_BLOCKED");
        if (context.scenario.callStoryId && /\bCC-(?:N?0[12])\b|SCAM_CALL|NORMAL_CALL/.test(output.data.character_message)) throw new AttemptFailure("SAFETY_BLOCKED");
        response = { ...output.data, character_message: sanitizeMessage(output.data.character_message) };
        if (!response.character_message) throw new AttemptFailure("INVALID_OUTPUT");
        // This field describes terminal fallback failure, not a recovered attempt.
        failureReason = null;
        break;
      } catch (error) {
        response = null;
        failureReason = error instanceof AttemptFailure ? error.reason : error instanceof ProviderRefusal ? "REFUSAL" : "ERROR";
        if (failureReason === "SAFETY_BLOCKED") break; // Do not retry a known unsafe response.
      }
    }

    const policy = template.states.find(s => s.id === context.currentState)!.conversation;
    const boundedRecovery = response && policy && policy.decisionSignals.length > 0 &&
      !policy.decisionSignals.includes(response.interaction_signal!) &&
      context.recentSanitizedMessages.filter(m => m.role === "character" && m.state === context.currentState).length + 1 >= policy.maxConversationalTurns;
    const usedFallback = response === null || !!boundedRecovery;
    if (boundedRecovery) response = null; // Authored signal must accompany authored words, never relabel model text.
    if (!response) {
      response = {
        character_message: sanitizeMessage(fallback), observed_intent: "unknown",
        candidate_event: "NONE", event_code: null, confidence: null,
        safety: { contains_real_pii: false, out_of_scope: false },
        ...(context.callConversation ? { interaction_signal: context.callConversation.fallbackSignal,
          conversation_status: template.states.find(s => s.id === context.currentState)!.conversation!.fallbackStatus } : {}),
      };
    }
    return { response, usedFallback, failureReason, attempts };
  }
}
