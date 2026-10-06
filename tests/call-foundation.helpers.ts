import { randomUUID } from "node:crypto";
import { TrainingCore } from "../src/core.js";
import { registeredTemplates } from "../src/application/catalog.js";
import type { TrainingApplicationService } from "../src/application/training-service.js";
import type { TrainingRepository } from "../src/domain/training-repository.js";

/** Explicitly pinned historical sessions keep their v2 voice/assessment regression coverage. */
export async function startHistoricalCall(repository: TrainingRepository, app: TrainingApplicationService,
  owner: { id: string }, variant: "SCAM_CALL" | "NORMAL_CALL" = "NORMAL_CALL", now: () => number = Date.now) {
  const core = await TrainingCore.create(registeredTemplates, repository, now);
  const id = randomUUID();
  await core.start(id, owner.id, "call-center-scam", 2, variant);
  return app.resume(id, owner);
}
