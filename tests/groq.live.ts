// Opt-in only: never included in the default *.test.ts suite.
import { it } from "vitest";
import { TrainingCore } from "../src/core.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { ScenarioDialogueOrchestrator } from "../src/dialogue/orchestrator.js";
import { aiCharacterResponseSchema, ProviderRefusal } from "../src/dialogue/contracts.js";
import type { ScenarioModelProvider } from "../src/dialogue/contracts.js";
import { createGroqResponsesClient, GroqProviderError, GroqScenarioModelProvider } from "../src/providers/groq-scenario-provider.js";
import { smsPhishingDecisionRulesFixture as fixture } from "../src/fixtures/sms-phishing-decision-rules.js";

it("synthetic Groq live turn has Thai text, strict output and unchanged backend authority", async () => {
  const model = process.env.GROQ_MODEL ?? "";
  if (process.env.AI_PROVIDER !== "groq" || !process.env.GROQ_API_KEY?.trim() || /\s/.test(process.env.GROQ_API_KEY) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(model)) {
    throw new Error("Groq live verification NOT RUN: missing/invalid private configuration");
  }
  const client = createGroqResponsesClient(process.env.GROQ_API_KEY); let attempts = 0;
  const adapter = new GroqScenarioModelProvider({ create: (body, options) => {
    if (++attempts > 2) throw new Error("Live request budget exceeded");
    return client.create(body, options);
  } }, model);
  let failure: { category: string; status?: number } | null = null;
  const provider: ScenarioModelProvider = { async generateCharacterResponse(context, options) {
    try { return await adapter.generateCharacterResponse(context, options); }
    catch (error) {
      failure = error instanceof GroqProviderError
        ? { category: error.category, ...(error.status === undefined ? {} : { status: error.status }) }
        : { category: error instanceof ProviderRefusal ? "REFUSAL" : error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "UNAVAILABLE" };
      throw error;
    }
  } };
  const core = await TrainingCore.create([fixture], new InMemoryTrainingRepository());
  await core.start("synthetic-groq-session", "synthetic-owner", fixture.id, fixture.version);
  const before = await core.resume("synthetic-groq-session", "synthetic-owner"), started = Date.now();
  try {
    const reply = await new ScenarioDialogueOrchestrator(core, provider).sendMessage({
      sessionId: before.id, ownerId: before.ownerId, expectedRevision: before.revision, turnId: "synthetic-groq-turn",
      text: "นี่คือการฝึกด้วยข้อมูลสมมติ ขอรายละเอียดข้อความในสถานการณ์นี้",
    });
    const after = await core.resume(before.id, before.ownerId);
    // Boolean checks avoid leaking full content, request data or response data in assertion diffs.
    const schema = aiCharacterResponseSchema.safeParse(reply.turn.response).success;
    const thaiPresent = /[\u0E01-\u0E5B]/u.test(reply.turn.response.character_message);
    const authorityUnchanged = after.state === before.state && after.status === before.status &&
      JSON.stringify(after.result) === JSON.stringify(before.result) &&
      JSON.stringify(after.opportunities) === JSON.stringify(before.opportunities) &&
      JSON.stringify(after.events) === JSON.stringify(before.events);
    const valid = schema && thaiPresent && reply.turn.response.character_message.trim().length > 0 &&
      authorityUnchanged && !reply.turn.usedFallback && attempts > 0 && attempts <= 2 &&
      after.revision === before.revision + 1 && after.dialogueTurns.length === 1 && after.messages.length === 2;
    if (!valid) {
      if (reply.turn.usedFallback && !failure) failure = { category: reply.turn.failureReason ?? "FALLBACK_USED" };
      throw new Error("Groq live integration checks failed");
    }
    console.info(JSON.stringify({ groqLive: "PASS", model, attempts, schema: "PASS", thaiPresence: "PASS",
      backendAuthority: "UNCHANGED", fallback: false, latencyMs: Date.now() - started }));
  } catch {
    const category = failure ?? { category: "INTEGRATION_CHECK_FAILED" };
    console.info(JSON.stringify({ groqLive: "FAIL", model, attempts, ...category, latencyMs: Date.now() - started }));
    throw new Error("Groq live verification failed; see sanitized category/status above. Raw provider data withheld.");
  }
});
