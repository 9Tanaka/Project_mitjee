# Call Center rebuild — Part 1 foundation

Historical Part 1 record. New sessions now use [Part 2 v4](call-center-part2.md).
The old URL resolves/redirects to neutral `call-center`; Answer no longer awaits the provider.
The v3 template configurations below remain immutable/loadable, not the current new-session flow.

Implementation scope: a dedicated fictional phone simulator, backend-owned story selection,
semantic state architecture and an AI-first opening. This is **not four completed stories**,
not the 21-story storyboard and not a Voice/STT/TTS rebuild. These states and the shared
foundation content are approved implementation decisions, not states quoted from the Proposal.

## Runtime architecture

```text
PhoneSimulator → authenticated HTTP / public DTO
  → TrainingApplicationService → TrainingCore / EventValidator / State Machine
  → ScenarioDialogueOrchestrator → Mock / Groq / OpenAI provider
  → existing TrainingRepository → InMemory / Prisma + MySQL
```

Only Core commits actions, opportunities, events, state, revisions and categorical results.
Provider text, candidate events, confidence and STT interpretations have no scoring/transition
authority. Public DTOs expose phone state/status, sanitized transcript, opening status,
internal-app scaffolds and currently allowed actions; not template identity, variant, story ID,
private overrides or answer keys. The historical public slug `call-center-scam` is shared by
every condition and does not disclose the selected condition.

## Story selection and versioning

| Private identity | Topic | Variant | Pinned template |
| --- | --- | --- | --- |
| CC-01 | PARCEL | SCAM_CALL | call-center-parcel v3 |
| CC-02 | BANK | SCAM_CALL | call-center-bank v3 |
| CC-N01 | PARCEL | NORMAL_CALL | call-center-parcel v3 |
| CC-N02 | BANK | NORMAL_CALL | call-center-bank v3 |

One public Call Center card remains among nine categories. New sessions use v3; published
Call Center v1/v2 configurations remain unchanged and registered. Historical sessions retain
their pinned configuration and original generic training UI; they are not upgraded on resume.
The existing schema stores state as strings and template configuration as JSON, so Part 1
does not require a database migration. Existing database migrations are still required for
authentication/persistence on a newly provisioned database.

Private optional `CALL_CENTER_DEMO_STORY` accepts exactly the four identities above. A valid
exact-story override wins over a valid `CALL_CENTER_DEMO_VARIANT`. The latter still accepts
only `SCAM_CALL` / `NORMAL_CALL` and selects a random topic within that condition. Invalid
configuration fails closed with a fixed error without echoing the supplied value. When
unset, cryptographically secure backend selection retains 50/50 condition probability and
50/50 topic within each condition. Selection is persisted through the immutable template
tuple; duplicate start, retry, refresh and resume never reroll. Concurrent starts return the
persisted winner. Browser and model cannot select any of these values.

## State and opening path

The shared semantic superset is `INCOMING_CALL`, `CALL_CONNECTED`, `IDENTITY_CLAIM`,
`CONTEXT_CLAIM`, `PRESSURE`, `MAIN_REQUEST`, `PLAYER_DECISION`,
`INDEPENDENT_VERIFICATION`, `CALL_ENDING`, `END_SCENARIO`. Each template may use a subset.
Part 1 uses only:

```text
INCOMING_CALL → ANSWER_CALL → CALL_CONNECTED → character opening
  → IDENTITY_CLAIM → independent-verification decision
  → INDEPENDENT_VERIFICATION → explicit handling decision
  → CALL_ENDING → END_SCENARIO → categorical foundation result
```

Declining from incoming produces `ABANDONED`, no official result and no provider request.
The caller label is neutral: “ผู้ติดต่อไม่รู้จัก”. All four identities currently share this
basic identity/verification flow; only their fictional organisation/topic differs. No OTP,
transfer, normal-delivery or normal-bank story content is implemented here.

Answering and opening are **two CAS commits**, not one transaction spanning a network call:

1. `ANSWER_CALL` commits the state transition and revision.
2. Orchestrator loads the pinned template/role/state/allowed and forbidden behaviors, calls
   the provider, validates strict `AICharacterResponse`, sanitizes text and inspects candidates.
3. Core atomically saves one reserved backend `CHARACTER_OPENING` record (not a learner
   decision/scoring action), one character message, one receipt
   and its revision. There is no fabricated user message. Opening has reserved turn ID
   `caller-opening`; normal dialogue cannot occupy that ID.

The opening context has `turnKind=CHARACTER_OPENING` and `currentUserMessage=null`. The
Responses request contains developer context only, not a dummy user turn. Groq omits `store`;
OpenAI retains `store:false`. Failure/refusal/invalid output/timeout uses the authored opening
fallback with accurate `usedFallback`, `failureReason` and attempts. Deadline is 20 seconds,
one retry, with abort cancellation and no late commits. Known private story labels in model
output are blocked; this is not a claim of full production moderation.

A crash/write failure after answer leaves a resumable `PENDING` opening. GET resume performs
no provider request. Protected `POST /api/training/:sessionId/opening` takes only
`expectedRevision`; it can recover that pending opening. It shares ownership/origin/auth
checks and returns the existing receipt on duplicates. No contextual progress or dialogue is
allowed before opening is ready. New messages/voice are rejected after hanging up. Concurrent
quit/expiry/stale revision cannot accept a late opening.

## Phone UI and evaluation

Reusable components: `PhoneShell`, `IncomingCallScreen`, `ActiveCallScreen`, `CallTranscript`,
`CallControls`, `PhoneAppSwitcher`, `ContextualActionSheet`. Text is displayed as a call
transcript, not chat bubbles. There is no permanent generic checkpoint panel. A neutral
“ตัวเลือกขณะนี้” control opens only current backend-projected actions; future actions are
rejected server-side. The sheet restores keyboard focus and closes on Escape.

Messages / Bank / Parcel / Caller Info are labelled **foundation scaffolds**; viewing them
does not perform verification, transactions or evidence interaction. Call ending leads to
the existing real categorical result page. The two encountered D/S decisions determine the
foundation-only `PASSED` / `NEEDS_PRACTICE` outcome; no numeric score, W evidence or critical
story request is invented. Passing does not imply proficiency in the category or detection
of the hidden condition. The existing explicit-critical-action rule remains intact for
historical templates and the other eight categories.

Existing voice controls are retained as collapsed, opt-in seams after opening is ready.
No microphone auto-start, final voice UX, provider changes or new WebSocket work is added.

## Verification scope and Part 2

New tests cover four identities, private override/browser rejection, stable selection,
incoming/answer/decline, first-character opening, strict Groq body, fallback receipts,
timeouts/late responses, pending recovery, concurrent writes, contextual actions and UI.
Existing historical Call Center/Voice tests explicitly pin v2; the other eight categories
retain functional regressions. UI browser verification uses the real in-memory application
services and Mock provider on a production Next server at 375/768/1440px; it is **not real
Auth.js/MySQL/live Groq acceptance**. Dedicated MySQL tests skip without a test database;
runtime credentials must never substitute for one. No destructive database commands run.

Local verification on 2026-10-06: Prisma generation/validation, typecheck and build passed;
`npm test`: 760 passed / 49 skipped, `test:frontend`: 102 passed, `test:ai`: 167 passed.
Client audit passed for 68 JavaScript artifacts, including checks for the private story
override/registry markers. An existing 20-question Quiz UI test exceeded the default 5-second
budget under the full suite; its test-only budget is now 15 seconds with every assertion
unchanged. No Quiz runtime changes were made. These numbers are local verification, not a
claim that the new foundation has passed deployed MySQL/Groq/Voice acceptance.

Production Next browser verification also passed: 87 screenshots across seven flow groups,
including phone incoming/active/internal app/contextual actions/ending/result at
375/768/1440px, text-only authority checks and refresh. No horizontal overflow, hydration
or unexpected browser errors were observed. Evidence is kept locally in the ignored
`frontend-artifacts/ui-refresh/verification.json` and screenshots. The browser API bridge
uses a synthetic test identity, real in-memory services and Mock dialogue; it does not
establish live authentication, database or provider acceptance.

Part 2 remains: authored separate parcel/bank scam/normal story contents, contextual requests
and evidence, internal-app behavior, per-story decision/critical-action rules and corresponding
tests under a new immutable version. Part 3 owns the final voice experience. Other eight
categories remain regression-only scope.
