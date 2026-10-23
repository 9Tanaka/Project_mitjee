# AI runtime baseline (inventory only)

Owner: LUNA MAX. Snapshot: 2026-10-22, branch `feat/rule-based-evaluation`, HEAD `fc5af44c2773851179b8a3599d370c3a178b1cb2`.

This records the configured AI runtime and source-level limits before any AI optimization. No provider request, evaluation run, test, or runtime change was made. The configured identity below is from this checkout's `.env.local`; deployment or process-level configuration can override it.

## Current provider and model

| Item | Current finding |
|---|---|
| Provider selector | `AI_PROVIDER=groq` in `.env.local`; `src/server/scenario-provider.ts` also permits `mock` and `openai`, and rejects an unset or unsupported value. |
| Model identifier | `GROQ_MODEL=openai/gpt-oss-120b` in `.env.local`. This is a configured identifier only; no live call verified model availability or account access. |
| Provider endpoint / protocol | Groq's OpenAI-compatible Responses endpoint, `https://api.groq.com/openai/v1`, through the OpenAI SDK. |
| SDK | `openai` package `7.21.0`. |
| Credential status | The `GROQ_API_KEY` name has a nonempty assignment in `.env.local`; its value was not read or reproduced, and key validity/reachability were not checked. |
| Provider boundary | `ScenarioModelProvider.generateCharacterResponse(context, options)` returns a structured candidate. It receives no Core or repository and cannot set authoritative state/results. The backend continues to validate and commit candidates. |

The local file's non-secret provider/model identifiers were inspected directly. No process-environment override for those identifiers was present in the inspection process. A deployed runtime may have different values.

## Prompt, history, and output limits

The request is built by `src/providers/openai-prompt.ts`; it is not a wholesale serialization of application/session objects. It includes the fixed `MITJEE_SCENARIO_DIALOGUE_V1` instruction string, allowlisted scenario/state/role/behavior context, and JSON-serialized dialogue content. Call-center requests add the allowed semantic signals and authored fallback signal. Responses use a strict JSON Schema derived from the runtime Zod schema.

| Input/output detail | Configured behavior |
|---|---|
| Prior dialogue | At most the last 12 sanitized messages; each prior message text is truncated to 2,000 characters. |
| Current learner message | Sanitized and truncated to 8,000 characters. The request validator also caps submitted text at 8,000 characters. |
| Dialogue text ceiling | At most 24,000 prior-message characters plus 8,000 current-message characters (32,000 total text characters), before JSON, scenario context, instructions, and schema overhead. Opening turns have no current learner message. |
| Prompt structure | Nonstreaming Responses request with a separate `instructions` field, developer scenario context, and user dialogue JSON; an opening turn sends developer context only. Groq omits the OpenAI-only `store` parameter. |
| Response format | Strict JSON Schema. `character_message` is limited to 8,000 characters; structured intent/event/safety fields are enumerated and call conversations add typed signal/status fields. The provider adapter and orchestrator both validate output. |
| Output token cap | `max_output_tokens: 1200`. |
| Streaming / TTFT | `stream: false`; no first-token event is emitted. TTFT is unavailable for this path. |

Actual prompt characters/tokens, provider input/output token usage, and effective model context utilization are not currently measured. The 32,000-character dialogue ceiling excludes prompt instructions, JSON encoding, scenario metadata, and the generated schema; it is not a token estimate. No tokens-per-second figure is available.

## Decoding and inference configuration

The request sets the model, `stream: false`, `max_output_tokens: 1200`, instructions, input, and strict JSON Schema. It does not set temperature, top-p, a seed, or another sampling control; provider/model defaults apply. The effective defaults were not queried from Groq.

Inference is remote through Groq. `src/server/runtime.ts` lazily creates and caches one provider/client per application runtime worker. There is no local model artifact, local serving runtime, model-load option, or explicit application warm-up request in the inspected source. Remote provider cold-start/model residency behavior is unknown and unmeasured.

No Qwen/Ollama/llama.cpp/vLLM/Transformers inference dependency, model weights, QLoRA adapter, dataset, or quantization configuration was found in runtime code, package dependencies, or scripts. Quantization is not configured by this remote-client path; the provider's serving precision/quantization is not exposed to this application. Qwen/QLoRA material exists in proposal documentation only and is a separate workstream.

## Deadlines and retries

| Layer | Setting / behavior |
|---|---|
| SDK request | 20,000 ms timeout; SDK automatic retries disabled (`maxRetries: 0`). |
| Orchestrator attempt | 20,000 ms `AbortController`/deadline race per call. This is the same per-attempt interval as the SDK timeout, not an additional sequential timeout. |
| Attempts | At most two sequential provider attempts total: the initial attempt plus one immediate retry. No backoff is configured. |
| Retry exception | A response rejected as `SAFETY_BLOCKED` stops immediately; other failures, including invalid output/refusal/provider errors/timeouts, may use the one retry. |
| Fallback | After attempts are exhausted (or a safety-blocked candidate), the authored state fallback is used and the dialogue is committed through the existing backend flow. |

The LLM span is bounded to about 40 seconds across two attempts in the worst case, excluding context construction, validation/commit outside the span, transport overhead, and other request stages. This is a source-level upper bound, not an observed latency.

## Measurement status and unknowns

Source-level latency instrumentation in `src/observability/latency.ts` records context, LLM, validation, retry, AI, and commit durations, attempts/retry count, and repository operation counts. It deliberately reports `ttftMs: null` with reason `non_streaming`. It does not record prompt size, provider token usage, context-window utilization, or tokens per second. No AI quality/safety evaluation corpus or measured AI baseline was produced in this inventory task.

| Metric or property | Status |
|---|---|
| Active deployed provider/model | Unknown beyond local `.env.local`; deployment overrides were not inspected. |
| Credential validity, service reachability, model availability | Not checked; no provider calls. |
| Prompt/token counts and provider token usage | Not measured or captured by the adapter. |
| Effective model context window / utilization | Not configured in app and not verified against the provider. |
| Temperature and other decoding defaults | Not set by application; provider/model defaults unknown. |
| TTFT and tokens/sec | Unavailable for current nonstreaming adapter; token usage is not retained. |
| Provider model loading/warm state | Remote-side behavior unknown; no model warm-up call. |
| Quantization / local inference | No local setup found; remote serving details unavailable. |
| Latency, quality, schema-failure, retry, and safety rates | No benchmark/evaluation was run for this document. |

The next authorized step is ASTRA's AI optimization plan and, separately, the planned evaluation harness. Keep prompt/history/retry/model changes out of implementation until comparable latency and quality/safety measurements justify one change at a time. Model output remains non-authoritative; official scenario outcomes remain backend-owned.

## Files inspected

`ENGINEERING_PLAN.md`, `REPO_INVENTORY.md`, `.env.local` (only the non-secret `AI_PROVIDER`, `GROQ_MODEL`, and `OPENAI_MODEL` identifiers were emitted; no secret values), `package.json`, `src/server/scenario-provider.ts`, `src/server/runtime.ts`, `src/providers/groq-scenario-provider.ts`, `src/providers/openai-scenario-provider.ts`, `src/providers/openai-prompt.ts`, `src/dialogue/contracts.ts`, `src/dialogue/orchestrator.ts`, `src/dialogue/sanitize.ts`, and `src/observability/latency.ts`.

Decision rule changed: NO. Runtime architecture changed: NO.
