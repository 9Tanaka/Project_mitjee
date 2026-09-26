import { Prisma } from "../generated/prisma/client.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { TrainingRepository, ScenarioVariant } from "../domain/training-repository.js";
import type { ScenarioTemplate } from "../domain/schema.js";
import { validateTemplate } from "../domain/template-validator.js";
import { DomainError } from "../domain/types.js";
import type { TrainingSession } from "../domain/types.js";
import { assertSanitized, assertUpdate, canonical } from "../domain/persistence-contract.js";
import { copy } from "../domain/copy.js";

const include = {
  actions: { orderBy: { revision: "asc" } },
  opportunities: { orderBy: { position: "asc" } },
  events: { orderBy: { position: "asc" } },
  messages: { orderBy: { position: "asc" } },
  turns: { orderBy: { committedRevision: "asc" } }, result: true,
} satisfies Prisma.TrainingSessionInclude;
type AggregateRow = Prisma.TrainingSessionGetPayload<{ include: typeof include }>;
type Transaction = Prisma.TransactionClient;
const json = (value: unknown) => copy(value) as Prisma.InputJsonValue;
const date = (value: number | null) => value === null ? null : new Date(value);

// Explicit column mapping prevents accidental storage of extra properties or raw provider DTOs.
function header(s: TrainingSession) {
  return { id: s.id, ownerId: s.ownerId, templateId: s.templateId, templateVersion: s.templateVersion,
    variant: s.variant, status: s.status, state: s.state, revision: s.revision,
    startedAt: new Date(s.startedAt), lastActivityAt: new Date(s.lastActivityAt), endedAt: date(s.endedAt) };
}
function decode(row: AggregateRow): TrainingSession {
  // Enum/JSON casts are confined to the persistence boundary. Only Core writes these columns.
  return {
    id: row.id, ownerId: row.ownerId, templateId: row.templateId, templateVersion: row.templateVersion,
    variant: row.variant, status: row.status, state: row.state, revision: row.revision,
    startedAt: row.startedAt.getTime(), lastActivityAt: row.lastActivityAt.getTime(), endedAt: row.endedAt?.getTime() ?? null,
    actions: row.actions.map(a => ({ id: a.id, sessionId: a.sessionId, kind: a.kind, fingerprint: a.fingerprint,
      state: a.state, revision: a.revision, at: a.at.getTime(), validationStatus: a.validationStatus })),
    opportunities: row.opportunities.map(o => ({ definitionId: o.definitionId, skill: o.skill, state: o.state,
      eligibleMaximum: o.eligibleMaximum, earned: o.earned, openedAt: o.openedAt.getTime(),
      finalizedAt: o.finalizedAt?.getTime() ?? null, finalizedByActionId: o.finalizedByActionId,
      correctWarningSignIds: o.correctWarningSignIds, incorrectEvidenceIds: o.incorrectEvidenceIds,
      ...(row.templateVersion >= 3 ? { assessment: o.assessment } : {}) })),
    events: row.events.map(e => ({ id: e.id, sessionId: e.sessionId, actionId: e.actionId, opportunityId: e.opportunityId,
      code: e.code, state: e.state, ruleId: e.ruleId, authority: e.authority, critical: e.critical, at: e.at.getTime() })),
    messages: row.messages.map(m => ({ id: m.id, turnId: m.turnId, role: m.role, text: m.text, state: m.state, at: m.at.getTime() })),
    dialogueTurns: row.turns.map(t => ({ id: t.id, inputKey: t.inputKey, state: t.state, templateVersion: t.templateVersion,
      snapshotRevision: t.snapshotRevision, committedRevision: t.committedRevision, response: t.response,
      candidateStatus: t.candidateStatus, usedFallback: t.usedFallback, failureReason: t.failureReason, attempts: t.attempts })),
    result: row.result ? { sessionId: row.result.sessionId, templateId: row.result.templateId, templateVersion: row.result.templateVersion,
      scores: row.result.scores, trainingScore: row.result.trainingScore, outcome: row.result.outcome,
      criticalEventIds: row.result.criticalEventIds, weakestSkills: row.result.weakestSkills,
      recommendation: row.result.recommendation, calculatedAt: row.result.calculatedAt.getTime(),
      ...(row.result.evaluationMode === "DECISION_RULES_V1" ? {
        evaluationMode: "DECISION_RULES_V1", decisionSummary: row.result.decisionSummary,
      } : {}) } : null,
  } as TrainingSession;
}

export interface PrismaRepositoryOptions {
  /** Fault-injection seam for rollback tests; runs after writes but before transaction commit. */
  beforeCommit?: () => void | Promise<void>;
}

export class PrismaTrainingRepository implements TrainingRepository {
  constructor(private readonly client: PrismaClient, private readonly options: PrismaRepositoryOptions = {}) {}

  async publish(input: ScenarioTemplate): Promise<void> {
    const template = validateTemplate(copy(input));
    const key = { templateId: template.id, version: template.version, variant: template.variant };
    try {
      await this.client.$transaction(async tx => {
        await tx.scenario.upsert({ where: { id: template.id }, create: { id: template.id, category: template.category }, update: {} });
        const existing = await tx.scenarioTemplateVersion.findUnique({ where: { templateId_version_variant: key } });
        if (existing) {
          if (canonical(existing.configuration) !== canonical(template)) throw new DomainError("PUBLISHED_TEMPLATE_IMMUTABLE");
          return;
        }
        await tx.scenarioTemplateVersion.create({ data: { ...key, configuration: json(template) } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.client.scenarioTemplateVersion.findUnique({ where: { templateId_version_variant: key } });
        if (existing && canonical(existing.configuration) === canonical(template)) return;
        if (existing) throw new DomainError("PUBLISHED_TEMPLATE_IMMUTABLE");
      }
      throw error;
    }
  }

  async getTemplate(id: string, version: number, variant: ScenarioVariant): Promise<ScenarioTemplate> {
    const row = await this.client.scenarioTemplateVersion.findUnique({ where: { templateId_version_variant: { templateId: id, version, variant } } });
    if (!row) throw new DomainError("TEMPLATE_NOT_FOUND");
    return validateTemplate(row.configuration);
  }

  async create(session: TrainingSession): Promise<void> {
    const snapshot = copy(session); assertSanitized(snapshot);
    await this.getTemplate(snapshot.templateId, snapshot.templateVersion, snapshot.variant);
    try {
      await this.client.$transaction(async tx => {
        await tx.trainingSession.create({ data: header(snapshot) });
        await this.writeChildren(tx, snapshot);
        await this.options.beforeCommit?.();
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new DomainError("SESSION_ALREADY_EXISTS");
      throw error;
    }
  }

  async get(id: string, ownerId: string): Promise<TrainingSession> {
    // include may execute multiple SELECTs; repeatable read gives one coherent snapshot.
    return this.client.$transaction(async tx => {
      const row = await tx.trainingSession.findFirst({ where: { id, ownerId }, include });
      if (!row) throw new DomainError("SESSION_NOT_FOUND");
      return decode(row);
    }, { isolationLevel: "RepeatableRead" });
  }

  async save(session: TrainingSession, expectedRevision: number): Promise<void> {
    const snapshot = copy(session); assertSanitized(snapshot);
    if (snapshot.revision !== expectedRevision + 1) throw new DomainError("REVISION_CONFLICT");
    try {
      await this.client.$transaction(async tx => {
        // This conditional UPDATE is the linearization point and locks the session row.
        // Everything following it rolls back together, including the revision increment.
        const changed = await tx.trainingSession.updateMany({
          where: { id: snapshot.id, revision: expectedRevision },
          data: { revision: { increment: 1 } },
        });
        if (changed.count !== 1) throw new DomainError("REVISION_CONFLICT");
        const row = await tx.trainingSession.findUniqueOrThrow({ where: { id: snapshot.id }, include });
        const current = decode(row); current.revision = expectedRevision;
        assertUpdate(current, snapshot, expectedRevision);
        await tx.trainingSession.update({ where: { id: snapshot.id }, data: {
          status: snapshot.status, state: snapshot.state, lastActivityAt: new Date(snapshot.lastActivityAt), endedAt: date(snapshot.endedAt),
        } });
        await this.writeChildren(tx, snapshot, current);
        await this.options.beforeCommit?.();
      }, { isolationLevel: "ReadCommitted", timeout: 10_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new DomainError("REVISION_CONFLICT");
      throw error;
    }
  }

  private async writeChildren(tx: Transaction, s: TrainingSession, previous?: TrainingSession): Promise<void> {
    for (const a of s.actions.slice(previous?.actions.length ?? 0)) {
      await tx.trainingAction.create({ data: { id: a.id, sessionId: s.id, kind: a.kind, fingerprint: a.fingerprint,
        state: a.state, revision: a.revision, at: new Date(a.at), validationStatus: a.validationStatus } });
    }
    for (const [position, o] of s.opportunities.entries()) {
      const before = previous?.opportunities[position];
      if (before && canonical(before) === canonical(o)) continue;
      const data = { sessionId: s.id, definitionId: o.definitionId, position, skill: o.skill, state: o.state,
        eligibleMaximum: o.eligibleMaximum, earned: o.earned, openedAt: new Date(o.openedAt), finalizedAt: date(o.finalizedAt),
        finalizedByActionId: o.finalizedByActionId, correctWarningSignIds: json(o.correctWarningSignIds), incorrectEvidenceIds: json(o.incorrectEvidenceIds),
        assessment: o.assessment ?? null };
      if (before) await tx.sessionOpportunity.update({ where: { sessionId_definitionId: { sessionId: s.id, definitionId: o.definitionId } }, data });
      else await tx.sessionOpportunity.create({ data });
    }
    for (const [position, e] of s.events.entries()) {
      if (position < (previous?.events.length ?? 0)) continue;
      await tx.trainingEvent.create({ data: { sessionId: s.id, position, id: e.id, actionId: e.actionId, opportunityId: e.opportunityId,
        code: e.code, state: e.state, ruleId: e.ruleId, authority: e.authority, critical: e.critical, at: new Date(e.at) } });
    }
    for (const t of s.dialogueTurns.slice(previous?.dialogueTurns.length ?? 0)) {
      await tx.dialogueTurnReceipt.create({ data: { sessionId: s.id, id: t.id, actionId: `dialogue:${t.id}`, inputKey: t.inputKey,
        state: t.state, templateVersion: t.templateVersion, snapshotRevision: t.snapshotRevision, committedRevision: t.committedRevision,
        response: json(t.response), candidateStatus: t.candidateStatus, usedFallback: t.usedFallback, failureReason: t.failureReason, attempts: t.attempts } });
    }
    for (const [position, m] of s.messages.entries()) {
      if (position < (previous?.messages.length ?? 0)) continue;
      await tx.trainingMessage.create({ data: { sessionId: s.id, position, id: m.id, turnId: m.turnId, role: m.role, text: m.text, state: m.state, at: new Date(m.at) } });
    }
    if (s.result && !previous?.result) {
      const r = s.result;
      await tx.trainingResult.create({ data: { sessionId: s.id, templateId: r.templateId, templateVersion: r.templateVersion,
        scores: json(r.scores), trainingScore: r.trainingScore, outcome: r.outcome, criticalEventIds: json(r.criticalEventIds),
        weakestSkills: json(r.weakestSkills), recommendation: json(r.recommendation), calculatedAt: new Date(r.calculatedAt),
        evaluationMode: r.evaluationMode ?? "LEGACY_WEIGHTED_V1", decisionSummary: r.decisionSummary ? json(r.decisionSummary) : Prisma.DbNull } });
    }
  }
}
