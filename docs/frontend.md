# Frontend Foundation + Authentication UI + Playable Training Flow

STATUS: IMPLEMENTED SCENARIO SIMULATION UI — nine text scenarios. Backend remains authoritative.
This phase extends baseline a114a57f10d98138c06fffdc7b92ec834a483e9e; it does not complete Proposal scope.

## Architecture and routes

Browser / React interactive components → same-origin Next HTTP API → Auth Boundary
→ Application → TrainingCore / Dialogue → Repository → MySQL.

App Router pages/layouts are Server Components by default. Auth provider/navigation,
forms, catalog, chat/actions and result fetch are small client entry points.
Server-rendered children stay Server Components inside the session provider.
Route guard is UX only; backend 401/ownership checks remain the security boundary.

| Route | Implemented behavior |
|---|---|
| / | Thai landing; honest current demo scope |
| /register | Email/password/confirmation; registration API |
| /login | Official Auth.js v5 Credentials client |
| /scenarios | Authenticated API catalog; explicit start |
| /training/[sessionId] | Resume, messages, generic actions, lifecycle/quit |
| /training/[sessionId]/result | Authoritative result and recommendation metadata |

src/public-api/contracts.ts owns the existing browser-safe Zod contracts.
src/http/dto.ts re-exports them unchanged. Account policy is likewise shared through
src/public-api/account-policy.ts and re-exported by src/accounts/policy.ts.
No backend behavior, scoring, persistence schema, critical rule or authorization policy changed.
Browser code never imports Core, Prisma, repository, internal templates/events or server auth.

## Dependencies and build

Existing Next 16.3.5 / React 19.3.0 / Auth.js 5.0.0-beta.32 are unchanged.
Pinned dev tooling added: Tailwind 4.3.3, @tailwindcss/postcss 4.3.3,
PostCSS 8.5.28, Playwright 1.63.0, Testing Library React 16.3.3, jsdom 30.1.1.
No icon/UI/chart/animation framework or external font dependency was added.
CSS uses Tailwind v4 PostCSS plus local style rules, native SVG and system Thai fonts.
TypeScript uses strict ESNext/Bundler resolution for Next's CJS/ESM packages;
webpack resolves .js source imports to .ts/.tsx. Core remains tested via Vitest.
No direct framework downgrade or security dependency change.

Official references consulted for this phase:

- [Tailwind with Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs)
- [Auth.js client API](https://authjs.dev/reference/nextjs/react)
- [Auth.js login](https://authjs.dev/getting-started/session-management/login)
- [Auth.js session](https://authjs.dev/getting-started/session-management/get-session)
- [Playwright](https://playwright.dev/docs/intro)
- [Next TypeScript](https://nextjs.org/docs/app/api-reference/config/typescript)

## Authentication UX

Registration sends only email/password; confirmation is local validation.
Existing minimum 12 Unicode code points / maximum 72 UTF-8 bytes is shared with
the backend; password whitespace is not trimmed. Submitted password fields are
cleared immediately, including validation/network failure, and never stored in
global state, storage, URL, logs or browser artifacts.

Registration does not log in: success goes to /login?registered=1 with a Thai notice.
Login uses signIn("credentials") and logout uses signOut, both from next-auth/react.
Wrong email/password has one generic message. No custom token, owner cookie or header.
SessionProvider distinguishes loading/authenticated/unauthenticated and refreshes on
window focus, not polling. Refresh retains the official session cookie.
Account UUID, cookie, JWT and email are not rendered in the authenticated shell.
The Auth.js session protocol necessarily returns its minimal verified ID; hiding it
in presentation is not a security mechanism.

## API authority, retries and concurrent tabs

Catalog comes exclusively from GET /api/scenarios. Only backend-returned playable
cards exist. Public opaque IDs are passed through, not interpreted as safe/critical.
D/W/S, total, weakest skills and outcome come exclusively from result DTO for legacy results. Version 3 displays categorical outcome and decision summary from the same backend DTO; it does not calculate a score in the browser.
UI formats numbers and maps display labels; it never computes scores or pass/fail.

Each explicit start/message/action/quit creates a UUID once and snapshots a serialized
request including expectedRevision. Start uses 0; later mutations use the current
server session revision. A synchronous lock plus disabled controls prevents double submit.

Transport errors, invalid response bodies and 5xx are uncertain: preserve the exact
attempt in component memory, block competing mutations, and offer explicit retry with
the same URL/ID/revision/payload. Do not assume abort rolls back the server.
A successful reply replaces the entire public session snapshot, even when duplicate=true.
No optimistic state, score, result, action list or chat message is created.

409 conflicts trigger refetch and a Thai notice. Nothing is resubmitted automatically
with a new revision. The user must review current controls and decide again.
401 redirects to login. Terminal 403/404/410 are not retried blindly.
Unmount/reload aborts pending reads and ignores late responses.
Attempt receipts are not persisted in browser storage: after a hard refresh, resume
loads the committed session; a new explicit start is a new attempt. Cross-tab draft
synchronization and offline durable retry are not implemented.

## Playable training and results

Messages display sanitized public history only; a local unsent draft remains on error.
Use fictional data only; the UI explicitly warns against real OTP/password/PII.
Server selects Mock/OpenAI explicitly; browser uses the same public DTO with no model/provider selector.
OpenAI adapter is implemented; real network verification NOT RUN. Footer now describes Scenario Simulation
without claiming a specific provider. No UI redesign or direct browser AI integration.

Public action inputs:

- CHOICE: one option; send choiceId.
- EVIDENCE: multiple options, including none; send selectedEvidenceIds. Backend finalizes once.
- CONFIRM: open a second confirmation step, then send confirmed:true only.
  Cancel sends nothing; there are no real OTP/password/payment inputs.
- NONE: explicit progress request; backend checkpoints/guards remain authoritative.

ACTIVE supports refresh/resume. COMPLETED/FAILED link to the result endpoint.
ABANDONED and EXPIRED have no official score; HTTP 410 displays an expiry notice.
Quit requires confirmation. Result null values stay unscored rather than becoming zero.
Recommendation type has Thai copy, reason is public API text, and key is available
under an optional reference disclosure. No fake lesson/quiz link is created.
False-positive warning-sign penalty remains outside MVP; backend audit fields unchanged.

## Accessibility and presentation

Thai-first muted teal/sage, semantic headings/forms/labels/fieldset, native radio and
checkbox, keyboard activation, visible focus, skip-to-main link, aria-live notices/chat,
disabled/loading/recovery/empty states, text outcomes independent of color.
Responsive breakpoints adapt chat/actions and score cards for mobile/tablet/desktop.
No external assets or network fonts. No claim of complete WCAG certification.
Native progress elements show returned values only; no chart library.
No polling or real-time subscription. Shared contracts are safe to bundle.

## Development and verification

Use private environment per authentication.md and persistence.md. Start with npm ci,
Prisma generation and a migrated dedicated test DB. Never commit environment values.
For local app use npm run dev, or npm run build then npm start with private AUTH_SECRET,
AUTH_URL, database configuration and explicit AI_PROVIDER=mock (or private OpenAI configuration);
origin must match the browser URL. Test launchers force mock for deterministic, no-OpenAI-cost regression.

Commands:

- npm run test:frontend — isolated API/UI tests with explicit test-only mocks.
- npm test — all Vitest tests, excluding browser E2E; DB tests skip without private test DB.
- npm run test:e2e — real production Next + Chromium + dedicated MySQL, no auth/API mocks.
- npm run audit:client — inspect generated .next/static JavaScript for server dependency/secret markers.
- Existing prisma:generate, prisma:validate, typecheck, test:http, test:auth,
  test:mysql, test:auth:live and build remain available.

Install browser once with npx playwright install chromium. test:e2e needs npm run build
and private MYSQL_TEST_DATABASE_URL plus optional MYSQL_TEST_RSA_PUBLIC_KEY_PATH.
Its launcher accepts only a loopback mitjee_test* database, starts an ephemeral server
with a generated secret and stops it afterward. Synthetic account/session rows remain;
no existing data is deleted/reset. Tests are serial. No saved authentication state.
Traces/video/automatic failure screenshots are disabled to avoid capturing credentials.
Explicit screenshots are limited to empty auth or sanitized training/result screens,
stored in ignored frontend-artifacts/. test-results/ and playwright-report/ are ignored.

E2E covers real registration/no auto-login, login/refresh, API catalog/start, two chat
turns/resume, safe actions/result, logout→401/protected redirect, simulated critical
confirmation/cancel, abandonment and real two-tab stale revision reconciliation.
UI tests additionally cover byte limits, duplicate registration, invalid login,
all action types, uncertain exact retries, double submit, expiry, hidden data,
late-abort responses, nullable scores and server-authoritative outcomes.
Architecture tests scan transitive browser imports, not just direct imports.
Artifact scan complements these checks; it is not a full secret-security certification.

## Known limitations and remaining scope

Historical Frontend verification before OpenAI adapter, 22 September 2026: Prisma generate/validate, strict typecheck and production
build passed. npm test 343/343 without skips; frontend subset 52, HTTP subset 128,
Auth subset 81, MySQL subset 28 (subsets overlap; do not add them together).
Three real Chromium E2E tests passed; existing live Auth.js smoke passed.
Client audit checked 43 JS artifacts, with transitive import architecture checks.
Visual inspection covered 375px mobile, 768px tablet and 1440px desktop; no horizontal
overflow in captured views. Keyboard skip-link focus/activation was tested in browser.
All/production npm audits reported 0 known vulnerabilities on this date.
No migration/reset/schema modification was required; test data remains synthetic.

Demo Credentials implemented. Nine text scenarios are playable; see [Scenario Catalog](scenario-catalog.md).
OpenAI text adapter is implemented; real OpenAI network verification NOT RUN.
Quiz Pre-test/Post-test is now implemented at `/quiz` and `/quiz/:attemptId`; see [Quiz](quiz.md) for current content, persistence, comparison and verification.
Voice Call Center, Profile, Review Quiz, Investigation Game, Knowledge Base and Dashboard remain unimplemented; the latest user scope limits other modes to Pre-test/Post-test.
No OAuth, reset/email verification/MFA, streaming, WebSocket, WebRTC or admin.
Current backlog unchanged: production rate limits, duplicate-registration enumeration,
privacy-safe auth telemetry, immediate JWT revocation and shared DB pool lifecycle.
Local sanitizer is not production-grade PII detection; never enter real sensitive data.
No backend security refactor was made in the original frontend phase; current phase status is in [Implementation Roadmap](implementation-roadmap.md).
