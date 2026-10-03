import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { ProviderRefusal } from "../src/dialogue/contracts.js";
import { GroqProviderError, GroqScenarioModelProvider, createGroqResponsesClient } from "../src/providers/groq-scenario-provider.js";
import { createScenarioProvider } from "../src/server/scenario-provider.js";
import { answer, context, deferred, envelope, fakeClient, refusal } from "./openai.fixtures.js";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each([
  { AI_PROVIDER: "groq" },
  { AI_PROVIDER: "groq", GROQ_API_KEY: "test-key" },
  { AI_PROVIDER: "groq", GROQ_MODEL: "openai/gpt-oss-120b", OPENAI_API_KEY: "must-not-reuse" },
  { AI_PROVIDER: "groq", GROQ_API_KEY: " ", GROQ_MODEL: "test-model" },
  { AI_PROVIDER: "groq", GROQ_API_KEY: "bad key", GROQ_MODEL: "test-model" },
  { AI_PROVIDER: "groq", GROQ_API_KEY: "test-key", GROQ_MODEL: "bad model" },
])("Groq requires its own explicit valid key and model %#", env => {
  expect(() => createScenarioProvider(env)).toThrow(/GROQ_API_KEY|GROQ_MODEL/);
});

it("explicit Groq configuration accepts a namespaced model without substituting OpenAI", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(envelope())); vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("OPENAI_BASE_URL", "https://unapproved.invalid/v1");
  vi.stubEnv("GROQ_BASE_URL", "https://unapproved.invalid/v1");
  vi.stubEnv("OPENAI_LOG", "debug"); vi.stubEnv("OPENAI_ORG_ID", "private-organization");
  vi.stubEnv("OPENAI_PROJECT_ID", "private-project");
  const key = randomUUID();
  const provider = createScenarioProvider({ AI_PROVIDER: "groq", GROQ_API_KEY: key,
    GROQ_MODEL: "openai/gpt-oss-120b", OPENAI_API_KEY: "other-provider-key", OPENAI_MODEL: "other-model" });
  expect(provider).toBeInstanceOf(GroqScenarioModelProvider);
  expect(await provider.generateCharacterResponse(context())).toEqual(answer());
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0]![0])).toBe("https://api.groq.com/openai/v1/responses");
  const options = fetcher.mock.calls[0]![1];
  const headers = new Headers(options.headers);
  expect(headers.get("authorization")).toBe(`Bearer ${key}`);
  expect(headers.has("openai-organization")).toBe(false); expect(headers.has("openai-project")).toBe(false);
  const request = JSON.parse(options.body);
  expect(Object.hasOwn(request, "store")).toBe(false);
  expect(request).toMatchObject({ model: "openai/gpt-oss-120b", stream: false,
    text: { format: { type: "json_schema", strict: true } } });
  expect(request.text.format.schema.additionalProperties).toBe(false);
  expect(request).not.toHaveProperty("tools"); expect(request).not.toHaveProperty("user");
});

it.each(["score", "assessment", "next_state", "transition", "critical_failure", "pass", "opportunityId"])(
  "rejects authoritative field %s using the existing strict response schema", async field => {
    const client = fakeClient(); client.create.mockResolvedValue(envelope({ ...answer(), [field]: "FORBIDDEN" }));
    await expect(new GroqScenarioModelProvider(client, "test-model").generateCharacterResponse(context()))
      .rejects.toMatchObject({ category: "INVALID_OUTPUT" });
  },
);
it.each([
  { status: "completed", output: [] },
  { ...envelope(), status: "incomplete" },
  envelope(answer({ character_message: "  " })),
  envelope(answer({ candidate_event: "SAFE_ACTION", event_code: null })),
  envelope({ ...answer(), safety: { contains_real_pii: false, out_of_scope: false, score: 100 } }),
  { status: "completed", output: [{ type: "function_call", arguments: "{}" }] },
  { status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [
    { type: "output_text", text: `prefix ${JSON.stringify(answer())} suffix` },
  ] }] },
])("rejects malformed/incomplete/non-JSON output without extracting JSON %#", async output => {
  const client = fakeClient(); client.create.mockResolvedValue(output);
  await expect(new GroqScenarioModelProvider(client, "test-model").generateCharacterResponse(context()))
    .rejects.toMatchObject({ category: "INVALID_OUTPUT" });
});

it("refusal is sanitized and preserves the shared orchestrator refusal contract", async () => {
  const client = fakeClient(); client.create.mockResolvedValue(refusal());
  const error = await new GroqScenarioModelProvider(client, "test-model").generateCharacterResponse(context()).catch(e => e);
  expect(error).toBeInstanceOf(ProviderRefusal);
  expect(error.message).not.toContain("RAW_REFUSAL"); expect(error.cause).toBeUndefined();
});

it.each([[429, "RATE_LIMITED"], [401, "AUTHENTICATION"], [403, "AUTHENTICATION"],
  [400, "API_INCOMPATIBLE"], [404, "API_INCOMPATIBLE"], [422, "API_INCOMPATIBLE"], [500, "UNAVAILABLE"]] as const)(
  "HTTP %s makes one transport attempt and exposes only category %s", async (status, category) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: { message: "PRIVATE_PROVIDER_BODY", type: "test" } }, { status }));
    vi.stubGlobal("fetch", fetcher);
    const logs = [vi.spyOn(console, "log").mockImplementation(() => {}), vi.spyOn(console, "info").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}), vi.spyOn(console, "error").mockImplementation(() => {})];
    const provider = new GroqScenarioModelProvider(createGroqResponsesClient(randomUUID()), "openai/gpt-oss-120b");
    const error = await provider.generateCharacterResponse(context()).catch(e => e);
    expect(error).toBeInstanceOf(GroqProviderError); expect(error).toMatchObject({ category, status });
    expect(error.cause).toBeUndefined(); expect(error).not.toHaveProperty("headers");
    expect(JSON.stringify(error) + error.message + error.stack).not.toContain("PRIVATE_PROVIDER_BODY");
    expect(fetcher).toHaveBeenCalledTimes(1); expect(logs.every(log => log.mock.calls.length === 0)).toBe(true);
  },
);

it("unknown SDK errors expose neither body nor credentials nor an attached cause", async () => {
  const client = fakeClient(); client.create.mockRejectedValue(Object.assign(new Error("PRIVATE_BODY"), {
    headers: { Authorization: "PRIVATE_TOKEN" }, cause: new Error("PRIVATE_CAUSE"),
  }));
  const error = await new GroqScenarioModelProvider(client, "test-model").generateCharacterResponse(context()).catch(e => e);
  expect(error).toMatchObject({ category: "UNAVAILABLE" }); expect(error.cause).toBeUndefined();
  expect(JSON.stringify(error) + error.message).not.toMatch(/PRIVATE/);
});

it("forwards cancellation with SDK retries disabled and opaque correlation", async () => {
  const client = fakeClient(), controller = new AbortController();
  await new GroqScenarioModelProvider(client, "test-model").generateCharacterResponse(context(), {
    signal: controller.signal, requestId: "private@example.test:private-session\r\n",
  });
  const options = client.create.mock.calls[0]![1];
  expect(options.signal).toBe(controller.signal); expect(options).toMatchObject({ maxRetries: 0, timeout: 20_000 });
  expect(options.headers["X-Client-Request-Id"]).toMatch(/^scenario-[a-f0-9]{64}$/);
  expect(JSON.stringify(options.headers)).not.toContain("private");
});

it("aborted requests and late responses never return usable content", async () => {
  const client = fakeClient(), provider = new GroqScenarioModelProvider(client, "test-model");
  const stopped = new AbortController(); stopped.abort(new Error("PRIVATE_ABORT_REASON"));
  await expect(provider.generateCharacterResponse(context(), { signal: stopped.signal })).rejects.toMatchObject({ name: "AbortError" });
  expect(client.create).not.toHaveBeenCalled();
  const gate = deferred<unknown>(), active = new AbortController(); client.create.mockReturnValue(gate.promise);
  const pending = provider.generateCharacterResponse(context(), { signal: active.signal });
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  active.abort(); gate.resolve(envelope()); await rejected;
});
