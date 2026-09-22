// Opt-in only: not matched by the default *.test.ts suite.
import { it } from "vitest";
import { TrainingCore } from "../src/core.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { ScenarioDialogueOrchestrator } from "../src/dialogue/orchestrator.js";
import { aiCharacterResponseSchema } from "../src/dialogue/contracts.js";
import { createOpenAIResponsesClient, OpenAIScenarioModelProvider } from "../src/providers/openai-scenario-provider.js";
import { smsPhishingDialogueFixture as fixture } from "../src/fixtures/sms-phishing-dialogue.js";

it("one synthetic live turn validates schema and preserves backend authority", async () => {
  let attempts = 0;
  const model = process.env.OPENAI_MODEL ?? "";
  if (process.env.AI_PROVIDER !== "openai" || !process.env.OPENAI_API_KEY || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(model)) {
    throw new Error("Real OpenAI verification NOT RUN: missing/invalid private configuration");
  }
  const client = createOpenAIResponsesClient(process.env.OPENAI_API_KEY);
  const provider = new OpenAIScenarioModelProvider({ create: (body, options) => {
    if (++attempts > 2) throw new Error("Live smoke request budget exceeded");
    return client.create(body, options);
  } }, model);
  const core = await TrainingCore.create([fixture], new InMemoryTrainingRepository());
  await core.start("synthetic-live-session", "synthetic-owner", fixture.id, 2);
  const before = await core.resume("synthetic-live-session", "synthetic-owner");
  const started = Date.now();
  try {
    const reply = await new ScenarioDialogueOrchestrator(core, provider).sendMessage({
      sessionId: before.id, ownerId: before.ownerId, expectedRevision: before.revision, turnId: "synthetic-live-turn",
      text: "นี่คือการฝึกด้วยข้อมูลสมมติ ขอรายละเอียดข้อความในสถานการณ์นี้",
    });
    const after = await core.resume(before.id, before.ownerId);
    // Boolean assertions only: never print raw model content on a failed equality assertion.
    const valid = !reply.turn.usedFallback && aiCharacterResponseSchema.safeParse(reply.turn.response).success &&
      reply.turn.response.character_message.trim().length > 0 && after.state === before.state &&
      after.status === before.status && after.result === null && after.revision === before.revision + 1 &&
      after.dialogueTurns.length === 1 && after.messages.length === 2 &&
      JSON.stringify(after.events) === JSON.stringify(before.events) &&
      JSON.stringify(after.opportunities) === JSON.stringify(before.opportunities);
    if (!valid) throw new Error("Live verification failed schema/commit/authority checks or used fallback");
    console.info(JSON.stringify({ liveNetwork: "PASS", model, attempts, schema: "PASS", latencyMs: Date.now() - started }));
  } catch {
    console.info(JSON.stringify({ liveNetwork: "FAIL", model, attempts, latencyMs: Date.now() - started }));
    throw new Error("Live OpenAI verification failed; raw provider data intentionally withheld");
  }
});
