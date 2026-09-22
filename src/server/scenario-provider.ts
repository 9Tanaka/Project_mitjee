import type { ScenarioModelProvider } from "../dialogue/contracts.js";
import { MockScenarioModelProvider } from "../dialogue/mock-provider.js";
import { createOpenAIResponsesClient, OpenAIScenarioModelProvider } from "../providers/openai-scenario-provider.js";

export class ScenarioProviderConfigurationError extends Error {
  constructor(message: string) { super(message); this.name = "ScenarioProviderConfigurationError"; }
}
export function createScenarioProvider(env: Readonly<Record<string, string | undefined>> = process.env): ScenarioModelProvider {
  if (env.AI_PROVIDER === "mock") return new MockScenarioModelProvider();
  if (env.AI_PROVIDER !== "openai") throw new ScenarioProviderConfigurationError("AI_PROVIDER must explicitly be mock or openai");
  if (!env.OPENAI_API_KEY?.trim() || /\s/.test(env.OPENAI_API_KEY))
    throw new ScenarioProviderConfigurationError("OPENAI_API_KEY is required for AI_PROVIDER=openai");
  if (!env.OPENAI_MODEL || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(env.OPENAI_MODEL))
    throw new ScenarioProviderConfigurationError("OPENAI_MODEL is required for AI_PROVIDER=openai");
  return new OpenAIScenarioModelProvider(createOpenAIResponsesClient(env.OPENAI_API_KEY), env.OPENAI_MODEL);
}
