# Implementation gap and phases

## Current recovery status — 26 September 2026

| Area | Status |
|---|---|
| P0 categorical persistence | Fixed: preserve persisted assessment; explicit evaluationMode, never numeric version proxy |
| P1/P2 external MySQL/browser verification | Prepared regression/E2E coverage; NOT RUN — MYSQL_TEST_DATABASE_URL unavailable |
| P3 documentation | Current/historical counts and implemented/pending/planned boundaries separated |
| P4/P5 decision rules and nine text scenarios | Implemented; deterministic safe/review/critical/public-projection/AI-authority tests pass; real database reloads pending |
| P7 normal/scam variants | SCAM_CALL text only. BLOCKED on NORMAL_CALL assessment/checkpoint policy before backend-only random 50/50 selector |
| P8/P9 voice/transport | Planned after text variants; Azure STT/TTS, text fallback, no raw audio retention; WebSocket not required yet |
| P10 Luna | Approved/configurable; official capabilities confirmed; last live FAIL 429 credit_balance_exhausted, no recovery retry |
| P11 Quiz | Implemented 210/7/20; hardened coherent database snapshots; six native MySQL tests pending |
| P12/P13 Profile/Dashboard | Not implemented; approved fields only and separate historical/categorical semantics |
| P14 Game/Knowledge/Review | Excluded by latest user scope; do not implement from historical Proposal alone |

Recovery stops at the NORMAL_CALL policy decision rather than inventing pass/fail behavior.
See [Recovery verification](recovery-verification.md) for evidence, commands and remaining work.
The following table is historical baseline analysis, not a current implementation checklist.

This plan compares Proposal v6, the later approved decision rule, and the current repository. The Proposal file is read only. `origin/main` at `545c2c5` was the code baseline; the older mirror with uncommitted Luna documentation, tests, and `n8n/` was inspected read only.

| Area | Proposal v6 scope | Repository at baseline | Next work |
|---|---|---|---|
| Scenario evaluation | Proposal says weighted scores; later chat requires categorical rules | Weighted result for SMS only | Phase 1: publish rule version 3, migrate result storage/API/UI, retain old rows |
| Scenario catalogue | Nine scam types, text dialogue in each | One playable SMS / Phishing template and fixed catalog | Phase 2: generalize catalog and add eight validated, playable scenario templates with safe and risky paths |
| Knowledge and Quiz | Sixteen lessons; question bank of at least 200 across seven content groups; Pre/Post/Review | No lesson or quiz module | Phase 3: latest user limits scope to Quiz Pre-test/Post-test; 210 questions, attempts, backend scoring, persistence and UI implemented |
| Investigation game | Eight cases with evidence, search, decisions, outcomes | No playable case | Phase 4: case engine and content, backend validation, UI, persistence |
| Call Center voice | Normal/scam call variants, Thai microphone STT and TTS | Category/variant schema only | Phase 5: playable text and call flow first, then real voice adapters and latency/security checks |
| Profile and dashboard | Own profile, history, progress and recommendations | Account auth and single result page; no history/profile | Phase 6: ownership-safe read APIs, progress summaries compatible with mixed result versions |
| Production verification | End-to-end, real service integrations | Mock and adapter tests; live OpenAI blocked by 429 | Phase 7: MySQL, browser, accessibility/security and live provider verification after credits/credentials are available |

Dependencies: decision semantics and versioning precede more scenarios. Content identifiers must exist before recommendations can deep-link to lessons. Quiz and game attempts must be persisted before dashboard aggregation. Voice UI can be built with deterministic mock audio, but a mock or `n8n` prototype is not a production speech integration.

Model selection is a separate decision. Proposal v6 names GPT-5.4 mini and a possible backup; prior implementation approval names GPT-5.6 Luna; the later chat suggested Qwen3-4B-Instruct-2507 for future consideration. No model change is made in these phases. Live OpenAI checks remain paused after `429 credit_balance_exhausted` until the user confirms credits are ready.

Phase 1 is committed with a version 4 feedback follow-up. Phase 2 now provides all nine text scenarios; see [Scenario Catalog](scenario-catalog.md). Phase 3 adds [Quiz Pre-test/Post-test](quiz.md). On 26 September the user limited other modes to these two Quiz forms: Investigation Game, Review Quiz and the lesson module are excluded from this round. The normal-call variant and voice remain pending in Phase 5. The original table above remains the baseline gap analysis rather than a claim that the whole Proposal is complete.

## Phase 1 review boundary

Version 3 adds an explicit safe exit at first contact and rule metadata on validated choices. The database migration only adds columns; old results are not rewritten. Legacy v1/v2 templates are still published for resume and replay. The new public result identifies its evaluation mode and summarizes the encountered checkpoints, while old result screens keep their numeric wording. The MySQL tests are conditional on a dedicated test database and must be reported as skipped when it is absent.
