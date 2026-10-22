import type { TrainingRepository, ScenarioVariant } from "../domain/training-repository.js";
import type { ScenarioTemplate } from "../domain/schema.js";
import type { TrainingSession } from "../domain/types.js";
import { countRepository, measureLatency, type RepositoryOperation } from "./latency.js";

const wrappers = new WeakMap<TrainingRepository, TrainingRepository>();
/** Logical training-port calls, not SQL statements. Never changes the repository contract. */
export function measuredRepository(repository: TrainingRepository): TrainingRepository {
  const existing = wrappers.get(repository); if (existing) return existing;
  async function observe<T>(operation: RepositoryOperation, work: () => Promise<T>): Promise<T> {
    const end = countRepository(operation);
    try { const result = await (operation === "save" ? measureLatency("durable_save", work) : work()); end(true); return result; }
    catch (error) { end(false); throw error; }
  }
  const measured: TrainingRepository = {
    publish: (template: ScenarioTemplate) => observe("publish", () => repository.publish(template)),
    getTemplate: (id: string, version: number, variant: ScenarioVariant) => observe("getTemplate", () => repository.getTemplate(id, version, variant)),
    create: (session: TrainingSession) => observe("create", () => repository.create(session)),
    get: (id: string, ownerId: string) => observe("get", () => repository.get(id, ownerId)),
    save: (session: TrainingSession, expectedRevision: number) => observe("save", () => repository.save(session, expectedRevision)),
  };
  wrappers.set(repository, measured); wrappers.set(measured, measured);
  return measured;
}
