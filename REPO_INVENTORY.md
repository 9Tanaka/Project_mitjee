# MITJEE repository inventory (Phase 0)

Read-only reconnaissance completed 2026-10-22. No source code, runtime configuration, database, branch, or other pre-existing files were changed. Environment configuration was audited by variable name and presence only; no values, keys, URLs, hosts, or secrets are reproduced here.

## Repository state

- Repository: `D:/Projects/Project_mitjee`
- Branch: `feat/rule-based-evaluation`, tracking `origin/feat/rule-based-evaluation`
- HEAD: `fc5af44c2773851179b8a3599d370c3a178b1cb2`
- Working tree was already dirty at inspection: `README.md`, `docs/ai-integration.md`, `docs/api.md`, `docs/architecture.md`, `docs/authentication.md`, `docs/call-center-continuous-ux.md`, `docs/decision-evaluation.md`, `docs/demo-assumptions.md`, `docs/frontend.md`, `docs/implementation-roadmap.md`, `docs/persistence.md`, `docs/qwen-proposal-recheck.md`, `docs/recovery-verification.md`, `docs/scenario-engine.md`, `docs/scenario-storyboard-spec.md`, `docs/scoring.md`, `docs/storyboards/01-call-center.md` through `09-job.md`, `docs/storyboards/README.md`, and `docs/ui-refresh.md` were modified before this task. These edits were preserved.
- No `AGENTS.md` was found in the repository or checked parent directories.

## Current database and Prisma

- Runtime database is MySQL-compatible. `prisma/schema.prisma` declares `provider = "mysql"`; `prisma/migrations/migration_lock.toml` also says `mysql`. The four migration folders contain MySQL SQL syntax.
- Prisma CLI and client are pinned to `7.10.0`. `src/persistence/prisma-client.ts` constructs `PrismaClient` with `PrismaMariaDb` from `@prisma/adapter-mariadb` `7.10.0`; the lockfile overrides `mariadb` to `3.5.4` and `mysql2` to `3.24.4`.
- `src/server/database.ts` reads `DATABASE_URL`, optionally loads the trusted CA from `DATABASE_TLS_CA` or `DATABASE_TLS_CA_PATH`, and allows a pinned MySQL RSA key only for loopback via `DATABASE_LOOPBACK_RSA_PUBLIC_KEY_PATH`. The adapter uses an 8-connection pool, 10 s connect timeout, 15 s acquire timeout, UTC timezone, and verified TLS for remote hosts.
- Prisma config has a placeholder MySQL URL fallback for tooling. The current local `.env.local` has `DATABASE_URL` configured; only its `mysql:` protocol family was checked. `DATABASE_TLS_CA` is configured.
- The schema has 12 models: Scenario, ScenarioTemplateVersion, TrainingSession, TrainingAction, SessionOpportunity, TrainingEvent, DialogueTurnReceipt, TrainingMessage, TrainingResult, UserAccount, QuizAttempt, and QuizReceipt. Training aggregates, receipts, JSON fields, constraints, and CAS/revision updates are implemented in the Prisma repository.
- No PostgreSQL adapter/package, PostgreSQL schema provider, PostgreSQL migration history, or configured Supabase/PostgreSQL runtime or migration URL was found. There is no migration strategy implemented yet.

## Speech and voice runtime

- Contracts are already separated in `src/speech/contracts.ts` as `SpeechToTextProvider` and `TextToSpeechProvider`, but runtime wiring is not split: `src/server/voice-runtime.ts` creates one `AzureSpeechProvider` and passes the same instance as both STT and TTS.
- `src/providers/azure-speech.ts` uses Microsoft Cognitive Services Speech SDK `1.51.0` for Thai (`th-TH`) recognition and the `th-TH-PremwadeeNeural` voice. Synthesis is configured for RIFF/WAV, 16 kHz, 16-bit, mono PCM. Audio validation requires the same canonical WAV format, with a maximum 30-second recording and about 960 KB input.
- Speech calls have a 10 s deadline. Voice commits the dialogue before TTS; TTS failure returns unavailable audio while preserving the committed training turn. A replay speech endpoint can synthesize an already committed character message.
- There is no ElevenLabs dependency or provider implementation. `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, and `ELEVENLABS_MODEL_ID` are absent from `.env.local`.
- Azure STT environment variable names `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are present in `.env.local`; values were not read or validated against the service.

## AI and dialogue runtime

- `src/server/scenario-provider.ts` selects an explicit `AI_PROVIDER`: `mock`, `openai`, or `groq`. The OpenAI Responses API adapter and Groq OpenAI-compatible Responses adapter are in `src/providers/`; neither delegates authority to the model. The deterministic mock provider is used by tests and smoke scripts.
- Active provider and model cannot be confirmed without reading environment values. `.env.local` contains the names `AI_PROVIDER`, `GROQ_API_KEY`, and `GROQ_MODEL`; OpenAI key/model variable names are absent. Presence does not prove a key is valid or a live request succeeds.
- Model is selected at runtime via `GROQ_MODEL` or `OPENAI_MODEL`. Requests are non-streaming, cap output at 1,200 tokens, pass up to 12 sanitized history messages (up to 2,000 characters each) and a current input capped at 8,000 characters. Each provider attempt is bounded at 20 s; the orchestrator allows one sequential retry, so a failing turn can spend up to roughly 40 s in model attempts before fallback and commit.
- No Qwen, Ollama, llama.cpp, vLLM, Transformers, or other local inference runtime was found in source, package dependencies, or scripts. Qwen appears in proposal/recheck documentation only. There is no Qwen endpoint configuration, model artifact, or serving setup.

## Realtime architecture and authoritative paths

- `src/server/serve.ts` starts a custom Node HTTP server around Next.js and installs `attachCallWebSocket`. HTTP request timeout is 75 s and headers timeout 10 s.
- `src/realtime/call-server.ts` owns the `/api/call/{sessionId}/socket` WebSocket upgrade, cookie authentication, connection limits, heartbeat, resume, text/voice processing, and protocol validation. It processes one message at a time per socket; defaults include a 5 s handshake deadline, 10-minute socket lifetime, a 20-socket process cap, and at most two sockets per owner.
- Text HTTP route: `src/app/api/training/[sessionId]/message/route.ts` -> `src/http/handler.ts` -> `TrainingApplicationService.message`.
- Voice HTTP route: `src/app/api/training/[sessionId]/voice/route.ts` -> `src/http/voice-handler.ts`. Speech replay uses `src/app/api/training/[sessionId]/speech/route.ts` -> `src/http/speech-handler.ts`.
- Frontend `src/frontend/call-transport.ts` attempts WebSocket first and falls back to HTTP for uncertain/network failure. Audio is posted as base64 WAV. There is no token/audio streaming protocol; the voice request processes STT, dialogue, commit, then TTS.
- Main authoritative path: `src/application/training-service.ts` -> `src/dialogue/orchestrator.ts` -> `src/core.ts` -> `src/persistence/prisma-repository.ts`. Core validates actions and commits dialogue receipts/results with revision CAS; model/STT/TTS are outside the authoritative decision boundary.

## Training and persistence structure

- Domain state, rules, and repositories are under `src/domain/`; authoritative orchestration is `src/core.ts` and application use cases are under `src/application/`.
- Persistence contracts and in-memory implementation are in `src/domain/training-repository.ts` and `src/domain/repository.ts`; production repositories are `src/persistence/prisma-repository.ts`, `src/persistence/prisma-account-repository.ts`, and quiz persistence in `src/persistence/quiz-repository.ts`.
- Prisma aggregate reads include the session's actions, opportunities, events, messages, turns, result, and pinned template configuration. Reads use RepeatableRead transactions. Saves do a revision-conditional update, reload the aggregate inside a ReadCommitted transaction, validate the transition, then write child rows atomically.
- Scenario, quiz, account, voice, and backend-authority coverage is spread across `tests/`; MySQL-specific suites use `*.mysql.test.ts` and require the dedicated `MYSQL_TEST_DATABASE_URL` to run.

## Tests, scripts, and toolchain availability

- Vitest `5.0.0` is the unit/integration test runner; Playwright `1.63.0` is configured for browser E2E. Relevant scripts include `test`, `test:http`, `test:ai`, `test:speech`, `test:websocket`, `test:auth`, `test:quiz`, `test:frontend`, `test:e2e`, and `test:mysql`.
- `npm run typecheck` runs strict TypeScript checking. `npm run build` generates Prisma Client and builds Next.js. There is no `lint` script or ESLint dependency in `package.json`.
- `test:mysql` requires `MYSQL_TEST_DATABASE_URL` and runs MySQL persistence/account/quiz/call-variant suites. The variable and `MYSQL_TEST_RSA_PUBLIC_KEY_PATH` are absent from `.env.local`; those suites therefore cannot be exercised against a dedicated database from the current configuration. No tests or builds were run during Phase 0.
- Live AI, Groq, speech, auth, and browser checks are opt-in scripts. They were not run; no paid APIs or mutable database operations were used.
- Windows toolchain found: Node.js `v24.19.0`, npm `11.17.0`, Python executable and `py` launcher present. NVIDIA utility reports an `NVIDIA GeForce RTX 5060` GPU.

## Existing benchmarks, datasets, and model tooling

- `scripts/profile-call-runtime.mjs` is an opt-in real-MySQL profiler (not exposed as a package script). It profiles synthetic application initialization/start/replay/resume and optionally mock dialogue/openings, recording repository operation timings. It creates and retains synthetic DB sessions and writes under ignored `frontend-artifacts/`, so it was not run in this read-only phase.
- Existing ignored artifacts `frontend-artifacts/call-performance-before.json`, `call-performance-after.json`, and `call-performance-dialogue.json` report `PASSED` for that profiler's scope: two workers, 18 samples for before/after and 42 for dialogue. Their declared scope excludes live AI and auth; the dialogue profile uses a mock provider. These are not a text/voice end-to-end baseline and do not provide the requested common p50/p95, retry, or reads/writes-per-turn report.
- `docs/performance/` and `docs/performance/latency-baseline.md` do not exist. Existing `tests/call-performance.test.ts` checks read behavior and transaction configuration but is not a latency benchmark.
- No JSONL training set, QLoRA dataset/split, model weights, or project training harness/dependencies were found. Python and an RTX 5060 exist on the host, but local model serving/training readiness was not established.

## Environment variable names and configured presence

Presence below is from the repository's `.env.local`, plus code references. Values are intentionally omitted. “Present” means a nonempty assignment exists; it does not validate the credential or connection.

| Purpose | Variable names | `.env.local` status |
|---|---|---|
| Runtime DB | `DATABASE_URL` | Present; protocol family `mysql:` only |
| MySQL TLS | `DATABASE_TLS_CA` | Present |
| MySQL test DB/key | `MYSQL_TEST_DATABASE_URL`, `MYSQL_TEST_RSA_PUBLIC_KEY_PATH` | Absent |
| Alternate DB/TLS config supported by code | `DATABASE_TLS_CA_PATH`, `DATABASE_LOOPBACK_RSA_PUBLIC_KEY_PATH` | Absent |
| Postgres/Supabase runtime or migration candidates | `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `DIRECT_URL`, `DATABASE_MIGRATION_URL`, `MIGRATION_DATABASE_URL`, `SUPABASE_DATABASE_URL`, `SUPABASE_DB_URL` | Absent |
| AI selection / Groq | `AI_PROVIDER`, `GROQ_API_KEY`, `GROQ_MODEL` | Present; values withheld |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_MODEL` | Absent |
| Azure Speech | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | Present; values withheld |
| ElevenLabs | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID` | Absent |
| Qwen/local inference | `QWEN_ENDPOINT`, `QWEN_BASE_URL`, `QWEN_MODEL`, `OLLAMA_HOST` | Absent; not referenced by runtime code |
| Other app config present | `AUTH_SECRET`, `AUTH_URL`, `CALL_CENTER_DEMO_VARIANT` | Present; values withheld |

The checked process environment supplied to this inspection had none of the tested database/provider URL names; the app's launcher loads `.env.local` through Next environment configuration.

## Potential latency hotspots (hypotheses for Phase 1 to measure)

1. **Repeated aggregate reads on text turns.** `TrainingApplicationService.message` preflights with `snapshot`/`core.resume`; `ScenarioDialogueOrchestrator.sendMessage` calls `core.getSessionContext` (another owned aggregate read); `TrainingCore.apply` reads again before the CAS commit; `PrismaTrainingRepository.save` reloads the full aggregate inside its transaction; after commit, the application resumes again to return the session. This is approximately four external aggregate reads plus the in-transaction read per successful text turn, excluding authentication and template publication. WebSocket voice also binds/resumes before voice processing.
2. **Large aggregate snapshots and child writes.** Every repository read includes accumulated actions/events/messages/turns and template JSON; save reloads that aggregate and performs child writes in a transaction. Query/write cost can grow with session history and is sensitive to DB round trips.
3. **Serial external calls.** For a voice turn, STT (up to 10 s) precedes dialogue generation (up to two 20 s attempts) and commit; TTS (up to 10 s) follows the commit. No streaming or stage-level successful-request timings currently exist.
4. **DB acquisition/transaction waits.** Pool acquisition can wait 15 s and get/save transactions can each use a 5 s max-wait and 15 s transaction budget. Remote MySQL TLS and connection establishment may be material under cold start or pool contention.
5. **Audio transfer/encoding.** WAV is base64 encoded in HTTP/WebSocket JSON and decoded by the server. The 30 s recording cap bounds size, but transfer and conversion are additional voice-path work.

Current server diagnostics record failure stages and failed transaction timings only; there is no request/turn ID correlation with successful per-stage timings. Establish the agreed text and voice baseline before optimizing any of these hypotheses.

## Verification gates and blockers

- Current runtime is still MySQL. The local config has a MySQL `DATABASE_URL`, but no dedicated `MYSQL_TEST_DATABASE_URL`; do not use the app runtime database for the profiler or MySQL integration suites without explicit confirmation that it is a disposable test DB.
- No Supabase/Postgres runtime or migration URLs are configured, so a real Postgres connectivity/migration verification gate is not available yet.
- Azure speech variables and Groq-related variables are present locally, but their values, validity, and provider reachability were not checked. Active AI provider/model is unknown under the no-values constraint.
- ElevenLabs configuration/provider, Qwen runtime, QLoRA data, and training harness are absent. GPU presence alone does not establish model training or inference setup.

## Files inspected

Primary files: `package.json`, `prisma.config.ts`, `prisma/schema.prisma`, `prisma/migrations/migration_lock.toml`, all four migration SQL files, `src/server/database.ts`, `src/persistence/prisma-client.ts`, `src/persistence/prisma-repository.ts`, `src/persistence/prisma-account-repository.ts`, `src/application/training-service.ts`, `src/application/voice-service.ts`, `src/application/composition.ts`, `src/core.ts`, `src/dialogue/orchestrator.ts`, `src/dialogue/contracts.ts`, `src/providers/openai-scenario-provider.ts`, `src/providers/groq-scenario-provider.ts`, `src/providers/openai-prompt.ts`, `src/server/scenario-provider.ts`, `src/speech/contracts.ts`, `src/providers/azure-speech.ts`, `src/server/voice-runtime.ts`, `src/server/serve.ts`, `src/realtime/call-server.ts`, `src/http/handler.ts`, `src/http/voice-handler.ts`, `src/http/speech-handler.ts`, `src/frontend/call-transport.ts`, `src/frontend/voice.tsx`, `tests/call-performance.test.ts`, `tests/prisma-client.test.ts`, `tests/persistence.mysql.test.ts`, `scripts/profile-call-runtime.mjs`, `scripts/test-mysql.mjs`, `scripts/test-e2e.mjs`, `scripts/test-call-runtime.mjs`, Vitest/Playwright configs, `.gitignore`, and `.env.local` names only.
