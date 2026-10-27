# Call Center v5 — behavior and startup hardening

Historical v5 milestone. Current new sessions use [v6 continuous UX](call-center-continuous-ux.md);
v5 configuration and its pinned session behavior remain unchanged.

Approved demo implementation decisions, not requirements retroactively attributed to
the Proposal. New starts use v5 for CC-01 / CC-02 / CC-N01 / CC-N02. Historical v1–v4
remain registered without configuration changes; no migration or reset is required.

## Meaningful checkpoints and branches

| Variant | Eligible decision states |
| --- | --- |
| SCAM_CALL | CONTEXT_CLAIM, PRESSURE, MAIN_REQUEST (3) |
| NORMAL_CALL | CONTEXT_CLAIM, MAIN_REQUEST (2) |

CALL_CONNECTED and IDENTITY_CLAIM are caller/context beats, not artificial decisions.
PLAYER_DECISION and INDEPENDENT_VERIFICATION are behavior/reflection branches, not
additional checkpoints. Early termination before any eligible decision yields
UNASSESSED, not a fabricated PASSED result. Existing categorical evaluation rules and
`trainingScore=null` remain unchanged.

- CONTEXT_CLAIM: caution/trust continues to the next request. Only an actual simulator
  evidence check plus the finalized `checked` choice can enter INDEPENDENT_VERIFICATION.
- PRESSURE: finalized caution/trust continues to MAIN_REQUEST.
- Scam MAIN_REQUEST: refusal goes to CALL_ENDING; unresolved caution/trust goes to
  PLAYER_DECISION. Normal MAIN_REQUEST acknowledgment/delivery decisions go to CALL_ENDING.
- PLAYER_DECISION: end or propose callback. There is no generic transition into verification.
- Callback means intent only. It emits no VERIFY_SOURCE event and does not claim completed contact.

Verification requires three independent backend guards: finalized `checked` choice,
VERIFY_SOURCE event, and CHECKED_EXISTING_ORDER / CHECKED_TRANSACTION from a validated
explicit simulator action. Free text, AI observations, confidence and callback intent
cannot satisfy them. This verifies that the learner inspected existing **simulated**
order/transaction evidence; it does not prove caller identity, a claimed legal case or
contact with a real organization. Authored text states this limitation explicitly.

Required checkpoints remain non-skippable. Viewing OTP/transfer preparation is not
critical failure; a fresh explicit simulated confirmation is still required. Revision,
ownership, idempotency and historical result semantics are preserved.

## Receipt semantics

New valid provider responses reset terminal `failureReason` to null, including recovered
second attempts. `attempts=2` still exposes that retry occurred. Only actual fallback
retains terminal failureReason. Historical receipts are not rewritten; old recovered
ERROR metadata must not be interpreted as fallback when `usedFallback=false`.

## Startup and 500 diagnostics

Published template registration now reads/compares immutable configuration without a
write transaction. Missing versions are rechecked inside a transaction; concurrent
publication still compares configuration on a unique-key race. Core initializes in
bounded groups of four, not an unbounded connection fan-out.

Two fresh local runtime clients against the real configured MySQL reduced initialization
from 10.9–11.4 seconds to 1.4–1.5 seconds. Both runs passed four fresh starts and exact
idempotent replays. This is **a measured mitigation, not proof of the historical 500 cause**.
These are scoped non-destructive runtime diagnostics, not a dedicated database contract suite.

Training HTTP 500 responses/logs now expose only a closed category, stage and generated
request ID. No SQL, stack, error message, environment, account or provider body is logged.
Headers are X-MITJEE-Failure-Category, X-MITJEE-Failure-Stage and X-MITJEE-Request-Id;
public JSON error contract remains generic. `scripts/reproduce-training-start.mjs`
checks real runtime initialization/start/replay without provider calls.

On the previously deployed d0c548f Preview, registration/Auth.js and two fresh starts
plus exact replays passed (201/200); starts took ~14.5 seconds, replays ~8.5 seconds.
A separate full browser smoke stopped at catalog network timeout after refresh while
authentication remained valid. Historical start 500 was not reproduced and is not yet
declared closed. Post-deployment verification is tracked below.

## Verification on 6 October 2026

- Typecheck, targeted Frontend (103), Auth (82), AI (205), build and client audit
  (68 JavaScript artifacts) passed before final regression.
- Local production UI + in-memory/Mock: 117 screenshots, 8 flow groups, no unexpected
  browser errors. Includes four-story interaction paths and critical confirmation.
- Final regression: 809 passed / 49 skipped; typecheck, build, client audit and diff
  check passed. Dedicated MySQL/E2E database
  suites are skipped; runtime database was not substituted for their reset-based setup.
- Real Groq + in-memory v5: CC-01 and CC-02 passed opening/chat/identity beats without
  fallback. CC-N01 chat failed structured-output validation on both attempts and used
  fallback (`ERROR` receipt, sanitized provider category INVALID_OUTPUT). CC-N02 was
  not reached because verification correctly stopped at the failed boundary. No
  all-story live-success claim; no provider/model substitution or schema relaxation.
- Post-deployment start/browser acceptance: PASSED for runtime commit `26c1122b5a9191fc0aacdafb899659b35c15dfde`;
  deployment `dpl_8r7JF3RsdnyiLAT6HVbxe2EfPXbM` was READY and the stable Preview alias
  pointed to it. No production or environment changes.

### Deployed acceptance evidence

Stable Preview: https://mitjee-ui-preview-git-feat-rule-based-895992-9tanakas-projects.vercel.app

The start-only real browser/Auth.js diagnostic passed two fresh starts (`201`) and
their exact idempotent replays (`200`), without AI requests. Fresh starts took 22,941 /
13,780 ms; replays 7,939 / 7,937 ms. The separate full browser flow then passed a third
fresh start: register, login, session persistence across refresh, catalog, detail,
safety acknowledgment, answer, caller opening, Thai text chat, identity/context beats,
explicit contextual hangup, result and logout. Protected resume returned `401` after logout.
There were no intercepted API calls, mock authentication or unexpected browser errors.

Owned MySQL read confirmed template v5, COMPLETED / END_SCENARIO, zero critical events,
one opening action, one official categorical PASSED result and `trainingScore=null`.
This path ended at the first meaningful contextual decision; it is not a deployed
acceptance claim for every later branch or mastery of the whole category. Refusal,
caution, verification, normal completion and critical branches are covered by regression
and local UI verification, not by this one deployed session.

All four persisted receipts had `usedFallback=false` and `failureReason=null`:

| Receipt | State | Attempts |
| --- | --- | --- |
| caller-opening | CALL_CONNECTED | 1 |
| user text turn | CALL_CONNECTED | 2 |
| caller-state-IDENTITY_CLAIM | IDENTITY_CLAIM | 1 |
| caller-state-CONTEXT_CLAIM | CONTEXT_CLAIM | 1 |

The recovered second attempt independently verifies the new terminal-failure metadata
semantics on real Groq/MySQL. Its earlier provider error category is not persisted;
it must not be inferred from `attempts=2`.

Artifacts (ignored, local): `frontend-artifacts/part2-preview/start-only-v5.json` and
`frontend-artifacts/part2-preview/verification.json`. Synthetic accounts and histories
remain intact; no destructive cleanup was performed.

**500 status:** NOT REPRODUCED in this bounded post-deployment sample (three starts,
two exact replays and the complete tested browser path). Startup initialization was
hardened, and current start acceptance is green. The historical 500 root cause remains
UNCONFIRMED; this is not proof that intermittent errors cannot recur. Preview latency
is still high and has not been declared fixed. New closed-category diagnostics allow
future occurrences to be attributed without exposing raw error data.

No Voice/WebSocket runtime work, database schema changes, numeric scoring changes,
21-story expansion or Evidence Popup work is included. A pre-existing WebSocket test
race was fixed by selecting the open connection instead of a closing historical socket;
its assertions and runtime limits remain unchanged.
