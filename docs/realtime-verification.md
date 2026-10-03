# Live AI + Voice Call Center + WebSocket — verification

Date: **2 October 2026**. Branch: `feat/rule-based-evaluation`.
Repository: `D:\Projects\Project_mitjee`. Starting remote tip was rechecked and fast-forwarded
to `2d2edd287a4dd060efc162f53a196cce6ca586cd` (five nonoverlapping documentation commits).
No main merge, force push, published-migration edits, or Profile/Dashboard work.

## Implemented scope

- Explicit Mock/OpenAI/Groq provider selection. Groq uses its fixed OpenAI-compatible Responses
  endpoint, strict schema, dedicated key/model, cancellation and sanitized errors. No substitution.
- One public Call Center card, backend NORMAL_CALL/SCAM_CALL selection and persisted start winner.
  Public catalog remains nine. Normal uses the approved no-warnings categorical policy, zero critical
  rules; historical SCAM and weighted template versions are preserved.
- Call Center-only Azure STT → sanitizer → existing dialogue commit → TTS. Permission on user action,
  no app audio persistence, text fallback, abort and bounded requests.
- Authenticated owned ACTIVE Call Center WebSocket, existing revision/idempotency, bounded payloads,
  rate/heartbeat/connection limits, HTTP fallback, isolated custom-server runtime.
- Added regression coverage for cancelled microphone setup, shared HTTP/socket admission/rate windows,
  isolated runtime initialization, and timed-out handshake capacity. An old repository key test now
  uses a valid normal template instead of relabelling a scam fixture as NORMAL_CALL.

Core scoring, EventValidator, critical-action authority, repository contracts and published SQL
migrations were not changed. Template schema/validation and application/catalog policy were extended
only for the user-approved NORMAL_CALL behavior. See [Voice](voice.md) and [WebSocket](websocket.md).

## Executed command matrix

Counts overlap across subsets; **do not sum** these rows. Default tests use fake providers and local
in-memory services. Socket transport tests make real loopback connections, not external provider calls.

| Command | Result |
|---|---|
| `npm ci --ignore-scripts` | PASS; lockfile install, zero audit vulnerabilities |
| `npm run prisma:generate` | PASS — Prisma 7.10.0 |
| `npm run prisma:validate` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 654 passed, 49 skipped; 36 passed files, four skipped files |
| `npm run test:http` | PASS — 155 passed, one conditional skip |
| `npm run test:auth` | PASS — 81 passed |
| `npm run test:frontend` | PASS — 78 passed |
| `npm run test:quiz` | PASS — 46 passed, six MySQL skips |
| `npm run test:ai` | PASS — 68 passed, fake OpenAI |
| `npm run test:groq` | PASS — 52 passed, fake Groq |
| `npm run test:speech` | PASS — 69 passed, fake speech + HTTP + UI/microphone |
| `npm run test:websocket` | PASS — 20 passed, cookie checks and loopback socket integration |
| `npm run build` | PASS — Next 16.3.8 production webpack build |
| `npm run audit:client` | PASS — 52 JavaScript artifacts, server/secret markers absent |
| `npm audit --json` | PASS — zero known vulnerabilities at check time |
| `node scripts/test-call-runtime.mjs` | PASS — production custom server, anonymous HTTP/socket 401, worklet 200, Chromium home→login, no page/console errors |

The runtime smoke has synthetic process configuration, an empty database URL, Mock dialogue and no
provider keys. It does not log in, create a user, call a database or invoke STT/TTS/AI. Its screenshot
is local ignored `frontend-artifacts/call-runtime-login.png`. An initial smoke assertion checked login
controls before client navigation finished; the check now waits for the visible form. This was a
test synchronization issue, not evidence of a live authenticated flow.

## External verification — explicitly NOT RUN

| Check | Status / reason |
|---|---|
| Live Groq | NOT RUN — private GROQ_API_KEY/GROQ_MODEL absent |
| Groq optional model comparison | NOT RUN — no private free-provider configuration/quota |
| Live Azure Speech | NOT RUN — AZURE_SPEECH_KEY/AZURE_SPEECH_REGION absent |
| Dedicated MySQL migration deploy / integration | NOT RUN — MYSQL_TEST_DATABASE_URL and test RSA configuration absent |
| Live Auth.js + database / browser MySQL E2E | NOT RUN — dedicated test DB unavailable |
| OpenAI Luna | Not rerun; pending credits. Historical 25 September live result was HTTP 429 credit_balance_exhausted |

Both new live launchers were invoked with private `.env.local` loaded by Node; they correctly stopped
with NOT RUN and exit 1 before any network request. That guarded exit is **not** a passing live test.
The default suite's 49 skips are conditional external-database tests, not failures hidden as passes.
No database reset or fallback to the application's private database was attempted.

## Dependency safety

During fresh installation, audit reported Next 16.3.5's
[ImageResponse advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) and a transitive
[fast-uri normalization advisory](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj).
Next was patched to 16.3.8; fast-uri's lockfile resolution was updated to 3.1.8 without a Prisma
major upgrade or forced audit fix. This repository does not use next/og ImageResponse; no exploit
claim is made. Fresh install and final audit report zero known vulnerabilities, not a security guarantee.

## Remaining limits and review handoff

External service usability, microphone quality, Thai conversational quality, real multi-client MySQL
behavior and latency/concurrency targets are not established by fake tests. Supply dedicated private
Groq/Azure/test-MySQL settings for those opt-in verifications. Never put keys in browser code or commits.
The sanitizer is demo-only; all training/live-smoke content must remain fictional. WebSocket deployment
requires a persistent Node server; no cloud deployment or distributed rate limiter is included.

Model attribution remains explicit: historical Proposal `gpt-5.4-mini`; approved OpenAI implementation
`gpt-5.6-luna`; Groq development preference `openai/gpt-oss-120b`, optional comparison
`qwen/qwen3.8-27b`. No model equivalence or successful live provider access is claimed.

Stop for review after branch push; do not begin Profile or Dashboard.
