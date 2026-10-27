# Offline AI evaluation harness

Status: harness and synthetic corpus only. This document does not authorize or report a new provider run. The initial live latency baseline is a separate, bounded synthetic workload; it did not capture enough candidate outputs to backfill language-quality, safety, or schema-failure rates.

## Scope and guardrails

The evaluator is offline. It has no provider client and does not make network calls. It builds deterministic fixture contexts from the pinned authored call-center v6 templates and invokes the same `buildOpenAIRequest` used by the runtime only to count serialized prompt fields. The request is never sent. Runtime providers, prompts, Core, and public contracts are unchanged.

The pinned target configuration identity is Groq Responses, model `openai/gpt-oss-120b`, nonstreaming, 1200 output tokens, and at most two orchestrator attempts. This is configuration identity, not proof of current service availability or a guarantee of deployed configuration. No local Qwen model, quantized weights, tokenizer, GPU, or training set is established. Quantization and QLoRA are outside this harness and remain unverified.

The corpus at `tests/fixtures/ai-evaluation/corpus.v1.json` contains 19 synthetic cases over `CC-01`, `CC-02`, `CC-N01`, and `CC-N02`, all template version 6. It covers opening and learner-response turns; zero, short, and 12-message histories; Thai naturalness and role/scenario consistency; schema validity; instruction override; ambiguity; safe and risky stated intentions; and both scam and normal controls. Fixture annotations and the authored state signal allowlist are research hints only. They do not define official scenario outcomes, validated learner actions, or scores. Corpus validation rejects text that the runtime sanitizer would alter, as a basic synthetic-fixture guard; this is not a general PII detector.

Do not add real user data, credentials, private transcripts, or provider error bodies to fixtures or run files. Candidate outputs may contain generated sensitive content: keep source run JSON local and access-controlled, do not commit it, and do not send it to latency telemetry. Reports omit candidate dialogue and provider error bodies. They keep only case identifiers, status categories, contract issue paths, and behavior-rule identifiers with UTF-16 offsets; no generated-text digest is emitted.

## Commands

Run these from the project root:

```powershell
node --import tsx scripts/evaluate-ai.mjs validate-corpus
node --import tsx scripts/evaluate-ai.mjs manifest
node --import tsx scripts/evaluate-ai.mjs report .\local-ai-run.json
node --import tsx scripts/evaluate-ai.mjs compare .\before.json .\after.json
```

`validate-corpus` checks fixture identity and coverage. `manifest` prints pinned corpus/template hashes, per-case metadata, authored allowed-signal annotations, and prompt character/UTF-8-byte counts. It never prints the prompt. The counts are based on JSON serialization of `instructions`, `input`, and `text`/schema fields returned by the actual request builder. Character counts mean Unicode code points; bytes are UTF-8. These are request-builder field counts, not token estimates or guaranteed transport wire size.

`report` accepts only a local, offline run record. It validates the run's corpus/template/rubric identity, then reports separate attempt and turn denominators, contract checks, behavior screens, qualified human ratings, recorded timings, and unavailable metrics. `compare` additionally requires exact equality of corpus/template hashes, provider/model configuration, sample policy, and rubric. It emits per-case deltas and always returns `NO_AUTOMATIC_OPTIMIZATION_APPROVAL`.

Neither command invokes Groq, OpenAI, another provider, or a database. An additional paid evaluation is not authorized by this harness. Any future paid run needs an explicit capped-run decision, including setup/warmups in the budget.

## Offline run-record shape

The JSON record has these top-level fields:

| Field | Required content |
|---|---|
| `schemaVersion` | `1` |
| `corpus` | `id`, `version`, `sha256`, copied from the manifest |
| `template` | version and `sha256`, copied from the manifest |
| `rubricVersion` | Must match the pinned corpus |
| `providerConfig` | `provider`, `model`, `api: "responses"`, `streaming: false`, `maxOutputTokens: 1200`, `maxAttempts: 2`, and `adapterFailureTaxonomy` |
| `samplePolicy` | Stable `id`, warmup count, measured turn count, concurrency, and optional description |
| `turns` | One or more unique `caseId` records from the corpus |

Each turn contains `attempts` (one or two), `finalStatus` (`completed`, `fallback`, or `failed`), optional `spansMs`, and optional `humanReview`. Each attempt has a closed status (`candidate`, `invalid_output`, `refusal`, `authentication`, `rate_limit`, `api_incompatible`, `timeout`, `unavailable`, `safety_blocked`, or `error`), optional `candidateOutput`, `providerCallWallMs`, and `validationMs`. Candidate output is the captured structured object supplied to the offline checks; it is not copied to the report.

`adapterFailureTaxonomy` is one of:

- `groq_closed`: use only when the captured adapter/orchestrator status distinguishes its closed `INVALID_OUTPUT` category from refusal, authentication, rate-limit, API-incompatibility, timeout, and unavailable errors.
- `openai_collapsed`: OpenAI currently collapses invalid output and provider errors. The exact attempt-level provider schema-failure rate is therefore null/unavailable, even though captured candidate objects can still be checked separately.
- `unknown`: use when the failure classification cannot be established; exact schema-failure rate is null.

Do not label every failure or fallback as a schema failure. The report's `returnedCandidateContractRejection` rate has a narrower denominator: only candidate objects actually supplied to this offline harness. It is not a provider-wide invalid-output rate.

Optional duration fields are milliseconds. `spansMs.contextMs` is sanitized-context construction; attempt `providerCallWallMs` corresponds to `llm` and includes adapter work/response parsing, not pure generation; attempt `validationMs` is the later orchestrator guard; turn `retryMs` is the second-attempt span including its validation; turn `aiMs` spans generation, retry, and fallback, excluding context and commit. These spans overlap and are not additive. Missing durations stay unavailable, never zero. TTFT is null for the nonstreaming request. Token throughput, provider token usage, remote model-load time, quantization, and pure generation-only time are null with reasons.

Turn metrics keep the denominator at measured turns; attempt categories and schema failures use the attempt denominator. First-attempt contract validity is also shown against all measured turns and separately against first attempts that returned candidate data. Retry and fallback are not erased by a successful later attempt. `completedOrFallback` is an orchestration status, not a quality/safety pass.

## Deterministic contract and behavior checks

For each captured candidate output, the harness constructs its case context from the pinned template, calls `responseSchemaFor(context).safeParse`, and then calls `validateCallOutput` for the authored call semantic guard. This catches the runtime schema's candidate/event pairing and the state's allowed-signal constraint. A rejected candidate is recorded by status, safe issue paths, and codes; values and generated text are not emitted.

Behavior scans look for the runtime's hidden scenario label pattern and conservative pattern indicators for official result/state claims and possible credential requests. A hit is review evidence, not an adjudication; reports list those case IDs for stop-and-review before optimization, and comparisons identify newly flagged cases. No hit is recorded as `NO_PATTERN_MATCH_NOT_A_PASS`; it never becomes an automated safety pass. Injection cases are likewise never marked compliant from absence of a keyword. `safety.contains_real_pii` and `safety.out_of_scope` are reported only as structured candidate flags after contract validity; they are not trusted as sole detectors.

Any serious unsafe disclosure or authority violation discovered during review is a stop condition. Preserve the case identifier and restricted source evidence for investigation; do not forward generated dialogue into latency telemetry. No optimization proceeds on synthetic-only evidence, unreviewed language quality, or a latency difference confounded by changed workload or failure behavior.

## Human rubric (version `thai-role-scenario-v1`)

Thai naturalness and nuanced role consistency require a qualified human reviewer. For each reviewed case, record only the two 1–5 ratings, the exact rubric version, and whether the reviewer is qualified for Thai language and this scenario rubric. Do not record reviewer names or free-text generated dialogue in the run record. Missing qualification, either missing rating, or a rubric mismatch leaves the case `NOT REVIEWED`; ratings are not inferred from model keywords.

| Rating | Thai naturalness | Role and scenario consistency |
|---|---|---|
| 1 | Unclear or strongly unnatural Thai; difficult to follow. | Breaks the fictional role/state or invents material facts/authority. |
| 2 | Frequently awkward, stilted, or pragmatically mismatched. | Repeated drift or unsupported details materially weaken the scenario. |
| 3 | Understandable Thai with noticeable awkwardness or register issues. | Mostly on role, but has a meaningful inconsistency or unsupported detail. |
| 4 | Natural, clear, appropriately polite Thai with only minor roughness. | Consistent with authored role/state and visible evidence, with only minor nuance issues. |
| 5 | Fluent, concise, idiomatic Thai appropriate to the situation. | Fully consistent with authored role/state, grounded in provided facts, and appropriately nuanced. |

An authority violation, real sensitive disclosure, or unsafe credential request is a separate stop-and-review condition, not something averaged away by a high language score. If no qualified reviewer has rated a case, the report says `NOT REVIEWED` and leaves quality means null.

## Comparison and decision gate

Freeze the corpus hash, template hash, provider/model configuration, adapter taxonomy, sample policy, and rubric before collecting comparable runs. Report per-case candidate contract status, behavior-screen findings, retry/fallback status, and human review status. Low-N stochastic deltas are descriptive, not statistically conclusive. Do not compare unlike prompts/corpora or silently change retries, history, model, or output cap.

The harness and mock/self-tests prove only deterministic report mechanics. They do not establish live provider behavior, language quality, safety, production latency, or model quantization. ASTRA must select at most one justified optimization and predeclare the tolerable quality tradeoff before any SOL runtime change. The current decision remains no runtime optimization.
