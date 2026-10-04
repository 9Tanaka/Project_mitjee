# Proposal-aligned UI refresh

Date: 3 October 2026. Branch: `feat/proposal-ui-refresh`.
Reference: user-provided `Proposal_mitjee.pdf`, figures 7–26 (PDF pages 35–45).
The figures guide presentation, not permission to invent API fields, scores, published content or account capabilities.

## What changed

The existing Next.js App Router, React, TypeScript, Tailwind CSS and native SVG components are retained.
No runtime dependencies, backend/public API contracts, Prisma schema, Core rules, assessment formulas,
provider selection, voice transport, authentication policy or persistence behavior were changed.
The shared brand shield is retained as the existing placeholder; no third-party brand logo is used.
No live provider call, database migration, deployment, merge or push was performed for this UI task.

`src/app/design-system.css` defines shared purple/navy, light lavender and mint colors, type/spacing/radius/shadow tokens.
It follows the existing baseline stylesheet and reuses the existing semantic controls and mutation hooks.
Fonts use a local Thai-capable stack (Noto Sans Thai, Leelawadee UI, Tahoma); no external font download is required.
`src/frontend/shell.tsx` adds the workspace sidebar and mobile disclosure navigation, active page indication,
Escape/focus behavior and the existing sign-out flow. The skip-to-main link, visible focus and reduced motion remain.
Heavy chart/icon/UI frameworks were not added. Client code imports only presentation and public contracts, not Core or server services.

## Reference-to-route mapping

| Proposal figure | Route / UI | Actual capability and boundary |
|---|---|---|
| 7 | `/` | Dark gradient hero, mint CTA, clearly labeled fictional dialogue preview and navigation |
| 8–9 | `/register`, `/login` | Restyled existing Credentials forms, labels, validation, disabled/error states; no unsupported Google button |
| 10 | `/scenarios` | Nine actual API-returned scenarios; search and category filter; honest empty/no-match states |
| 11 | `/scenarios/[scenarioId]` | Existing metadata/objectives/mode; difficulty and duration are not guessed |
| 12 | `/scenarios/[scenarioId]/prepare` | Safety information and required local checkbox; invokes existing start API only after confirmation |
| 13 | `/training/[sessionId]` | Actual sanitized chat, available actions, evidence, resume/revision/retry/quit behavior retained |
| 14 | Call Center training | Actual voice phase, microphone controls and transcript; static character icon, no fake connected timer or real telephone claim |
| 15 | `/training/[sessionId]/result` | Authoritative categorical decision outcomes/reasons, with text as well as status color; historic numeric results only if supplied by API |
| 16–18 | `/quiz`, `/quiz/details/pre`, `/quiz/details/post`, `/quiz/[attemptId]` | Actual 210-question/7-category overview, 20-question rounds, save/resume/submit/review flow |
| 19–21 | `/games`, `/games/preview`, `/games/preview/result` | Empty playable catalog plus separate UI-only fictional evidence/selection and result layout; no score/game completion/persistence |
| 22–23 | `/knowledge`, `/knowledge/preview` | Empty published catalog plus one searchable UI-only reading example; not the planned 16 published lessons |
| 24 | `/dashboard` | Existing Quiz history (up to 50 rounds), latest actual score, last six completed round bars, active rounds and latest missed categories |
| 25 | `/settings` | Read-only session data, including explicit absence when email is not supplied; no fake profile/password save |
| 26 | `/faq` | Search/category filter and keyboard-operable native disclosures |

Dashboard bars are per-round Quiz percentages, not an invented overall mastery score or a claim of measured improvement.
It explicitly excludes scenario/game histories because the existing API does not provide their aggregate listing.
It does not manufacture D/W/S numbers for the new categorical evaluation mode.
Warning-sign audit detail is not synthesized when absent from the existing public result contract.

`src/frontend/demo-content.ts` is a separate, clearly labeled UI fixture source.
Game choices are ephemeral page state only; the preview has no scoring, network mutation or saved progress.
Knowledge preview is a usage-oriented article layout, not an asserted published cybersecurity lesson.
The existing nine category-level scenario templates and their progression remain unchanged;
this refresh does not register the 21 storyboard inventory cases as new runtime scenarios or expose hidden correct answers.

## Verification

The original real Auth.js + dedicated-MySQL browser suite (`e2e/training.spec.ts`) was updated to navigate
details → safety acknowledgment → start, and to use the new sidebar label. It was **not executed against MySQL** in this task.
Existing historical E2E results are not reused as proof for this refresh.

UI branch baseline checks (before integration with the latest runtime):

- `npm run typecheck`: passed.
- `npm run test:frontend`: 92 passed, including 14 new refresh tests; subset of the full suite, not additional to it.
- `npm test`: 668 passed, 49 skipped across 37 passing and 4 skipped test files; opt-in external suites remain skipped.
- `npm run build`: production webpack build passed.
- `npm run audit:client`: passed; server dependency/secret markers absent from client artifacts.
- `git diff --check`: passed.
- Lint: the repository has no lint script/configured lint command; no claim of a lint pass and no lint dependency added.

Browser evidence comes from two distinct checks:

1. Agent-browser opened the production home route on a loopback-only Next server: content/navigation present,
   no framework overlay or browser error reported.
2. `scripts/verify-ui.mjs` runs Chromium against the production-rendered UI and bridges browser API requests
   to real `TrainingApplicationService` / `QuizService` instances with in-memory repositories and Mock dialogue.
   Session identity is a **test-only browser route response**, not an application authentication bypass.
   It imports server services only in the Node verification script, never into browser application code.
   It does not prove HTTP middleware authorization, MySQL persistence, real login or live AI/Speech/WebSocket service behavior.

The final browser run passed with 72 screenshots and seven flow groups. It checks 375, 768 and 1440 px
(plus 640 px for the authentication breakpoint), no horizontal overflow, no errors on normal flows,
catalog search/reset, safety acknowledgment, mobile menu/Escape focus, multi-turn dialogue without automatic transition,
refresh/resume, a complete SMS safe path and real categorical result, Quiz answer/save/submit/results/dashboard,
FAQ/preview interactions and skip-link focus. Separate checks cover unauthenticated form display/redirect,
local password confirmation validation, loading and a synthetic 503 with user-driven successful retry.
Call Center screenshots cover idle UI only; no microphone recording or live speech call is asserted.

Evidence is ignored local output under `frontend-artifacts/ui-refresh/` (screenshots and `verification.json`).
The source PDF renders used for comparison are also ignored artifacts, not new project assets.

To repeat the UI check, first build and start a loopback Next server using a synthetic Auth secret,
Mock provider and no external credentials/database. Then run:

```powershell
node --import tsx scripts/verify-ui.mjs http://127.0.0.1:3216
```

The script accepts loopback URLs only. Its simulated API bridge exists solely in the browser test context.
Use the existing dedicated-MySQL `npm run test:e2e` workflow separately for full real-auth/persistence verification;
never substitute this UI test for that suite.

## Remaining work outside this UI task

- Implement actual investigation game content/state/assessment and published Knowledge Base before removing preview labels.
- Add an approved backend contract for aggregated scenario history if a full learning dashboard is required.
- Add profile editing/security operations only with real authenticated backend support.
- Re-run dedicated-MySQL E2E and configured live provider/speech tests in their proper environments.
- Obtain final visual/content review; no automatic merge or deployment from this branch.
