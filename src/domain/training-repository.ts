import type { ScenarioTemplate } from "./schema.js";
import type { TrainingSession } from "./types.js";

export type ScenarioVariant = ScenarioTemplate["variant"];

/** Persistence port. Each save is an all-or-nothing compare-and-swap of the aggregate. */
export interface TrainingRepository {
  publish(template: ScenarioTemplate): Promise<void>;
  getTemplate(id: string, version: number, variant: ScenarioVariant): Promise<ScenarioTemplate>;
  create(session: TrainingSession): Promise<void>;
  get(id: string, ownerId: string): Promise<TrainingSession>;
  save(session: TrainingSession, expectedRevision: number): Promise<void>;
}
