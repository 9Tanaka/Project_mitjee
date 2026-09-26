# Live AI Provider Integration — verification

## Current status — 26 September 2026 recovery

Approved implementation model: `gpt-5.6-luna`, still server-configurable through
`OPENAI_MODEL`. Historical Proposal reference: `gpt-5.4-mini`; not retrospectively changed.
[Official Luna documentation](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
checked on 26 September confirms Responses API and Structured Outputs, not account access.

Last actual live verification: 25 September, FAIL — HTTP 429
`credit_balance_exhausted`, two attempts, Luna; fallback is not a passing verification.
No paid request was made in this recovery because restored credits have not been confirmed.
The current 68 AI adapter tests use fake clients/transports and cannot establish live success.
Real network/schema/nonempty output/no-fallback verification remains pending.
Nine text scenarios and Quiz Pre/Post are now implemented. NORMAL_CALL assessment policy,
voice, Profile and Dashboard remain pending; Game/Knowledge/Review are outside current scope.
See [Recovery verification](recovery-verification.md) for current tests and external limitations.

## Historical adapter delivery — 22 September 2026

Date: 22 September 2026. Historical scope: Scenario Simulation module, SMS / Phishing text only.
Baseline GitHub: e4051f243492867eed94d419124dd45226c47e06.
Status: LIVE PROVIDER IMPLEMENTED / REAL OPENAI NETWORK NOT VERIFIED.

## Architecture and behavior report

| Requested item | Result |
|---|---|
| 1. Architecture | Server composition → ScenarioModelProvider → Mock or OpenAI outer adapter; Core has no SDK dependency |
| 2. SDK | Official openai@7.21.0 pinned; no unrelated framework version upgrades |
| 3. API | Responses.create, non-streaming, store:false; injectable thin ResponsesClient |
| 4. Model | Required OPENAI_MODEL; no substitution/default. Proposal: gpt-5.4-mini / gpt-5.4-mini-2026-03-17 snapshot |
| 5. Prompt | Fixed fictional/current-state/dialogue-only instructions; trusted developer context separate from untrusted user/history |
| 6. Included context | Template id/version/category/variant/title, state, role, allowed/forbidden behaviors; last 12 sanitized messages ≤2,000 code units each, current ≤8,000 |
| 7. Excluded | Owner/account/credentials/token/cookie, message IDs, hidden answers/weights/mappings/guards/transition graph/critical rules/recommendation internals |
| 8. Structured output | strict JSON schema derived from existing Zod contract; JSON.parse + provider/runtime revalidation; extra fields rejected |
| 9. Refusal | Responses refusal part → fixed ProviderRefusal; raw text discarded |
| 10. Cancellation | AbortSignal forwarded to SDK; pre/post-await abort checks; late result cannot commit |
| 11. Timeout | Existing 20 seconds/attempt; SDK backup timeout 20 seconds; two timeouts ≈40 seconds |
| 12. Retry | Initial + one Orchestrator retry; SDK maxRetries=0; SAFETY_BLOCKED never retries |
| 13. Network cap | ≤2 requests per new-turn invocation, ≤1 if safety blocked, 0 for committed replay; concurrent uncommitted invocations can each spend their own budget |
| 14. Fallback | Current State fallback, no candidate/score/event/transition; atomic receipt. Adapter invalid output maps to existing ERROR; contract unchanged |
| 15. Candidate | All four candidate types/confidence remain metadata inspected by Backend; no direct authority |
| 16. Critical | Free text/high-confidence critical hints never fail session; only validated explicit simulated action does |
| 17. Injection | Tested malicious user text/candidates, separate roles, context allowlist, forbidden output fields, unchanged authority; not production prompt-injection certification |
| 18. Idempotency | Duplicate turn replays receipt with zero additional provider requests; changed input rejects |
| 19. Concurrency | Concurrent explicit action wins revision CAS; late AI response gets conflict with no partial write |

## Verification results

| Requested item / command | Actual result |
|---|---|
| Prisma generate / validate | PASS |
| npm run typecheck | PASS |
| npm test | 415 PASS, 0 skipped |
| 20. Provider unit / SDK fake transport | 35 PASS |
| 21. Real adapter dialogue / existing dialogue regression | 24 PASS / 28 PASS |
| 22. Real adapter HTTP / existing test:http | 9 PASS / 131 PASS |
| 23. Frontend regression | 52 PASS; production build PASS; only footer wording changed |
| 24. MySQL / Auth / real Auth smoke / browser E2E | 28 PASS / 81 PASS / PASS / 3 PASS |
| 25. Client bundle audit | 43 JavaScript artifacts PASS; source transitive architecture checks PASS |
| npm run test:ai | 68 PASS (35+24+9); fake clients/fetch only, no paid API |
| npm audit / npm audit --omit=dev | 0 known vulnerabilities at verification time |
| 26. Real OpenAI network | NOT RUN — private API key absent; no claim of account model access, live response quality or latency |
| 27. Model used for real test | None. Configurable model not substituted |
| 28. Documentation | README, architecture, AI integration, security, assumptions, frontend, API/auth status and stale resume wording updated |

Counts are overlapping subsets, not additive coverage totals. MySQL tests used a dedicated
loopback test database; no schema migration/reset was needed. Auth/browser tests force Mock.
Live smoke is a separate opt-in command, one synthetic in-memory turn with at most two attempts.
No raw prompts, responses, secrets or conversation dumps are committed.

## 29. Files created / modified

New:

- src/providers/openai-scenario-provider.ts — adapter, client injection, safe parsing/errors/correlation
- src/providers/openai-prompt.ts — context projection and structured request
- src/server/scenario-provider.ts — explicit server configuration
- tests/openai.fixtures.ts, openai.provider.test.ts, openai.dialogue.test.ts, openai.http.test.ts, openai.live.ts
- scripts/test-ai-live.mjs, vitest.ai-live.config.ts, docs/live-ai-verification.md

Modified:

- src/application/composition.ts, src/server/runtime.ts — required provider injection/selection
- src/app/layout.tsx — footer only
- tests/architecture.test.ts, tests/http.runtime.test.ts, tests/auth.integration.test.ts
- scripts/audit-client.mjs, scripts/test-auth-live.mjs, scripts/test-e2e.mjs
- package.json, package-lock.json, tsconfig.json, .gitignore
- README.md and docs/ai-integration.md, architecture.md, security.md, demo-assumptions.md,
  frontend.md, api.md, authentication.md, state-machine.md

## 30–31. Delivery

Commit message: `feat: add live OpenAI dialogue provider`.
The immutable commit hash and verified push outcome are reported in the task handoff,
not embedded in the commit itself. Local and GitHub baseline histories have different
commit identities but identical trees; delivery must preserve both histories and compare
final trees, with no force push, reset, rewrite or unrelated merge.

## Historical phase scope and continuing limitations

Live AI controls dialogue content only. Backend remains authoritative for State, Events,
Score, Critical Failure and pass/fail. Mock remains available. SMS / Phishing remains the
only playable fixture in that historical phase, not in the current recovery. No Voice/playable Call Center, WebSocket/realtime/streaming or
remaining scenario fixtures were started. Profile, Quiz, Game, Knowledge Base and Dashboard
remain outside this phase.

Sanitizer is a demonstration control; safety flags are model self-reports. Use fictional
data only. No production moderation/PII/injection certification, no retention cleanup,
no distributed in-flight coalescing. 1,200 output tokens is an unverified technical cap;
store:false is not Zero Data Retention certification. See [AI integration](ai-integration.md)
and [Security](security.md). Stop for review before any next phase.
