# Auth.js integration boundary

STATUS: BOUNDARY IMPLEMENTED; REAL LOGIN DISABLED — AUTH PROVIDER DECISION REQUIRED

## Source check and decision gate

Proposal v4 was checked read-only on 17 September 2026. Its **Auth.js, bcrypt and Zod**
section explicitly describes password hashing and server-side password/hash comparison
before creating a session, with email/password input validation. Therefore it would be
incorrect to claim that the Proposal defines no login method at all.

The repository currently has no user/account store, password verifier or approved
identity-ID mapping. The current phase prohibits adding a custom password database,
registration system or auth migrations without review. There is no approved OAuth provider.

**Identity Provider configuration: NOT SELECTED / REQUIRES DECISION.**
The Proposal's password-based direction is recorded, not replaced with an invented OAuth
choice. Auth.js Credentials is a potential implementation of that direction, but no
Credentials provider is enabled here. No demo account, hardcoded user, password comparison,
account provisioning, login UI or `/api/auth/[...nextauth]` routes were added.

Decision needed: approve the actual account verifier/store and stable identity mapping
before enabling real login. If a local account store is chosen, it needs a separately
reviewed account entity (immutable ID, login identifier and password hash), migration,
credential lifecycle, access policy and retention plan. JWT avoids a session table; it
does **not** remove the need for a trustworthy account/password verifier. No training
Prisma schema or migration changed in this phase.

## Implemented flow

```text
Next server request context
  → Auth.js auth() [gated: no configured provider, so not initialized]
  → AuthJsRequestAuthenticator (trusted session resolver)
  → AuthenticatedPrincipal { id }
  → TrainingApplicationService → TrainingCore ownerId
```

`src/auth/authjs.ts` contains the prepared NextAuth v5 configuration and lazy `auth()`
resolver. The empty private provider list and missing `AUTH_SECRET` each fail closed.
Setting a secret alone cannot enable authentication. There is no environment switch
that installs a test identity resolver. Auth routes remain absent until configuration
and the identity source have been reviewed.

The authenticator accepts only a server-verified, nonexpired session with an opaque
account UUID at `session.user.id`, and returns a fresh `{ id }`. UUID syntax is an
implementation boundary contract, not a Proposal requirement or proof of identity.
Only the trusted resolver supplies identity; request headers/body/query/unsigned cookies
are never interpreted as a principal. Missing/malformed/expired sessions and resolver
exceptions return null, mapped by the training handler to fixed `401 UNAUTHENTICATED`.
No raw auth exceptions are logged or returned.

Auth runs before lazy application/Prisma initialization. One pool/application per worker,
failed-initialization cleanup/retry and explicit close are unchanged in `src/server/runtime.ts`.

## Prepared session strategy and ID source

Prepared strategy: **JWT**, using supported `jwt` and `session` callbacks; no auth DB adapter.
This is the simpler boundary preparation allowed by the phase, not a claim of a working
credential system. Reassess it if the approved identity requirements require database
sessions or immediate revocation.

At a future verified sign-in, the approved account verifier must return the same immutable
account UUID as `user.id` on every login. The callback copies it into `token.trainingUserId`,
then the session callback exposes only `{ user: { id }, expires }`. It does not generate
a fresh owner ID at sign-in and does not fall back to email, display name, mutable username,
profile fields or `token.sub`. The backing account-ID source is still unresolved.

JWT update data supplied by a client is ignored. Missing/invalid IDs invalidate the token;
subsequent JWT calls preserve only the verified ID claim, with standard token timestamps
managed by Auth.js. Provider access/refresh tokens, profile, email and name are not copied
into this policy's token/session or passed to Application/Core. Training responses contain
no identity fields. Tests assert both input and response minimization.

JWT revocation/rotation, cookie deployment configuration, real login/logout, account
deletion and cross-device behavior have not been verified. `auth()` uses Next's current
request context; mock tests do not prove a live cookie/OAuth/password flow. Future auth
handlers must use Auth.js built-in security, without disabling CSRF or trusting proxy/host
headers indiscriminately. Training POST origin checks remain unchanged.

## Package and compatibility

Pinned `next-auth@5.0.0-beta.32` (transitive `@auth/core@0.41.3`) in package.json/lockfile.
The official installation guide currently documents the v5 beta and the `NextAuth` →
`auth`/`handlers` pattern. This is explicitly a **prerelease**, not v4's latest stable tag.
No `getServerSession` or deprecated middleware API was introduced.

Package peer metadata includes Next ^16 and React ^19, covering this repository's
Next 16.3.5 and React/React DOM 19.3.0. Node 24.19.0 and TypeScript 7.0.2 were checked
locally with strict project typechecking/tests/build; neither is claimed as an upstream
certification. Existing `skipLibCheck` remains unchanged. No peer-dependency override,
framework downgrade or insecure compatibility flag was needed.

Official references checked for this phase:

- [Installation / current Next.js configuration](https://authjs.dev/getting-started/installation)
- [Next.js API: auth() and handlers](https://authjs.dev/reference/nextjs)
- [JWT/session identity callbacks](https://authjs.dev/guides/extending-the-session)
- [JWT versus database sessions and limitations](https://authjs.dev/concepts/session-strategies)
- [Credentials and responsibility for account/password verification](https://authjs.dev/getting-started/authentication/credentials)

## Environment and verification limits

- `AUTH_SECRET`: private random secret supplied only through deployment environment when
  a provider is approved; never committed, generated in source or used as a default value.
- Provider-specific credentials/variables: **not defined**, pending the provider decision.
- Existing database/TLS/RSA environment variables: unchanged; see [API](api.md).
- No real OAuth secret is needed by automated tests; test markers are generated at runtime.

Boundary tests inject a server-side session resolver in the test process. They cover no
session, malformed/expired session, invalid/missing stable ID, identity spoofing, owner
isolation on five session endpoints, no initialization on auth failure, token minimization,
safe errors, callback identity preservation and the unresolved-provider gate.
Existing HTTP/Core/Dialogue/MySQL tests remain the regression suite. This does not claim
production authentication readiness. Frontend, Live AI and Voice/WebSocket remain unstarted.
