import { IDLE_TIMEOUT_MS } from "./domain/constants.js";
import { inspectCandidate, validateAction } from "./domain/event-validator.js";
import { copy } from "./domain/copy.js";
import type { TrainingRepository, ScenarioVariant } from "./domain/training-repository.js";
import { calculateResult } from "./domain/scoring.js";
import type { ScenarioTemplate } from "./domain/schema.js";
import { openStateOpportunities } from "./domain/session-opportunity.js";
import { advanceState } from "./domain/state-machine.js";
import { validateTemplate } from "./domain/template-validator.js";
import { fingerprint, parseAction } from "./domain/training-action.js";
import { DomainError } from "./domain/types.js";
import type { TrainingSession, ValidationStatus } from "./domain/types.js";
import { aiCharacterResponseSchema } from "./dialogue/contracts.js";
import type { CommitDialogueTurn, DialogueReply } from "./dialogue/contracts.js";

export interface SubmitCommand {
  sessionId: string;
  ownerId: string;
  actionId: string;
  expectedRevision: number;
  action: unknown;
}

/** Trusted server-side boundary; never expose template answer keys directly to a client. */
export class TrainingCore {
  private constructor(
    private readonly repository: TrainingRepository,
    private readonly now: () => number = Date.now,
  ) {}

  static async create(templates: unknown[], repository: TrainingRepository, now: () => number = Date.now): Promise<TrainingCore> {
    const core = new TrainingCore(repository, now);
    const validated = templates.map(input => validateTemplate(copy(input)));
    for (const template of validated) await repository.publish(template);
    return core;
  }

  private template(id: string, version: number, variant: ScenarioVariant): Promise<ScenarioTemplate> {
    return this.repository.getTemplate(id, version, variant);
  }

  /** Publication locks this id/version even before its first TrainingSession. */
  async publishTemplate(input: unknown): Promise<void> {
    await this.repository.publish(validateTemplate(input));
  }

  /** Trusted backend read; callers receive a detached copy, never a mutable live template. */
  async getSessionTemplate(sessionId: string, ownerId: string): Promise<ScenarioTemplate> {
    const session = await this.resume(sessionId, ownerId);
    return this.template(session.templateId, session.templateVersion, session.variant);
  }

  async start(id: string, ownerId: string, templateId: string, version: number, variant: ScenarioVariant = "DEFAULT"): Promise<TrainingSession> {
    if (!id || !ownerId || id.length > 120 || ownerId.length > 120) throw new DomainError("INVALID_SESSION_IDENTITY");
    const template = await this.template(templateId, version, variant);
    const now = this.now();
    const session: TrainingSession = {
      id, ownerId, templateId, templateVersion: version, variant: template.variant,
      status: "ACTIVE", state: template.initialState, revision: 0,
      startedAt: now, lastActivityAt: now, endedAt: null,
      opportunities: [], actions: [], events: [], result: null, messages: [], dialogueTurns: [],
    };
    openStateOpportunities(session, template, now);
    await this.repository.create(session);
    return copy(session);
  }

  /** Refresh/resume reads persisted state; it does not reset the idle clock. */
  async resume(sessionId: string, ownerId: string): Promise<TrainingSession> {
    const session = await this.repository.get(sessionId, ownerId);
    const now = this.now();
    if (session.status === "ACTIVE" && now - session.lastActivityAt >= IDLE_TIMEOUT_MS) {
      const expected = session.revision;
      session.status = "EXPIRED";
      session.endedAt = now;
      session.revision++;
      try { await this.repository.save(session, expected); }
      catch (error) {
        if (error instanceof DomainError && error.code === "REVISION_CONFLICT") return this.resume(sessionId, ownerId);
        throw error;
      }
    }
    return session;
  }

  async inspectAI(sessionId: string, ownerId: string, candidate: unknown): Promise<ValidationStatus> {
    const session = await this.resume(sessionId, ownerId);
    return inspectCandidate(candidate, session, await this.template(session.templateId, session.templateVersion, session.variant));
  }

  async submit(command: SubmitCommand): Promise<{ session: TrainingSession; duplicate: boolean; validationStatus: ValidationStatus }> {
    if (command.actionId.startsWith("dialogue:")) throw new DomainError("RESERVED_ACTION_ID");
    return this.apply(command);
  }

  /** Backend-owned atomic commit, after the asynchronous provider has completed. */
  async commitDialogueTurn(input: CommitDialogueTurn): Promise<DialogueReply> {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.turnId)) throw new DomainError("INVALID_TURN_ID");
    const response = aiCharacterResponseSchema.parse(input.response);
    const committed = await this.apply({
      sessionId: input.sessionId, ownerId: input.ownerId, actionId: `dialogue:${input.turnId}`,
      expectedRevision: input.expectedRevision,
      action: { kind: "FREE_TEXT", text: input.sanitizedUserMessage },
    }, { ...input, response });
    return { turn: copy(committed.session.dialogueTurns.find(t => t.id === input.turnId)!), duplicate: committed.duplicate };
  }

  private async apply(command: SubmitCommand, dialogue?: CommitDialogueTurn): Promise<{ session: TrainingSession; duplicate: boolean; validationStatus: ValidationStatus }> {
    if (!command.actionId || command.actionId.length > 120 || !Number.isInteger(command.expectedRevision)) throw new DomainError("INVALID_COMMAND");
    const action = parseAction(command.action);
    const key = dialogue ? JSON.stringify({ sanitizedText: dialogue.sanitizedUserMessage }) : fingerprint(action);
    const session = await this.resume(command.sessionId, command.ownerId);
    const previous = session.actions.find(a => a.id === command.actionId);
    if (previous) {
      if (previous.fingerprint !== key) throw new DomainError("IDEMPOTENCY_CONFLICT");
      return { session, duplicate: true, validationStatus: previous.validationStatus };
    }
    if (session.status !== "ACTIVE") throw new DomainError("SESSION_NOT_ACTIVE");
    if (session.revision !== command.expectedRevision) throw new DomainError("REVISION_CONFLICT");
    const template = await this.template(session.templateId, session.templateVersion, session.variant);
    const now = this.now();
    const stateBefore = session.state;
    const candidateStatus = dialogue ? inspectCandidate({
      eventCode: dialogue.response.event_code, opportunityId: null,
      sourceMessageId: `${dialogue.turnId}:user`, confidence: dialogue.response.confidence,
    }, session, template) : "NO_EVENT";
    const plan = validateAction(action, session, template);

    if (plan.opportunityId !== null && !plan.critical) {
      const opportunity = session.opportunities.find(o => o.definitionId === plan.opportunityId)!;
      opportunity.earned = plan.earned;
      opportunity.finalizedAt = now;
      opportunity.finalizedByActionId = command.actionId;
      opportunity.correctWarningSignIds = plan.correctWarningSignIds;
      opportunity.incorrectEvidenceIds = plan.incorrectEvidenceIds;
    }
    for (const code of plan.eventCodes) {
      session.events.push({
        id: `${session.id}:event:${session.events.length + 1}`, sessionId: session.id,
        actionId: command.actionId, opportunityId: plan.opportunityId!, code,
        state: stateBefore, ruleId: plan.ruleId, authority: "BACKEND_VALIDATED",
        critical: plan.critical, at: now,
      });
    }

    if (plan.critical) {
      session.status = "FAILED";
      session.state = "end_scenario";
    } else if (action.kind === "QUIT_SESSION") {
      session.status = "ABANDONED";
    } else if (action.kind === "PROGRESS") {
      const next = advanceState(session, template, action.transitionId);
      session.state = next.state;
      if (next.safeResolution) session.status = "COMPLETED";
      else openStateOpportunities(session, template, now);
    }

    session.actions.push({
      id: command.actionId, sessionId: session.id, kind: action.kind,
      fingerprint: key, state: stateBefore, revision: session.revision,
      at: now, validationStatus: plan.status,
    });
    if (dialogue) {
      session.messages.push(
        { id: `${dialogue.turnId}:user`, role: "user", text: dialogue.sanitizedUserMessage, state: stateBefore, turnId: dialogue.turnId, at: now },
        { id: `${dialogue.turnId}:character`, role: "character", text: dialogue.response.character_message, state: stateBefore, turnId: dialogue.turnId, at: now },
      );
      session.dialogueTurns.push({
        id: dialogue.turnId, inputKey: key, state: stateBefore, templateVersion: session.templateVersion,
        snapshotRevision: command.expectedRevision, committedRevision: session.revision + 1,
        response: copy(dialogue.response), candidateStatus, usedFallback: dialogue.usedFallback,
        failureReason: dialogue.failureReason, attempts: dialogue.attempts,
      });
    }
    session.lastActivityAt = now;
    if (session.status !== "ACTIVE") session.endedAt = now;
    if (session.status === "COMPLETED" || session.status === "FAILED") {
      session.result = calculateResult(session, template, now);
    }
    session.revision++;
    // The entire action/event/opportunity/transition/result commits together, or not at all.
    try { await this.repository.save(session, command.expectedRevision); }
    catch (error) {
      if (error instanceof DomainError && error.code === "REVISION_CONFLICT") {
        const latest = await this.repository.get(session.id, session.ownerId);
        const receipt = latest.actions.find(a => a.id === command.actionId);
        if (receipt) {
          if (receipt.fingerprint !== key) throw new DomainError("IDEMPOTENCY_CONFLICT");
          return { session: latest, duplicate: true, validationStatus: receipt.validationStatus };
        }
      }
      throw error;
    }
    return { session: copy(session), duplicate: false, validationStatus: plan.status };
  }
}
