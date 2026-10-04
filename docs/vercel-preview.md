# Minimal Vercel Preview

## UI/runtime integration — 2026-10-04

The proposal UI refresh is integrated with the rule-based runtime. The catalog now leads to details and a required safety acknowledgment before calling the unchanged start API. Both communication-mode badges retain the runtime wording. The categorical result, session revisions, idempotent actions, authentication, TLS requirements, Groq request compatibility and immutable historical templates are preserved.

`vercel.json` explicitly selects Next.js with `npm ci` and `npm run build`; do not serve the custom WebSocket process or a static output directory in this Preview. Private PEM formatting was corrected without replacing the certificate or disabling verification. A read-only connection through the runtime adapter passed and confirmed all four existing migrations are complete; no migrations or destructive DB operations were run.

Fresh install, Prisma generate/validate, typecheck, production build and client audit passed. Full suite: 681 passed / 49 skipped; frontend: 94; auth: 81; AI: 68. Live Groq synthetic verification passed with strict output and no fallback. Dedicated MySQL/E2E suites were not run because a dedicated test database is not configured.

Local production UI verification passed with 72 screenshots and seven flow groups at 375/768/1440px, using `node --import tsx scripts/verify-ui.mjs`. This script mocks transport/auth and does not establish deployed end-to-end readiness. The initial deployment/Preview smoke check is performed after the verified merge is pushed; READY alone is not an acceptance result.

The following preparation notes include historical results from before this integration.

Scope: register → login → scenario list → Call Center text conversation with Groq → explicit training actions → result. SMS / Phishing also supports the same Groq text provider. This does not implement the 21-story storyboard or Evidence Popup, and does not deploy Voice, Azure or WebSocket infrastructure.

## Build and database prerequisites

Use the Vercel Next.js framework preset, install with `npm ci` (including development dependencies), and build with `npm run build`. Do not configure the custom WebSocket server as the Vercel entry point. Next.js Route Handlers serve the text flow.

`postinstall` runs `prisma generate`; the build runs it again before Next.js compilation to cover cached installs. `src/generated/prisma` remains ignored and must not be committed. Generation does not connect to or migrate the database. Do not disable lifecycle scripts or omit the Prisma development dependency during the build.

Register/login requires a reachable **migrated MySQL database**, not only an authentication secret. Apply the checked-in migrations (persistence, user accounts, decision rules and quiz) using an appropriately secured migration connection before testing. `npm run db:deploy` is an explicit administrator operation; it is not part of install/build. The runtime CA setting below configures the MariaDB adapter, not Prisma CLI migration TLS. Configure the CLI connection according to the database provider's trusted-CA requirements; do not disable certificate verification. No database has been provisioned or migrated by this task.

## Private Preview environment

Environment variable names for the requested configuration:

```text
AI_PROVIDER
GROQ_API_KEY
GROQ_MODEL
DATABASE_URL
DATABASE_TLS_CA
AUTH_SECRET
AUTH_URL
CALL_CENTER_DEMO_VARIANT
```

Select the Groq provider and the approved Groq model in private server configuration. OpenAI and Azure variables are not required for text chat. Never use a `NEXT_PUBLIC_` prefix for these settings.

`DATABASE_TLS_CA` accepts actual multiline PEM certificate content. Do not substitute literal backslash-n sequences for newlines. A nonempty inline CA takes priority over `DATABASE_TLS_CA_PATH`; the path is used only when inline content is absent/empty. Remote database connections without a trusted CA fail closed. Certificate verification remains enabled; no URL, certificate or password is logged by this configuration path. An incorrect CA will fail the actual TLS handshake, not silently downgrade security.

`AUTH_URL` must match the actual HTTPS Preview origin used in the browser. Auth.js recognizes the Vercel environment (and the configured auth URL); this flow does not require an additional authentication bypass or owner header. Use a stable Preview URL when configuring the origin and keep `AUTH_SECRET` stable across deployments that should share sessions.

`CALL_CENTER_DEMO_VARIANT` is optional. The server accepts only `SCAM_CALL` or `NORMAL_CALL`; absence preserves cryptographically secure random 50/50 selection. Invalid configuration fails without echoing the value. This selects **new** sessions, not existing/idempotent starts, and is never a browser selection or AI decision. Use it only for an intentional demo, not as evidence that balanced random allocation was used.

## Compatibility and historical templates

The Groq adapter removes the `store` property entirely from the serialized Responses request. The OpenAI adapter still sends `store: false`. Both retain the shared response schema, cancellation and backend validation boundaries. Regression tests inspect the body emitted through the actual SDK with a mocked HTTP transport; they do not establish that private Groq credentials, quota or the selected model are available.

New Call Center sessions use version 2 with neutral text/voice wording. Published version 1 configurations remain registered unchanged for resume and immutability; historical source text is not rewritten. Scenario list badges distinguish text-only from text-or-voice capability. Existing voice code is preserved, but voice is **outside this Vercel Preview verification** and not enabled by the private settings above.

## Verification scope

The clean-build check uses a fresh source-only directory without `.env.local`, `.next`, `node_modules` or generated Prisma files initially, followed by `npm ci`, explicit Prisma generation, typecheck, tests and production build. This checks source/build independence from local generated files; it is a local Windows check, not an actual Vercel Linux deployment.

Automated regressions cover inline/path CA priority, secure CA requirements, backend variant selection, communication badges, Groq request serialization, and Call Center plus SMS chat/actions/result with in-memory persistence and mocked Groq HTTP responses. Existing account/auth tests remain part of the suite. MySQL integration tests require the dedicated test database and may be skipped when it is absent.

Before claiming an end-to-end Preview is verified, supply private credentials, apply migrations over trusted TLS, confirm database network access from Vercel, configure the correct Preview auth origin, and smoke-test registration/login and both scenarios against real MySQL/Groq. Verify that the character response is real provider output rather than the safe fallback. No deployment, live Groq request or paid infrastructure creation is performed by this preparation task.

### Local preparation result — 2026-10-03

- Fresh `npm ci`: passed; install hook generated Prisma without a committed client.
- `npm run prisma:generate`: passed.
- `npm run typecheck`: passed.
- `npm test`: 667 passed, 49 skipped (38 passing test files, four skipped files).
- `npm run build`: passed, including generation, compilation, type validation and route output.
- `npm run audit:client`: passed; 52 JavaScript artifacts checked for server dependency/secret markers.
- Groq body regression: passed; no `store` property. OpenAI storage setting remains unchanged.
- Call Center and SMS Groq chat → explicit actions → passed result: passed with mocked transport and in-memory persistence.

The clean source snapshot was used because the main checkout contained stale generated Next.js route types from a different UI branch. No cache or generated artifact is included in the commit. Private Groq, database and auth configuration was absent locally; actual MySQL/Groq and Vercel deployment verification remain pending.
