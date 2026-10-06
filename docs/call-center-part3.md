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
| Cold-ish connection/probe, two clients | 696 / 403 | 515 / 375 |
| Application initialization, 27 bounded publication checks | 1019 / 906 | 993 / 895 |
| Fresh start, six samples | 2292, 2300, 2250, 2599, 2244, 2280 | 952, 958, 959, 883, 936, 951 |
| Exact replay, six samples | 1278, 1266, 1263, 1293, 1253, 1315 | 721, 708, 730, 709, 693, 708 |
| Resume, six samples | 963, 933, 960, 929, 961, 978 | 397, 365, 365, 387, 365, 361 |

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
