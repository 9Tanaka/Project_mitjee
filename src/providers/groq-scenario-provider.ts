import OpenAI from "openai";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { aiCharacterResponseSchema, ProviderRefusal } from "../dialogue/contracts.js";
import type { AICharacterResponse, ProviderOptions, ScenarioAIContext, ScenarioModelProvider } from "../dialogue/contracts.js";
import type { ResponsesClient } from "./openai-scenario-provider.js";
import { buildOpenAIRequest } from "./openai-prompt.js";
import { z } from "zod";

export const GROQ_ENDPOINT = "https://api.groq.com/openai/v1";
export class GroqProviderError extends Error {
  constructor(readonly category: "RATE_LIMITED" | "AUTHENTICATION" | "API_INCOMPATIBLE" | "INVALID_OUTPUT" | "UNAVAILABLE", readonly status?: number) {
    super(`Groq provider: ${category}`); this.name = "GroqProviderError";
  }
}
export function createGroqResponsesClient(apiKey: string): ResponsesClient {
  if (!apiKey.trim() || /\s/.test(apiKey)) throw new Error("GROQ_API_KEY is required on the server");
  const sdk = new OpenAI({ apiKey, baseURL: GROQ_ENDPOINT, organization: null, project: null,
    maxRetries: 0, timeout: 20_000, logLevel: "off" });
  return { create: (body, options) => sdk.responses.create(body, options) };
}
const envelope = z.object({ status: z.literal("completed"), output: z.array(z.union([
  z.object({ type: z.literal("reasoning") }),
  z.object({ type: z.literal("message"), role: z.literal("assistant"), status: z.literal("completed"),
    content: z.array(z.union([z.object({ type: z.literal("output_text"), text: z.string().max(100_000) }),
      z.object({ type: z.literal("refusal"), refusal: z.string() })])) }),
])) });

/** Fixed-endpoint outer adapter. The orchestrator owns retries and authority stays in Core. */
export class GroqScenarioModelProvider implements ScenarioModelProvider {
  readonly #correlationKey = randomBytes(32);
  constructor(private readonly client: ResponsesClient, private readonly model: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(model)) throw new Error("GROQ_MODEL is required on the server");
  }
  async generateCharacterResponse(context: ScenarioAIContext, options?: ProviderOptions): Promise<AICharacterResponse> {
    try {
      options?.signal?.throwIfAborted();
      const opaque = createHmac("sha256", this.#correlationKey).update(options?.requestId ?? randomUUID()).digest("hex");
      const raw = await this.client.create(buildOpenAIRequest(context, this.model), {
        ...(options?.signal ? { signal: options.signal } : {}), headers: { "X-Client-Request-Id": `scenario-${opaque}` },
        maxRetries: 0, timeout: 20_000,
      });
      options?.signal?.throwIfAborted();
      const parsed = envelope.safeParse(raw);
      if (!parsed.success) throw new GroqProviderError("INVALID_OUTPUT");
      const parts = parsed.data.output.flatMap(item => item.type === "message" ? item.content : []);
      if (parts.some(part => part.type === "refusal")) throw new ProviderRefusal("Provider refused scenario dialogue");
      if (parts.length !== 1 || parts[0]?.type !== "output_text") throw new GroqProviderError("INVALID_OUTPUT");
      let value: unknown;
      try { value = JSON.parse(parts[0].text); } catch { throw new GroqProviderError("INVALID_OUTPUT"); }
      const response = aiCharacterResponseSchema.safeParse(value);
      if (!response.success) throw new GroqProviderError("INVALID_OUTPUT");
      return response.data;
    } catch (error) {
      if (options?.signal?.aborted) throw new DOMException("Provider request cancelled", "AbortError");
      if (error instanceof GroqProviderError || error instanceof ProviderRefusal) throw error;
      const status = error instanceof OpenAI.APIError ? error.status : undefined;
      throw new GroqProviderError(status === 429 ? "RATE_LIMITED" : status === 401 || status === 403 ? "AUTHENTICATION"
        : status === 400 || status === 404 || status === 422 ? "API_INCOMPATIBLE" : "UNAVAILABLE", status);
    }
  }
}
