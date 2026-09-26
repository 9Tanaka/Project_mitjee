import { TrainingCore } from "../core.js";
import type { TrainingRepository } from "../domain/training-repository.js";
import type { ScenarioModelProvider } from "../dialogue/contracts.js";
import { ScenarioDialogueOrchestrator } from "../dialogue/orchestrator.js";
import { playableTemplate } from "./catalog.js";
import { smsPhishingFixture } from "../fixtures/sms-phishing.js";
import { smsPhishingDialogueFixture } from "../fixtures/sms-phishing-dialogue.js";
import { TrainingApplicationService } from "./training-service.js";

export async function createApplication(repository: TrainingRepository,
  provider: ScenarioModelProvider, now: () => number = Date.now) {
  const core = await TrainingCore.create([smsPhishingFixture, smsPhishingDialogueFixture, playableTemplate], repository, now);
  return new TrainingApplicationService(core, new ScenarioDialogueOrchestrator(core, provider));
}
