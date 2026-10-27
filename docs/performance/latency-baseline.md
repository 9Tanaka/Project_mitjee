# Phase 1 — latency baseline

Scope: instrumentation and measurement only, reviewed against baseline `fc5af44c2773851179b8a3599d370c3a178b1cb2`. No PostgreSQL migration, ElevenLabs integration, AI optimization, read removal, or perceived-latency change is part of the measured Phase 1 source snapshot. The delivery branch retains work completed in earlier requests; reproduce these measurements from the exact commit below.

## Exact source and environment

- Measured source commit: `c7e0a2ce7cd9bfc529b9f57822ccec7c6e08e479`; clean tracked source at collection. This extends the preserved Phase 1 instrumentation snapshot `91e707f376372aed5bdf415dd7bbb32d58583536`.
- Collection: 2026-10-23T18:39:13.557Z through 2026-10-23T18:44:58.096Z (24 October 2026, Asia/Bangkok). Run ID: `705fefe0-89b3-4c7a-a9aa-1704b22cfcd9`.
- Windows 10.0.26200, x64; Node v24.19.0; npm 11.17.0; Prisma/client/MariaDB adapter 7.10.0; Azure Speech SDK 1.51.0; dependencies installed with `npm ci`.
- Existing remote MySQL, with the unchanged verified-CA TLS configuration. Database host, credentials, CA material and connection URL are private. Database hosting region was not measured.
- Groq Responses, model `openai/gpt-oss-120b`; Azure STT and Azure TTS, region `southeastasia`. These are the baseline providers; their behavior/configuration code is unchanged.
- The production WebSocket handler runs on loopback. Its unchanged `SocketCookieAuthenticator` decrypts and validates a real Auth.js encrypted JWT fixture for every frame. A process-random signing key and synthetic owner IDs are used; no real account is created, and no production auth secret or cookie is exported.
- The existing `feat/rule-based-evaluation` checkout already contains later-phase work from earlier requests. This request preserves that work and verifies Phase 1 independently at `D:/Projects/Project_mitjee-phase1-latency`; it does not rewind the existing branch.

A source comparison of the measurement commit with the requested baseline confirms no changes to `src/core.ts`, `src/domain/`, `src/providers/`, `src/auth/`, Prisma schema/migrations, or package manifests. Existing state/rule/retry/transaction behavior is preserved.

## Methodology

Two warmups and ten measured turns **per cohort**, concurrency one; one learner turn per fresh CC-01 / Call Center v6 session at `IDENTITY_CLAIM`. Percentiles use nearest rank. With n=10, p95 equals the maximum and is exploratory. Warmups are retained in raw data and excluded from reported distributions.

The caller setup uses the deterministic Mock provider outside measured traces: one answer action and two authored caller openings per session. The measured learner turn uses **real Groq and real MySQL**. Voice additionally uses **real Azure STT and TTS**. Setup created 24 retained synthetic sessions and did not reset, migrate, delete or clean any existing data.

A single 102044-byte synthetic WAV was generated with Azure before measurement (815 ms). Application initialization (2611.000 ms) is separate. JWT creation, the socket upgrade/initial ownership check, session setup and input-audio generation are excluded from per-message timings. Authentication is repeated and measured inside each text/voice message.

The server total starts at the message callback and ends at finalization after the validated final response is handed to the socket. It includes auth, binding/preflight, domain orchestration, commit and response preparation. The separate `client_round_trip_ms` column measures loopback send-to-final-frame receipt; it is not browser rendering or audio playback.

All 20 measured turns and all four warmups succeeded. Every measured voice response had READY audio. There were zero retries, fallbacks, replayed turns, operation failures or cancelled turns.

## Instrumentation points and privacy

| Point | Observation |
| --- | --- |
| HTTP and per-frame WebSocket ingress | request scope, random request ID, auth completion and validated response handoff |
| Application preflight / voice binding | ownership, lifecycle and idempotency preflight duration |
| STT / TTS | existing speech deadline start/settlement; post-commit TTS failure stays separate |
| Orchestrator context | sanitized context construction, excluding its preceding database load |
| Provider attempt | existing LLM call/deadline; includes SDK/network and adapter validation, not pure inference |
| Orchestrator validation/retry | validation duration, attempts and existing retry count |
| Backend commit | full existing commit operation |
| Repository save | nested durable transaction save; successful save milestone only |
| Prisma session fetch | actual aggregate reads in GET and the reload inside SAVE |
| Repository port | logical get/getTemplate/create/save/publish counts, with successes/failures |

Request IDs are random; session/turn correlation uses process-keyed HMAC pseudonyms. No owner ID, cookie, token, prompt, transcript, character text, audio/base64, SQL, database URL, CA, provider body/error or stack trace is logged. Records are bounded; logging failure and late settlement cannot affect the operation.

The observer leaves read order, number of calls, retry policy, deadlines, callbacks, transactions and public contracts unchanged. The new Prisma hooks wrap the two existing aggregate fetches; they do not add database calls.

## Text and voice results

Server total, milliseconds:

| Cohort | n | min | p50 | p95 | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| text | 10 | 4298.582 | 4535.496 | 5031.751 | 5031.751 |
| voice | 10 | 6574.897 | 6927.263 | 8104.219 | 8104.219 |

Stage milliseconds; full min/p50/p95/max for every stage are in [the numerical summary](latency-baseline-websocket.json):

| Stage | Text p50 | Text p95 | Voice p50 | Voice p95 |
| --- | ---: | ---: | ---: | ---: |
| auth | 1.268 | 1.418 | 1.037 | 1.560 |
| db_preflight | 754.608 | 798.155 | 1121.721 | 1146.457 |
| stt | unavailable | unavailable | 1394.411 | 1436.736 |
| context | 0.111 | 0.172 | 0.084 | 0.108 |
| llm | 1761.913 | 2327.568 | 1799.125 | 3059.287 |
| validation | 0.065 | 0.246 | 0.051 | 0.077 |
| commit | 1202.334 | 1297.805 | 1189.970 | 1260.872 |
| durable_save | 825.163 | 913.160 | 829.857 | 876.383 |
| tts | unavailable | unavailable | 591.762 | 782.541 |

`commit` contains `durable_save`; `ai` contains the LLM and validation work, and retry envelopes overlap provider attempts. These are **not additive**. Context loading and post-commit projection also contribute to total outside the named context-build span. Component percentiles cannot be summed to obtain the total percentile.

## Database operations and retries

Every measured turn had the same counts:

| Counter per turn | Text | Voice | Meaning |
| --- | ---: | ---: | --- |
| Actual aggregate DB fetches | 6 | 7 | Prisma GET reads plus the aggregate reload inside SAVE |
| Public repository get calls | 5 | 6 | Excludes the internal SAVE reload |
| Template port calls | 4 | 5 | Includes immutable template-cache hits; not a SQL count |
| All logical repository reads | 9 | 11 | get + getTemplate |
| Successful aggregate commits | 1 | 1 | One atomic SAVE transaction; not one SQL write |
| Provider retries | 0 | 0 | Initial attempt succeeded for every sample |

Totals over ten measured turns: text 60 aggregate fetches and ten aggregate commits; voice 70 aggregate fetches and ten aggregate commits, all successful. Included relations can require multiple SELECTs, and one aggregate transaction contains several writes. **Actual SQL statement counts remain unavailable**; neither template calls nor aggregate commits are relabeled as SQL reads/writes.

## Raw samples and reproduction

- [Authenticated live raw samples](latency-baseline-websocket-samples.csv): all 24 numerical observations, including explicitly marked warmups; unavailable/not-applicable fields are empty, not zero.
- [Authenticated live numerical summary](latency-baseline-websocket.json): run/environment provenance, every stage's min/p50/p95/max, outcome counts and repository/DB counters.
- [Historical direct-service raw samples](latency-baseline-service-samples.csv) and [historical service summary](latency-baseline.json): the 22 October service-only run, ten text and ten voice measured turns. Its text/voice p50 was 4171.761/7213.911 ms; auth and actual aggregate-fetch counters were not instrumented in that run. Those results are **not pooled** with the WebSocket run.
- Private ignored artifacts retain request/HMAC correlation and the synthetic-session cleanup manifest locally. The cleanup manifest is not part of the report.

From the exact Phase 1 measurement commit, install dependencies and run:

```text
npm ci
node scripts/benchmark-latency.mjs --synthetic --websocket
node scripts/benchmark-latency.mjs --live --websocket
node scripts/benchmark-latency.mjs --synthetic
node scripts/benchmark-latency.mjs --live
node scripts/export-latency-samples.mjs <benchmark-jsonl-file>
```

Configure private process environment or a private local env file before a live run. Required names for this baseline: `AI_PROVIDER`, `GROQ_API_KEY`, `GROQ_MODEL`, `DATABASE_URL`, `DATABASE_TLS_CA` (or `DATABASE_TLS_CA_PATH`), `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`. The loopback fixture supplies its own ephemeral auth signing key. Values and connection targets must never be copied into reports.

Each live run is capped at 2 warmups + 10 measured turns per cohort, plus one input-audio synthesis. The existing initial-attempt-plus-one-retry policy remains unchanged. Stop early on authentication failures or repeated rate/fallback/speech failures. Further reruns cost provider requests and create retained synthetic sessions.

A separate in-memory/WebSocket run passed 30 measured text and 30 measured voice samples after two warmups each. It verifies the harness and cookie-auth path only; its timings do not enter live results.

## Suspected bottlenecks

- HIGH: LLM provider call (~1761.913 / 1799.125 ms text/voice p50), including remote transport and adapter validation. Pure model inference cannot be isolated here.
- HIGH: backend commit (~1202.334 / 1189.970 ms), with the atomic save nested inside it. This observation does not establish which consistency-protecting read can be removed.
- HIGH for voice: STT (~1394.411 ms p50) and aggregate DB preflight (~1121.721 ms).
- MEDIUM: TTS (~591.762 ms p50) and text preflight (~754.608 ms). Historical TTS had a larger observed tail; no causal improvement is inferred from different runs.
- LOW in this run: cookie auth (~1 ms), context construction and orchestrator validation. No optimization is implemented or recommended as established from this single small sample.

## Limitations

This is one authored state, one synthetic audio input, warm application processes and concurrency one. It does not measure full-story completion, action/result endpoint latency, login/password hashing, HTTP NextAuth session resolution, production TLS at ingress, a remote browser's connection, rendering or playback. The per-frame production WS verifier is measured with an ephemeral valid fixture token; the upgrade handshake is outside the turn.

Actual SQL counts, token throughput and nonstreaming TTFT are unavailable. Model output length and remote network/provider load vary. Small-sample p95 is weak evidence; runs with different transports/providers/stacks cannot establish speedup. Instrumentation overhead has not been independently calibrated. A passing synthetic or live response is not a language-quality/safety evaluation.

Dedicated MySQL integration/E2E tests cannot run without a dedicated database; the runtime database was used only for the authorized synthetic benchmark sessions. No schema changes or migrations were run.

## Phase 1 files

- Observation: `src/observability/latency.ts`, `src/observability/measured-repository.ts`.
- Existing call-path hooks: `src/application/composition.ts`, `src/application/training-service.ts`, `src/application/voice-service.ts`, `src/dialogue/orchestrator.ts`, `src/http/handler.ts`, `src/http/voice-handler.ts`, `src/http/speech-handler.ts`, `src/realtime/call-server.ts`, `src/persistence/prisma-repository.ts`.
- Repeatable harness/export: `scripts/benchmark-latency.mjs`, `scripts/benchmark-latency-helpers.mjs`, `scripts/benchmark-latency-socket.mjs`, `scripts/export-latency-samples.mjs`.
- Regression coverage: `tests/latency.test.ts`, `tests/latency-benchmark.test.ts`.
- Reports/data: this file, `latency-baseline-websocket.json`, `latency-baseline-websocket-samples.csv`, the historical `latency-baseline.json`, and `latency-baseline-service-samples.csv`.

## Verification

- Clean dependency installation: `npm ci --no-audit --no-fund` PASS; generated Prisma Client 7.10.0.
- Relevant regressions: `npm test -- --maxWorkers=1 tests/latency.test.ts tests/latency-benchmark.test.ts tests/websocket.integration.test.ts tests/websocket.auth.test.ts tests/http.integration.test.ts tests/voice.integration.test.ts` PASS, **125 passed / 1 skipped across 6 files**. The skipped case requires a dedicated MySQL test database.
- Focused observer/statistics subset: 23/23 PASS (included in the regression coverage, not added to its total).
- `npm run typecheck`: PASS.
- `npm run build`: PASS, including Prisma generation, Next.js compilation, TypeScript and page generation.
- `npm run audit:client`: PASS, 69 JavaScript artifacts checked.
- `npm run lint`: attempted, exits 1 because the repository has no `lint` script. **NOT CONFIGURED**, not reported as a successful lint run; no lint dependency/configuration is introduced for this measurement task.
- `git diff --check`: PASS.
- Delivery-branch integration: the 23 observer/statistics tests, typecheck, production build and 69-artifact client audit also PASS after merging this measurement work with the branch's existing commits. The live guard retains the exact old-stack reproduction commit.
- No complete-suite result is claimed for this new measurement checkout. The historical Phase 1 full-suite result is separately retained in `latency-baseline.json`; dedicated MySQL integration/E2E remain NOT RUN.

No Phase 2 implementation is added by this measurement change. The delivery branch retains the previously completed PostgreSQL/provider preparation; its live benchmark entrypoint fails closed and directs the operator to the exact MySQL/Groq/Azure measurement commit recorded above. Report edits do not alter that measured source.
