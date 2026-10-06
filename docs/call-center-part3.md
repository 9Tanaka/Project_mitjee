# Call Center Part 3 — performance, live dialogue and Phone voice

Historical milestone record. Current new sessions use
[v6 continuous semantic-gated UX](call-center-continuous-ux.md); the measurements and
v5 verification below describe the Part 3 source, not a claim about current v6 results.

Implementation decisions, not a rewrite of the Proposal. Starting HEAD:
`787a15c62de1ea8e96cf8eebd3f106e36fe377a2`, branch `feat/rule-based-evaluation`.
No template v1–v5 configuration, migration, scoring formula or other-category redesign.
Published v5 remains the selected runtime; no v6 needed.

## Measured performance

Profiled the configured runtime MySQL before editing, with two freshly constructed clients,
three fresh starts/replays/resumes per worker, synthetic owned sessions retained, no AI/auth
benchmark and no reset-based test substitution. `scripts/profile-call-runtime.mjs` emits
only bounded category timings; never SQL, credentials, certificate content or message text.

| Operation | Before (ms) | After (ms) |
| --- | --- | --- |
| Cold-ish connection/probe, two clients | 696 / 403 | 560 / 392 |
| Application initialization, 27 bounded publication checks | 1019 / 906 | 1012 / 1168 |
| Fresh start, six samples | 2292, 2300, 2250, 2599, 2244, 2280 | 961, 971, 969, 907, 951, 912 |
| Exact replay, six samples | 1278, 1266, 1263, 1293, 1253, 1315 | 719, 717, 744, 779, 700, 719 |
| Resume, six samples | 963, 933, 960, 929, 961, 978 | 382, 367, 372, 353, 353, 383 |

Repository-controlled costs: duplicate owned-session reads, rereading a newly created
aggregate via resume, and repeatedly loading validated immutable pinned templates.
Fresh-start repository calls reduced from four `get` + two `getTemplate` + one `create`
to two `get` + zero/one `getTemplate` + one `create`; resume uses one owned read rather
than two. Legacy compatibility lookup remains for historical idempotency. Orchestrator
obtains one owned context instead of double-resuming. Voice HTTP no longer binds twice.

Prisma adapter's bounded (128-entry) worker-local immutable template cache stores only
validated, identity-matched configurations and returns detached copies. Publication still
reads/compares database configuration even on a cache hit. Session JSON validation,
ownership, CAS, atomic commits, TLS and bounded publication fanout remain enforced.
Existing initialization promise reuse is regression-tested, not falsely described as new.
Remaining local elapsed time is predominantly repository/remote round trips; initialization
still performs required publication checks. Samples are not a latency SLA or load test.

## Real Groq check

`scripts/verify-call-stories-live.mjs --paced` completed **all four v5 stories**, each with
Answer → committed caller opening → Thai learner text/reply → authored identity beat.
CC-01, CC-02, CC-N01 and CC-N02 all passed; every tested receipt was first-attempt,
`usedFallback=false`, `failureReason=null`. This is real Groq with in-memory Core,
not deployed Auth/MySQL/browser evidence. Model/schema validation was not relaxed.

Previous CC-N01 INVALID_OUTPUT was **not reproduced; historical root cause UNCONFIRMED**.
Closed provider diagnostics now distinguish envelope, output parts, malformed JSON,
candidate/event pair, enum and schema shape, without raw output/issues/values. No speculative
prompt/model change. The runner continues after failures/exceptions and aggregates PASSED
only if all four pass. Provider errors expose only closed categories. Pacing is harness-only;
runtime retry/deadline behavior is unchanged. Successful recovered retry still stores null
failureReason; historical Part 2 already verified that with a real persisted receipt.

## Voice architecture and authority

Phone Push-to-Talk → bounded transient WAV → authenticated owned HTTP/socket voice transport
→ existing Azure STT → sanitized FREE_TEXT → existing Groq orchestration/atomic dialogue
→ Azure TTS after commit → transient browser audio. WebSocket failure retains identical
turn/revision/audio through HTTP fallback; basic Vercel voice needs no custom socket server.

Every committed character opening/state/reply can separately use `/speech` with owned
turnId only, to synthesize/replay without another AI turn/action or evaluation mutation.
TTS failure never rolls back dialogue. Text/captions remain available; microphone permission
is explicit, playback stops during recording, aborted late audio is discarded. Timer is
presentation-only. No full duplex, real calls, cloned voices, real payment or SMS.

STT OTP mention/transfer agreement remains non-authoritative. Only current simulator Bank/
Messages actions with fresh explicit confirmation can create the critical backend event.
Scams retain three meaningful checkpoints, normals two, with behavior-derived branching
and actual simulator evidence required for the independent-verification branch.

Live Azure STT/TTS **NOT RUN**: both local configuration and Preview environment metadata
lack AZURE_SPEECH_KEY / AZURE_SPEECH_REGION. No credentials invented. Fake-provider tests
do not establish live speech quality or real microphone acceptance.

## Verification status

Local gates and Preview evidence are recorded below, separately by verification scope.
Dedicated MySQL/E2E suites **NOT RUN**: MYSQL_TEST_DATABASE_URL absent; runtime database
was not used for reset-based suites. Synthetic profiling/smoke history remains intact.
Fresh npm ci reports a pre-existing high-severity source-map-js advisory
GHSA-68fv-2mgg-jv7q; no unrelated dependency upgrade or automatic audit fix performed.

Historical intermittent Preview start 500 root cause remains **UNCONFIRMED**. New timings
and successful bounded samples alone cannot establish that it is permanently fixed.

### Local gates (6 October)

Fresh npm ci/postinstall generation, prisma generate/validate, typecheck, full regression
**840 passed / 49 skipped**, frontend **109**, auth **82**, AI **211**, speech **82** and
WebSocket **20** passed. Targeted tests cover startup/cache, all-story runner, speech HTTP,
voice non-authority, permission denial/no device, old/late audio, replay and bounded speech
admission. Production build and client audit passed (69 JS artifacts); diff check passed.
Local production UI/real in-memory services passed 120 screenshots / nine flow groups,
375/768/1440 widths, no unexpected browser errors. This UI check is not real Auth/MySQL/
Groq/Azure acceptance. Speech presentation shares the existing one-owner/session, 20-total
admission set; it cannot fan out unlimited TTS requests.

### Initial Preview attempt and transaction hardening

`dpl_6fM2JQ8PyUwSkrdkoLkGzDJgRT9i` at `d66c30ffaba2f081874a6a12f5da5a07e5ecba25`
was READY. Controlled CC-01 progressed through real registration/login/refresh/start,
opening, Thai reply and context decisions, but `/opening` at PRESSURE returned **500**:
`DATABASE_TRANSACTION` / `APPLICATION` (P2028 taxonomy). Owned DB read confirmed the
PRESSURE character turn/receipt was already committed. This is a newly observed dialogue
request failure, **not a reproduced historical start-500 root cause**. Runtime log connector
returned 403; do not infer an exact expiry/driver root cause from the category alone.

Aggregate reads formerly used Prisma's implicit transaction budget. Hardening makes the
read budget explicitly finite at 15 seconds, retaining RepeatableRead; writes/publication
remain finite at 10 seconds, with a 5-second maximum transaction acquisition wait. No
CAS/ownership/rollback checks removed. P2028 logs contain only operation, category,
elapsed/budget milliseconds; raw errors/meta/SQL/session IDs are not serialized.
This defensive change and following acceptance must not be described as proof that the
original intermittent start failure is permanently fixed.

The separate real Preview start-only check on that deployment passed two fresh starts
(6671 / 6251 ms), replays (4916 / 5256 ms), and resumes (2515 / 2682 ms), without AI.
It materially improves the previous 13780–22941 ms starts / ~7937 ms replays, but is not
a hard SLA. Cold function initialization was not independently isolated on Preview.

### Additional bounded evidence and diagnostics

On `6f70080bc994c3b04fc4a17dcc34482c366b2926`, a second start-only Preview check passed:
fresh starts **5667 / 9979 ms**, replay **4827 / 4448 ms**, resume **4517 / 2691 ms**.
Other bounded acceptance flows were running, so these are variability samples, not an
isolated concurrency benchmark. Both sets of samples are retained; no best-sample-only claim.

Real CC-01 safe and explicit Bank-transfer critical paths passed on Preview; CC-02 safe
also passed. Each had six stored Groq receipts, all attempts=1, usedFallback=false and
failureReason=null; one official categorical result and trainingScore=null. Safe outcomes
were PASSED with three ordinary checkpoints; critical had two ordinary checkpoints plus
one explicit critical failure. Registration/login/refresh and logout/protected-API 401 passed.
Real HTTP speech-unavailable/replay on the two safe paths preserved the aggregate and text
input remained usable. This proves unconfigured presentation fallback, not live Azure audio.

A first CC-02 critical attempt on the same runtime failed at IDENTITY_CLAIM `/opening`:
500 DATABASE_TRANSACTION / APPLICATION, requestId `f4d5fbe5-64dd-497d-9308-253caad402fb`.
Bounded owned DB inspection found revision=4, four actions, three messages and two earlier
non-fallback receipts; no identity receipt. Unlike the earlier PRESSURE failure, this one
occurred before the identity dialogue commit. Exact GET/SAVE/acquisition/expiry cause remains
UNCONFIRMED; runtime-log connector access was denied, and browser access tool initialization
was unavailable. Failed reports are retained, not overwritten by successful checks.

Commit `16b602f16b1e03273630226f520706bf036d6bf0` adds process-local WeakMap error context.
Only recorded repository operation (GET/SAVE/CREATE/PUBLISH), duration and finite budget are
exposed in the existing failure response headers, without changing public JSON DTOs. Unknown
errors cannot inject arbitrary diagnostics; original error propagation and atomic behavior
are unchanged. This is instrumentation, not an asserted fix for unconfirmed historical errors.

`scripts/profile-call-runtime.mjs --dialogue` ran two new local clients and twelve action/
twelve Mock-opening samples against runtime MySQL. Action total 1556–1676 ms (SAVE 805–887);
opening total 2926–3074 ms (SAVE 1095–1150). All passed. All provider calls in this profile
are Mock, not Groq latency measurements. Remaining aggregate rechecks enforce lifecycle,
authority or CAS; no coherent-snapshot/ownership checks were removed to chase Preview variance.

A subsequent instrumented Preview request identified SAVE as the failing operation:
`/message` 500 DATABASE_TRANSACTION / APPLICATION; requestId
`d89845e0-be03-4f2e-9734-ee4922d9ff30`, duration 11404 ms, finite budget 10000 ms.
This establishes an observed write-budget/latency problem, not the historical start-500
root cause or a specific remote-driver/expired-transaction message (never serialized).

Atomic write hardening combines the mutable session header with its conditional revision
UPDATE (same CAS row lock; failed identity/history/child validation still rolls it back),
and writes new dialogue messages in one strict createMany batch after the receipt. No
skipDuplicates, swallowed FK/unique failure, new schema or changed repository semantics.
SAVE budget is now finite 15 seconds, GET 15, CREATE/PUBLISH 10; maxWait remains 5.
The [Prisma 7 transaction reference](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions)
distinguishes acquisition wait from transaction duration; budgets are demo hardening, not
a latency guarantee. Adapter query-graph tests explicitly cover CAS rejection, identity
validation, receipt/message dependency and original batch failure propagation. They are
not described as real MySQL rollback tests.

The same twelve/twelve local MySQL/Mock profile after write hardening passed: action total
1337–1441 ms (SAVE 592–643), opening total 2710–2812 ms (SAVE 803–864), compared with
1556–1676 / 805–887 and 2926–3074 / 1095–1150 before. This reduces safe repository work
without removing the required coherent reads, revision checks or privacy validation.

The CC-02 explicit Messages OTP path subsequently passed on runtime
`dcabd847f7cf5744b0002ffe183b976b88fac99c` (started at deployment
`dpl_FsZRXtasY8PSKUXPgkwr9D9NGsRV`, stable alias later advanced for the next pinned story).
All six receipts were first-attempt/non-fallback with null failureReason; result
CRITICAL_FAILURE, two ordinary checkpoints plus one critical event, exactly one official
result and null trainingScore. Free text preserved state/events/opportunities; Auth.js
registration/login/refresh and logout/401 passed. No browser error or 500 in that run.
This is successful post-hardening acceptance, not proof of a universal latency SLA or a
resolved historical error cause. Earlier failure reports remain part of the evidence.

CC-N01 full normal-control Preview acceptance also passed on the same runtime (started
on `dpl_GW8gqNiJ1VAgGwL3Q4HoYT9oaXuQ`). Five receipts (opening, Thai reply, identity,
context, main) were non-fallback/first-attempt/null failureReason. Result PASSED, two
ordinary checkpoints, zero critical events and exactly one official result with null
trainingScore. No browser error or 500; authenticated refresh and logout/401 passed.
The historical CC-N01 INVALID_OUTPUT remained unreproduced in both local live and deployed
normal-control runs; no unsupported assertion of a historical root cause is made.

CC-N02 full normal-control Preview acceptance passed on the same runtime (started on
`dpl_4vn7yHXv4GSA6NoCcnbGRFjPo5A3`): five first-attempt/non-fallback receipts, all null
failureReason; PASSED, two ordinary checkpoints, zero critical events, one official result
and null trainingScore. Real registration/login/refresh/logout/401 and free-text non-authority
checks passed; no browser error or 500. Normal stories bypass the scam PRESSURE beat.

### Final parcel repeat and logout hardening

On `dcabd847f7cf5744b0002ffe183b976b88fac99c`, the repeated CC-01 explicit Bank path
passed (started on `dpl_GEM84WMAWCGDZ2ZPsKYwN2Bomk9s`), with six non-fallback/first-attempt
receipts, one critical event and one null-score CRITICAL_FAILURE result; logout/401 passed.
The repeated CC-01 safe training/result also passed: three checkpoints, no critical event,
one official PASSED result. A real CONTEXT_CLAIM retry succeeded with attempts=2,
usedFallback=false and failureReason=null; all other receipts were first-attempt. Actual
speech-unavailable/replay preserved dialogue and text usability.

That safe repeat is recorded as **FAILED overall**, because after reaching Login on logout
its API-context request was still authenticated (no 500). Do not relabel it as a complete
passing run. A separate real Auth-only probe subsequently got browser=401, API-context=401
and no session cookie without any code change; this does not establish the producer of the
intermittent residual cookie. Exact logout race/transport cause remains UNCONFIRMED.

Defensive UI hardening uses official Auth.js signOut redirect/document-navigation instead
of SPA replace + refresh after signOut's session refetch. No custom cookie clearing, identity
bypass, server-side token revocation, JWT strategy/lifetime change or auth-schema mutation.
UI regression tests require the supported redirect call, no competing router refresh, and
a recoverable error rather than pretend logout when signOut rejects. The
[Auth.js client implementation](https://github.com/nextauthjs/next-auth/blob/main/packages/next-auth/src/react.tsx)
shows the distinct redirect and non-redirect/session-refetch branches. A reported
[session-cookie race](https://github.com/nextauthjs/next-auth/issues/8897) is context, not proof
of this run's historical cause. Failed evidence stays alongside new checks.

On `ea430a2f95d776b80ad2f1759b7e2abe29795f5f` / `dpl_AYZNiho6Lh3efGfjXCA7sxeVBZXi`,
two independent real registration/login/logout probes passed after the change. Each got
browser fetch=401 and Playwright API-context=401, with no session-token cookie remaining.
No API interception, cookie clearing, mock auth or backend contract change was used.
These are bounded acceptance checks, not a claim that the historical producer is proved.

A bounded read-only lexical audit of the two normal sessions' five committed character
messages each found no OTP/password/transfer/secrecy/threat terminology in that sample.
Only boolean categories were emitted, not messages, provider bodies or identities. This
is supplementary caption review, not semantic proof for every generated response and never
an event/scoring/critical-failure rule.

Final CC-02 safe acceptance passed on the logout-hardened runtime
`ea430a2f95d776b80ad2f1759b7e2abe29795f5f` (started on
`dpl_AYZNiho6Lh3efGfjXCA7sxeVBZXi`). Six first-attempt/non-fallback/null-failure receipts;
PASSED, three checkpoints, no critical event and one official null-score result. Register,
login, authenticated refresh, real Groq, phone actions, result and logout/protected-API 401
all passed; zero browser errors and no 500. Real HTTP speech-unavailable/replay again
preserved the aggregate and usable text input; live Azure remains NOT RUN.

Final CC-01 safe acceptance also passed on the logout-hardened runtime
`ea430a2f95d776b80ad2f1759b7e2abe29795f5f` (started on
`dpl_8vyWRkVg7a24nss41T5V28xTsNQE`). Six first-attempt/non-fallback/null-failure receipts;
PASSED, three checkpoints, no critical event, one official result with null trainingScore.
Real register/login/refresh, caller-first Groq, phone actions, result and logout/401 passed;
zero browser errors and no 500. Actual HTTP unavailable/replay checks preserved the
aggregate and usable text input. This passing repeat does not erase the earlier failed
logout evidence or prove its historical cause.

## Consolidated acceptance and handoff

| Real Preview path | Tested runtime source | Outcome | Meaningful checkpoints | Groq receipts | Official results |
| --- | --- | --- | --- | --- | --- |
| CC-01 safe parcel | ea430a2 | PASSED | 3 | 6 | 1 |
| CC-02 safe bank | ea430a2 | PASSED | 3 | 6 | 1 |
| CC-N01 normal parcel | dcabd84 | PASSED | 2 | 5 | 1 |
| CC-N02 normal bank | dcabd84 | PASSED | 2 | 5 | 1 |
| CC-01 explicit Bank transfer | dcabd84 | CRITICAL_FAILURE | 2 ordinary + 1 critical event | 6 | 1 |
| CC-02 explicit Messages OTP disclosure | dcabd84 | CRITICAL_FAILURE | 2 ordinary + 1 critical event | 6 | 1 |

All six rows passed their real browser/Auth.js/MySQL/Groq acceptance including logout/401.
Every receipt in these six passing runs had attempts=1, usedFallback=false and
failureReason=null; every official result had trainingScore=null. Free text left state,
events and opportunities unchanged and did not create a result. The later ea430a2 source
changes only the logout UI boundary relative to dcabd84, not Core or backend semantics.
The subsequent documentation-only handoff commit does not constitute a new runtime test.

Temporary branch-scoped `CALL_CENTER_DEMO_STORY` was cleared to an empty value after the
last session was pinned, restoring existing variant/random selection for subsequent
deployments. Its environment record remains; it was not deleted. No browser selection
or provider authority was introduced, and existing `CALL_CENTER_DEMO_VARIANT` was unchanged.
The final Git-connected Preview build must consume this disabled exact-story override.

Implementation commits, in order:

- 45d5c79 — reduce runtime startup overhead.
- 339a0c9 — all-story live Groq verification and closed diagnostics.
- d66c30f — Phone-integrated Push-to-Talk and committed-turn speech.
- 36b1538 — bounded audio replay and stronger Preview evidence.
- 6f70080 — Preview voice/transaction hardening.
- 16b602f — bounded transaction diagnostics for verification.
- dcabd84 — atomic dialogue write round-trip reduction.
- ea430a2 — supported Auth.js document-navigation logout boundary.

Remaining limits: LIVE AZURE STT/TTS NOT RUN (private key/region absent); dedicated
MySQL/E2E NOT RUN (dedicated test database absent); runtime-log connector returns 403;
remote MySQL/Preview timing remains variable. Historical start-500, CC-N01 INVALID_OUTPUT
and intermittent logout producers are unconfirmed, not declared permanently fixed.
The pre-existing source-map-js advisory is recorded separately from the passing client
bundle secret audit. No database reset/drop/delete, migration/schema change, template
v1–v5 mutation, other-category expansion, main merge or Production deployment occurred.
Stop after the branch push and final Preview metadata/access check for review.
