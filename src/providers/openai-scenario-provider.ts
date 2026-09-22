import OpenAI from "openai";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { aiCharacterResponseSchema, ProviderRefusal } from "../dialogue/contracts.js";
import type { AICharacterResponse, ProviderOptions, ScenarioAIContext, ScenarioModelProvider } from "../dialogue/contracts.js";
import { buildOpenAIRequest } from "./openai-prompt.js";

export interface ResponsesClient {
  create(body: ResponseCreateParamsNonStreaming, options: {
    signal?: AbortSignal; headers: Record<string, string>; maxRetries: number; timeout: number;
  }): Promise<unknown>;
}
export class OpenAIProviderError extends Error {
  constructor() { super("OpenAI dialogue provider unavailable or invalid output"); this.name = "OpenAIProviderError"; }
}
export function createOpenAIResponsesClient(apiKey: string): ResponsesClient {
  if (!apiKey.trim() || /\s/.test(apiKey)) throw new Error("OPENAI_API_KEY must be configured on the server");
  const sdk = new OpenAI({
    apiKey, baseURL: "https://api.openai.com/v1", organization: null, project: null,
    maxRetries: 0, timeout: 20_000, logLevel: "off",
  });
  return { create: (body, options) => sdk.responses.create(body, options) };
}

const envelope = z.object({
  status: z.literal("completed"),
  output: z.array(z.union([
    z.object({ type: z.literal("message"), role: z.literal("assistant"), status: z.literal("completed"),
      content: z.array(z.union([
        z.object({ type: z.literal("output_text"), text: z.string().max(100_000) }),
        z.object({ type: z.literal("refusal"), refusal: z.string() }),
      ])) }),
    z.object({ type: z.literal("reasoning") }),
  ])),
});

/** Outer adapter only: no Core/repository reference, callbacks, state or scoring decisions. */
export class OpenAIScenarioModelProvider implements ScenarioModelProvider {
  readonly #correlationKey = randomBytes(32);
  constructor(private readonly client: ResponsesClient, private readonly model: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(model)) throw new Error("OPENAI_MODEL must be configured on the server");
  }

  async generateCharacterResponse(context: ScenarioAIContext, options?: ProviderOptions): Promise<AICharacterResponse> {
    try {
      options?.signal?.throwIfAborted();
      // Avoid forwarding user-controlled IDs, session IDs or PII in a request header.
      const opaque = createHmac("sha256", this.#correlationKey).update(options?.requestId ?? randomUUID()).digest("hex");
      const raw = await this.client.create(buildOpenAIRequest(context, this.model), {
        ...(options?.signal ? { signal: options.signal } : {}),
        headers: { "X-Client-Request-Id": "scenario-" + opaque }, maxRetries: 0, timeout: 20_000,
      });
      options?.signal?.throwIfAborted(); // A non-cooperative transport cannot return a late usable result.
      const parsed = envelope.safeParse(raw);
      if (!parsed.success) throw new OpenAIProviderError();
      const parts = parsed.data.output.flatMap(item => item.type === "message" ? item.content : []);
      if (parts.some(part => part.type === "refusal")) throw new ProviderRefusal("Provider refused scenario dialogue");
      if (parts.length !== 1 || parts[0]?.type !== "output_text") throw new OpenAIProviderError();
      const result = aiCharacterResponseSchema.safeParse(JSON.parse(parts[0].text));
      if (!result.success) throw new OpenAIProviderError();
      return result.data;
    } catch (error) {
      if (options?.signal?.aborted) throw new DOMException("Provider request cancelled", "AbortError");
      if (error instanceof ProviderRefusal) throw error;
      // Deliberately discard SDK body/headers/request/causes and invalid model output.
      throw new OpenAIProviderError();
    }
  }
}
