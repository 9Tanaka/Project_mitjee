import { TrainingCore } from "../core.js";
import type { TrainingRepository } from "../domain/training-repository.js";
import type { ScenarioModelProvider } from "../dialogue/contracts.js";
import { ScenarioDialogueOrchestrator } from "../dialogue/orchestrator.js";
import { MockScenarioModelProvider } from "../dialogue/mock-provider.js";
import { playableTemplate } from "./catalog.js";
import { TrainingApplicationService } from "./training-service.js";

export async function createApplication(repository: TrainingRepository,
  provider: ScenarioModelProvider = new MockScenarioModelProvider(), now: () => number = Date.now) {
  const core = await TrainingCore.create([playableTemplate], repository, now);
  return new TrainingApplicationService(core, new ScenarioDialogueOrchestrator(core, provider));
}
