import { TrainingCore } from "../core.js";
import type { TrainingRepository } from "../domain/training-repository.js";
import type { ScenarioModelProvider } from "../dialogue/contracts.js";
import { ScenarioDialogueOrchestrator } from "../dialogue/orchestrator.js";
import { registeredTemplates } from "./catalog.js";
import { smsPhishingFixture } from "../fixtures/sms-phishing.js";
import { smsPhishingDialogueFixture } from "../fixtures/sms-phishing-dialogue.js";
import { smsPhishingDecisionRulesFixture } from "../fixtures/sms-phishing-decision-rules.js";
import { TrainingApplicationService, type CallVariantSelector } from "./training-service.js";

export async function createApplication(repository: TrainingRepository,
  provider: ScenarioModelProvider, now: () => number = Date.now, selectCallVariant?: CallVariantSelector) {
  const core = await TrainingCore.create([smsPhishingFixture, smsPhishingDialogueFixture, smsPhishingDecisionRulesFixture, ...registeredTemplates], repository, now);
  return new TrainingApplicationService(core, new ScenarioDialogueOrchestrator(core, provider), selectCallVariant);
}
