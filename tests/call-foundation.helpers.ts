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

/** Pinned v4/v5 regression sessions must not silently start latest v6. */
export async function startPinnedStory(repository: TrainingRepository, app: TrainingApplicationService,
  owner: { id: string }, story: "CC-01" | "CC-02" | "CC-N01" | "CC-N02", version = 5, now: () => number = Date.now) {
  const core = await TrainingCore.create(registeredTemplates, repository, now);
  const t = registeredTemplates.find(t => t.version === version && t.callCenter?.storyId === story)!;
  const id = randomUUID().replaceAll("-", ""); await core.start(id, owner.id, t.id, version, t.variant);
  return app.resume(id, owner);
}
