# Call Center Post-Decision Tutorial and Incident Recovery Guidance

Status: **CALL_CENTER_POST_DECISION_GUIDANCE_COMPLETE**

Implementation date and authored-content review date: **2026-10-25**.

Branch: `feat/rule-based-evaluation`. Starting HEAD: `2a6fcb705969dfc94d458cd372b72615f336fe42`.
This phase is implemented as working-tree changes for review; it does not deploy or change production.

Approved scope: [Call Center post-decision plan](call-center-post-decision-plan.md).
Runtime code, rather than proposed storyboard content, defines the supported actions and paths.

## Runtime scope and coverage

| Story | Exact immutable binding | Checkpoints | Choices | Critical rules |
| --- | --- | ---: | ---: | ---: |
| CC-01 | `call-center-parcel`, v6, `SCAM_CALL` | 3 | 14 | 1 |
| CC-02 | `call-center-bank`, v6, `SCAM_CALL` | 3 | 14 | 1 |
| CC-N01 | `call-center-parcel`, v6, `NORMAL_CALL` | 2 | 10 | 0 |
| CC-N02 | `call-center-bank`, v6, `NORMAL_CALL` | 2 | 8 | 0 |

Coverage totals: **10 checkpoint definitions, 46 choices, 2 critical rules**.
All current Call Center checkpoints are D checkpoints. Guidance does not introduce W/S measurement,
numeric scores, new assessments, or new events. `caution`, `checked`, `refuse`, and appropriate normal-call
actions remain SAFE; `trust` remains REVIEW. Hang-up/callback semantics remain unchanged.

## Files

New implementation files:

- `src/fixtures/call-center-learning-content.ts`: deeply frozen authored content and source metadata.
- `src/application/post-decision-guidance.ts`: static mapping validation and read-only guidance projection.
- `src/public-api/post-decision.ts`: strict, browser-safe guidance schema.
- `src/frontend/call-center-result.tsx`: result view for mapped Call Center sessions only.

Existing implementation files changed:

- `src/application/contracts.ts`: optional `postDecisionGuidance` and public types.
- `src/application/projections.ts`: enrich an already permitted Result and reuse the identical opaque rule-reference calculation.
- `src/public-api/contracts.ts`: optional guidance field in the existing Result DTO.
- `src/frontend/result.tsx`: select the new view only when guidance is present; otherwise retain the original view.

New verification files:

- `tests/post-decision.helpers.ts`: real application/Core with an in-memory repository and Mock dialogue.
- `tests/post-decision.test.ts`: backend/content/projection/privacy tests.
- `tests/post-decision.ui.test.tsx`: Result rendering and navigation tests.
- `scripts/verify-post-decision-browser.mjs`: repeatable local production-browser verification.
- This document records implementation boundaries and verification.

## Data model and immutable binding

Authored content contains an opaque content ID, content version, reviewed date, exact template tuple,
checkpoint alternatives, conditional tutorial blocks, exact recovery definitions, and official sources.
The registry is recursively frozen. Bindings select by **templateId + templateVersion + variant**;
there is no latest-version substitution. No published template or persisted result is edited.

Static validation checks template/version/variant compatibility, complete choice coverage, checkpoint IDs,
state/signal compatibility, exact critical rule/event/incident pairing, and reviewed official sources.
Invalid authored mappings fail validation; historical sessions without a mapping retain their existing Result.

The optional public DTO contains:

```text
postDecisionGuidance
  contentRef, contentVersion, reviewedAt
  checkpoints[]
    ruleRef, label, existing assessment, existing explanation
    selectedAction | null, saferAlternative
  tutorial[]
    opaque ref, title, explanation
    independentVerification[], commonMistakes[], nextTimePrevention[]
  recovery[]
    incidentType, confirmedAction
    immediateActions[], evidenceToPreserve[], officialHelp[]
    accountRecoverySteps[], nextTimePrevention[], retryRecommendation
    sources[] with reviewed dates
  nextTimePrevention[]
```

Public content does not include internal trigger definitions, rule configuration, fingerprints,
hidden story-selection data, raw rows, provider bodies, or actual OTP/password values.
The UI imports the public DTO schema/types, not authored fixtures or application/domain modules.

## Read-only projection and tutorial filtering

The existing authenticated ownership/result path remains in force. The enrichment receives the existing
session, pinned template and result snapshot. It does not call a repository or write any state.
The existing assessment/explanation is reused; selected-action labels come from the finalized explicit
action or exact confirmed critical action, never from AI intent or dialogue wording.

A tutorial block is included only when its authored state/signal has a committed receipt for the pinned
version, within the committed session revision, plus a matching character message. The signal must be
allowed by that authored state. Uncommitted, missing-message and impossible-state evidence is excluded.
Committed authored fallback is eligible under the same rules.

| Evidence | Tutorial |
| --- | --- |
| `CONTEXT_CLAIM` + `VERIFY_CONTEXT` | Independent parcel/transaction comparison |
| `PRESSURE` + `URGENCY_PRESSURE` | Pressure to act quickly |
| `PRESSURE` + `SECRECY_PRESSURE` | Request to keep the matter secret |
| `MAIN_REQUEST` + `TRANSFER_REQUEST` | Simulated transfer request |
| `MAIN_REQUEST` + `OTP_REQUEST` | Simulated OTP request |
| `MAIN_REQUEST` + `DELIVERY_CONFIRMATION` | Appropriate delivery response |
| `MAIN_REQUEST` + `TRANSACTION_NOTIFICATION` | Appropriate acknowledgment |

There is no keyword matching. A caller's semantic signal establishes encountered material only;
it never becomes an assessment or incident trigger. Learner-facing wording is “สิ่งที่ปรากฏในสายนี้”.
An early exit does not reveal unseen pressure or final requests. Normal stories get neutral content.

## Recovery trigger matrix

| Binding | Exact rule | Exact event | Public incident type |
| --- | --- | --- | --- |
| CC-01 v6 SCAM_CALL | `CONFIRM_SIMULATED_TRANSFER` | `CONFIRM_UNVERIFIED_TRANSFER` | `MONEY_TRANSFERRED` |
| CC-02 v6 SCAM_CALL | `SHARE_SIMULATED_OTP` | `DISCLOSE_OTP` | `OTP_OR_CREDENTIAL_DISCLOSED` (OTP only) |
| CC-N01 / CC-N02 | None | None | No recovery |

An incident additionally requires a matching backend-validated critical event in the existing result's
critical event references and a linked ACCEPTED, explicitly confirmed SIMULATED_ACTION for the same
session, rule, opportunity and state. A completed session's fresh-confirmation guards are not rerun.
Outcome alone cannot trigger or suppress independently confirmed harm.

Free text, AI candidates/confidence, `trust`, opening apps, viewing details/OTP, and preparing a
confirmation do not trigger recovery. No app-installation, remote-control, password-compromise or
identity-document incident is introduced.

Transfer guidance covers stopping further transfers/contact, contacting the originating bank or
AOC 1441 promptly, preserving transaction/contact evidence and following the bank's investigation.
It does not automatically advise a device reset or password change from a transfer alone.

OTP guidance covers ending disclosure/contact, notifying the account-owning institution through an
independently obtained channel, preserving context and having the provider investigate/block/recover
based on findings. It does not assert definite account takeover or financial loss.

Neither guide guarantees returned funds, invents legal deadlines, or says simulated damage is real.
The recovery heading is “ถ้าเหตุการณ์ลักษณะนี้เกิดขึ้นจริง”.

## Result UI

The existing visual system is reused, grouping content into result summary, encountered decisions,
tutorial, conditional recovery and next-time prevention rather than eight repetitive cards.

| Outcome | UI behavior |
| --- | --- |
| PASSED | Celebrate the encountered safe path and teach prevention without victim wording |
| NEEDS_PRACTICE | Explain encountered REVIEW decisions and alternatives; REVIEW alone has no recovery |
| CRITICAL_FAILURE | Name the exact confirmed simulated action and show only its matching recovery |
| UNASSESSED | Explain insufficient assessment, without unseen checkpoints or a claim of being scammed |
| ABANDONED / EXPIRED | Preserve the existing no-official-result behavior |
| No guidance mapping | Original Result view and DTO behavior |

Navigation offers “ลองฝึก Call Center อีกครั้ง”, “ทบทวนบทเรียน” and “กลับหน้าเลือกสถานการณ์”.
Retry uses the existing preparation route and safety acknowledgment; Backend still chooses the story.
Tutorial navigation stays on the page, focuses the tutorial region and uses Next.js navigation so
history remains coherent. It does not point to the planned knowledge library or create lesson progress.

## Official sources and review date

Reviewed **2026-10-25** using current official source material:

- [Bank of Thailand: financial fraud and response](https://www.bot.or.th/th/research-and-publications/articles-and-publications/bot-magazine-issues/phrasiam-69-1/Financial-fraud-in-the-age-of-AI.html)
- [Bank of Thailand: online banking fraud and OTP](https://www.bot.or.th/th/satang-story/fraud/online-fraud.html)
- [MDES: AOC 1441 service and reporting process](https://mdes.go.th/mission/153/)
- [Thai Police Online official reporting route](https://www.thaipoliceonline.go.th/)

BOT material was available via indexed official-source content; direct fetches timed out during this
review. The AOC page was read directly. The Police route serves a JavaScript application, with its
reporting role corroborated by MDES material. No claim is made that a report was submitted or a live
assistance service was contacted. The BANK help link is BOT guidance, not an institution-specific hotline.

Metadata is stored with authored content/recovery, and no AI chooses or generates these instructions.

## Verification

| Gate | Result |
| --- | --- |
| Focused feature tests | 59 passed: 49 backend/content and 10 UI |
| Full offline regression | 1,091 passed / 69 skipped with `npm test -- --maxWorkers=2` |
| Existing frontend suite | 109 passed |
| Prisma generate / validate | Passed; no schema change |
| TypeScript | Passed |
| Production build | Passed |
| Client audit | Passed, 68 JavaScript artifacts |
| Private learning-marker client scan | Passed; no registry/critical-rule configuration in client artifacts |
| Browser | 27/27 passed at 375/768/1440px; zero browser errors and horizontal overflow |
| Diff whitespace / scope | Passed; frozen runtime files and 27 pre-existing README/docs edits unchanged |

Default worker-count regression encountered the existing Git-history ordering test's five-second
timeout on some runs. The full suite passed with two workers without changing assertions, timeouts,
test files for persistence, or runtime semantics.

Run the focused tests:

```text
npx vitest run tests/post-decision.test.ts tests/post-decision.ui.test.tsx
```

Run browser verification against a production Next server:

```text
npm run build
npm run start:http -- --port 3228
node scripts/verify-post-decision-browser.mjs http://127.0.0.1:3228
```

The browser harness uses real application/Core-generated sessions/results, in-memory persistence,
Mock dialogue and synthetic authenticated API interception. It verifies production React rendering,
public response consumption, keyboard focus, tutorial/retry/list navigation and widths 375/768/1440px.
It is not evidence of live authentication, PostgreSQL, Qwen/Groq or speech-provider operation.
The no-guidance browser case explicitly uses the legacy optional-field DTO shape; backend tests
separately play actual pinned historical v3/v4/v5 sessions to completion.

Browser verification also caught and resolved a tutorial-anchor/history issue: tutorial navigation
now uses Next.js Link with explicit focus management. Keyboard activation, focused tutorial target,
retry navigation, browser Back to the Result, and scenario-list navigation all pass. Assertions were
retained while fixing the interaction, rather than dropping the history/focus checks.

Local browser evidence: `frontend-artifacts/post-decision/verification.json` and adjacent screenshots
(ignored generated artifacts, not committed). The harness stops at the first failure.

## Limits and preserved boundaries

- Only these four current runtime stories receive new content.
- Historical versions without mappings use the old Result view; no content is retroactively substituted.
- No full knowledge-base/CMS, learning-completion tracking or exact-story retry endpoint is added.
- Signals are existing backend-validated structured evidence, not proof that the learner independently identified a warning.
- Official guidance needs periodic human review; it is static authored content, not an emergency-service integration.
- Live providers, dedicated live database tests and production deployment are outside this phase.
- Core, evaluator, critical rules, published templates, persistence, schemas/migrations, ownership/expiry,
  CAS/revision, transactions, replay/rollback, provider, speech, protocol and the other categories are unchanged.
- Pre-existing unrelated README/docs edits are preserved.

Completion: **CALL_CENTER_POST_DECISION_GUIDANCE_COMPLETE**. No commit, push or deployment was performed.
