import { DomainError } from "./types.js";
import type { TrainingSession } from "./types.js";
import type { ScenarioTemplate } from "./schema.js";
import type { ScenarioVariant, TrainingRepository } from "./training-repository.js";
import { copy } from "./copy.js";
import { assertSanitized, assertUpdate, canonical } from "./persistence-contract.js";
import { validateTemplate } from "./template-validator.js";
export { copy } from "./copy.js";

// Serializable, copy-isolated snapshots. Synchronous CAS is atomic in this in-memory adapter.
export class InMemoryTrainingRepository implements TrainingRepository {
  private readonly records = new Map<string, TrainingSession>();
  // Published versions share the lifetime of sessions, not of an individual Core instance.
  readonly #published = new Map<string, ScenarioTemplate>();

  async publish(template: ScenarioTemplate): Promise<void> {
    template = validateTemplate(copy(template));
    const key = `${template.id}@${template.version}@${template.variant}`;
    const existing = this.#published.get(key);
    if (existing && canonical(existing) !== canonical(template)) {
      throw new DomainError("PUBLISHED_TEMPLATE_IMMUTABLE");
    }
    if (!existing) this.#published.set(key, copy(template));
  }

  async getTemplate(id: string, version: number, variant: ScenarioVariant = "DEFAULT"): Promise<ScenarioTemplate> {
    const template = this.#published.get(`${id}@${version}@${variant}`);
    if (!template) throw new DomainError("TEMPLATE_NOT_FOUND");
    return copy(template);
  }

  async create(session: TrainingSession): Promise<void> {
    assertSanitized(session);
    if (this.records.has(session.id)) throw new DomainError("SESSION_ALREADY_EXISTS");
    if (!this.#published.has(`${session.templateId}@${session.templateVersion}@${session.variant}`)) throw new DomainError("TEMPLATE_NOT_FOUND");
    this.records.set(session.id, copy(session));
  }

  async get(id: string, ownerId: string): Promise<TrainingSession> {
    const session = this.records.get(id);
    if (!session || session.ownerId !== ownerId) throw new DomainError("SESSION_NOT_FOUND");
    return copy(session);
  }

  async save(session: TrainingSession, expectedRevision: number): Promise<void> {
    const current = this.records.get(session.id);
    if (!current) {
      throw new DomainError("REVISION_CONFLICT");
    }
    assertUpdate(current, session, expectedRevision);
    this.records.set(session.id, copy(session));
  }
}

// Backwards-compatible name for callers; both adapters implement the same asynchronous port.
export { InMemoryTrainingRepository as InMemorySessionRepository };
