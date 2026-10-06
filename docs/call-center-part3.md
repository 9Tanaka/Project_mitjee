# Call Center Part 3 — performance, live dialogue and Phone voice

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

Local gates and Preview evidence will be recorded below after completing their checks.
Dedicated MySQL/E2E suites **NOT RUN**: MYSQL_TEST_DATABASE_URL absent; runtime database
was not used for reset-based suites. Synthetic profiling/smoke history remains intact.
Fresh npm ci reports a pre-existing high-severity source-map-js advisory
GHSA-68fv-2mgg-jv7q; no unrelated dependency upgrade or automatic audit fix performed.

Historical intermittent Preview start 500 root cause remains **UNCONFIRMED**. New timings
and successful bounded samples alone cannot establish that it is permanently fixed.

### Local gates (6 October)

Fresh npm ci/postinstall generation, prisma generate/validate, typecheck, full regression
**833 passed / 49 skipped**, frontend **108**, auth **82**, AI **211**, speech **82** and
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
