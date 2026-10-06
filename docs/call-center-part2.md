# Call Center Part 2 — complete text/interactivity

Historical v4 implementation record. New sessions now use v5; see
[behavior hardening and current verification](call-center-behavior-hardening.md).
The v4 configuration and historical evidence below have not been rewritten.

These are approved implementation decisions, not a rewrite of the historical Proposal.
One public `call-center` entry remains among nine categories. Old `call-center-scam`
detail/prepare URLs permanently redirect; the API also resolves the alias. Historical
start identities are checked before creating a new session. Internal IDs remain unchanged.

## Version and authority

New starts use immutable template version 4 for CC-01/CC-02/CC-N01/CC-N02.
Published v1/v2/v3 remain registered unchanged. Configuration still uses the existing
JSON and state-string persistence contract; no migration, reset or schema push is required.

`CALL_CENTER_DEMO_STORY`, when nonempty and valid, wins completely, even when the older
`CALL_CENTER_DEMO_VARIANT` is invalid. If exact selection is absent/empty, only then is
the older variant validated. Unset settings preserve cryptographically random 50/50
normal/scam and topic selection. Neither browser nor model chooses the story.

Answer commits CALL_CONNECTED/revision and returns PENDING with zero provider calls.
The frontend automatically requests the protected `/opening` endpoint on every pending
caller beat, including refresh recovery. A manual retry is displayed only after error;
the bounded HTTP deadline also turns a stalled request into recoverable error.

Each v4 state authors purpose, `callerTurnRequired`, allowed/forbidden behavior, fallback,
apps, interactions and guarded transitions. Acyclic deterministic IDs are `caller-opening`
and `caller-state-STATE`. Core atomically commits one character message, receipt, action,
eligible checkpoint and revision. No fake learner message exists. Failed writes remain
pending; duplicate/concurrent requests commit once. Contextual actions and apps remain
hidden until that state's receipt commits; fallback counts as a committed caller beat.
Provider generation cannot change state or evaluation. Progress requires explicit actions.

## Four stories and contextual apps

| Internal story | Authored path/content | Relevant simulated apps |
| --- | --- | --- |
| CC-01 | Parcel reference → fake case → fictional authority → secrecy/urgency → inspection transfer | Caller information, own parcel, transfer Bank only after MAIN_REQUEST |
| CC-02 | Bank identity → abnormal transaction claim → pressure → synthetic OTP request | Caller information, own Bank after context, Messages only after MAIN_REQUEST caller beat |
| CC-N01 | Matching parcel/order/window → necessary delivery information → confirm/reschedule/limit/end | Caller information and own parcel; no transfer or OTP workflow |
| CC-N02 | Matching transaction/reference/amount/time/item → acknowledgment/end/callback | Caller information and own Bank; no OTP or transfer workflow |

All organizations, references, accounts and phone labels are fictional. The normal-bank
reflection explicitly says “ตัวอย่างสายธนาคารปกติในสถานการณ์จำลอง”; it does not generalize
to every real bank. Normal calls have no fake warnings, threats, secrecy or forced deadline.
Reasonable caution, answering, ending and known-channel callback are not penalized.

Phone navigation is a backend-authored CALL_INTERACTION, not route navigation.
The projected active app derives from committed actions and resets to CALL on state entry.
It preserves session, revision, transcript and pending beat. Hidden/future actions are
revalidated in Core even if a browser fabricates an action ID.

## OTP, transfer and fresh confirmation

The six-digit simulation OTP is deterministically derived from the persisted session ID,
stable across refresh and projected only in the eligible Messages state. It is not a real
SMS, not based on the learner's phone, and never provided to the model. Existing dialogue
redaction remains unchanged; typing a six-digit value is redacted and never critical.

Opening/viewing/copying content, free text, STT and AI candidates cannot fail a session.
Only the correct MAIN_REQUEST story and app can prepare a confirmation after the authored
view interaction. The preparation must be the latest committed action at revision-1;
intervening text/navigation invalidates it. Fresh explicit confirmed SIMULATED_ACTION
then commits DISCLOSE_OTP or CONFIRM_UNVERIFIED_TRANSFER, event, failure/result and revision
atomically. The UI confirmation is neutral, not colored as an answer hint. No payment API.

## Behavior and result

Observable behavior derives from immutable TrainingAction fingerprints plus the pinned
template: answering, asking identity/reference/clarification, app navigation/checking,
view/preparation, refusal, explicit sharing/transfer, hangup and callback. No new table.
TrainingEvent remains the official backend-validated scoring event with its opportunity FK;
simple navigation is not fabricated as an official scoring event.

Reflection shows PASSED/NEEDS_PRACTICE/UNASSESSED/CRITICAL_FAILURE, `trainingScore=null`,
good/review explanations, encountered checkpoints and stable action/revision-order timeline.
Normal controls require encountered finalized behavior, not merely zero critical events.
Previously REVIEW behavior is not overwritten by a later safe exit. Passing applies only
to the encountered path. AI qualitative identity/reference/clarification hints appear in a
separate NON_AUTHORITATIVE section and never affect official evaluation.

## Verification and limits

`tests/call-stories.test.ts` covers all four v4 paths, app gating, OTP stability, noncritical
view/text, critical confirmation, caller-turn CAS/idempotence, failed-write recovery and
checkpoint/revision guards. Historical foundation tests explicitly pin v3.
`node scripts/verify-call-stories-live.mjs` privately loads local configuration and tests
real Groq opening, learner text/reply and a later state beat for every story, with strict
schema, unchanged official state/evaluation and no fallback. It prints only sanitized
categories and receipt metadata; evidence is ignored `frontend-artifacts/call-stories-live.json`.
`node scripts/verify-ui.mjs` is a production-rendered browser UI test with in-memory/mock
transport, not proof of real login/MySQL/Groq. Deployed acceptance must be tested separately.

Other eight categories are regression-only and unchanged in content. Voice/Azure/WebSocket
seams are preserved; polished PTT, opening TTS, STT/TTS and Vercel voice acceptance remain
Part 3. Game, Knowledge Base and Dashboard backends are not added.

### Local and live verification — 6 October 2026

- Fresh `npm ci`: passed; ignored Prisma client generated by the install hook.
- Explicit Prisma generation/validation and typecheck: passed.
- `npm test`: 783 passed / 49 skipped; dedicated MySQL/real-auth E2E remains NOT RUN
  without a safeguarded dedicated test database. Runtime defaultdb was not used as a test DB.
- Frontend: 103 passed; Auth: 82 passed; AI: 189 passed.
- Production build: passed; client audit: 68 JavaScript artifacts passed.
- Browser UI: 117 screenshots / eight flow groups passed, including all four v4 stories,
  state turns, apps, stable OTP refresh, both explicit critical controls, normal reflection
  and regression flows at 375/768/1440px. This is in-memory/Mock UI verification.
- Real Groq: all four stories passed opening, learner text/reply and IDENTITY_CLAIM
  caller state turn; all 12 accepted receipts have usedFallback=false. CC-01 learner reply
  succeeded on attempt 2 after INVALID_OUTPUT (receipt retains failureReason=ERROR);
  the other 11 succeeded first attempt with failureReason=null. Do not call this fallback.
- The initial unpaced run hit RATE_LIMITED after both scam stories. Verification-only
  pacing between requests recovered all four; no provider/model substitution. This is
  not a latency benchmark and does not promise quota availability under rapid/concurrent use.
- Existing npm audit warning: transitive source-map-js before 1.2.2, high severity,
  GHSA-68fv-2mgg-jv7q. This focused Call Center phase did not change unrelated dependencies;
  the separate client-secret audit passed. Do not confuse the two audits.

### Deployed Preview acceptance — 6 October 2026

Implementation commit `3d3993171b045f24fa6403fbb32e9df67f80beb9` was built by the existing
Preview project as `dpl_2DTWb4k6bL1ZuY4dwXcqBuiktsJV` (READY). The stable branch alias is
https://mitjee-ui-preview-git-feat-rule-based-895992-9tanakas-projects.vercel.app.

`node scripts/verify-call-preview.mjs` passed real browser registration (201), Credentials
login, authenticated refresh, canonical catalog/detail/prepare, safety acknowledgment,
start (201), Answer (200, CALL_CONNECTED/PENDING, no messages), automatic caller opening
(200, character speaks first), Thai text/reply (200, state unchanged), contextual hangup,
completed result and logout. After logout the protected session API returned 401.
There was no API interception, mock authentication or provider substitution.

An ownership-scoped read of the smoke session confirmed template v4, COMPLETED/END_SCENARIO,
one CHARACTER_OPENING action, two dialogue receipts, zero critical events and exactly one
official PASSED result with trainingScore=null. Both receipts succeeded on attempt 1 with
usedFallback=false and failureReason=null. Browser page-error count was zero. This early
safe-exit result covers the encountered path, not mastery of all story checkpoints.

Two initial harness runs exceeded Playwright's default five-second assertion deadline at
login/catalog and prepare rendering. The verification harness now uses a bounded 60-second
assertion deadline, matching its browser operation deadline, with fixed failure-check labels.
Assertions were retained; no runtime logic was changed to make the acceptance pass.
This was not evidence of a failed Credentials login or a provider fallback.

Sanitized receipt/status evidence and screenshots are local ignored artifacts under
`frontend-artifacts/part2-preview/`. Synthetic accounts/history are retained. No environment,
protection, database schema/migration or Production deployment was changed. A documentation/
verification-harness follow-up commit does not change the verified runtime implementation.

### Latest-deployment repeat: unresolved runtime failure

The documentation/harness follow-up `d52da9dc5d30e9ead83588c82e4e5aeac7185baa` built READY
as `dpl_AuG8h4FBAVk2HZZQFoFUKANhBngB`. A repeat was not consistently green: one run timed
out rendering the catalog after authenticated refresh; the next passed registration,
login, refresh and detail/prepare but POST `/api/scenarios/call-center/start` returned 500.
The synthetic account remained authenticated. Do not describe the latest repeat as a
passed end-to-end acceptance merely because the earlier implementation deployment passed.

Read-only local runtime-adapter checks passed SELECT 1 and confirmed all four published
v4 configurations exactly match the validated source templates. No database changes were
made. The Vercel runtime-log connector returned 403 Forbidden (permission denied), not an
empty log result. Consequently the start-500 root cause is UNCONFIRMED: MySQL availability,
template drift, quota or a transaction timeout must not be asserted as its cause without
the deployed error evidence. Runtime-log access or a sanitized trace for that start request
is required to continue diagnosis. The harness now captures fixed failure-boundary labels,
authentication/UI booleans and a masked screenshot, and stops on a non-201 start response.
