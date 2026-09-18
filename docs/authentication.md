# User accounts and Credentials authentication

STATUS: IMPLEMENTED FOR DEMO — NOT PRODUCTION IDENTITY READINESS

## Source versus implementation choice

Proposal v4 was rechecked read-only on 18 September 2026. Its Backend/MySQL and
Auth.js, bcrypt, Zod sections require signup/login APIs, MySQL user data, password
hashing before storage, email/password validation, server-side hash comparison,
and Auth.js Session/Cookie management. Signup precedes login/main-system access.

The user approved a local email/password account store and Auth.js Credentials for
this phase. The earlier provider gate is resolved; no OAuth was selected.
Credentials implements the Proposal's password direction; the exact provider
configuration and numeric policies are technical choices, not Proposal requirements.

Demo assumptions: server UUID v4; email trim + lowercase, Zod format, max 254 characters;
password min 12 Unicode code points, max 72 UTF-8 bytes, no trimming/character-class rules;
bcrypt cost 12; 2 KiB registration body; id-only success response; JWT strategy.

## Implemented flow and boundaries

Registration: strict HTTP JSON → AccountService → PasswordHasher → AccountRepository
→ PrismaAccountRepository → UserAccount in MySQL. Service owns validation, normalization
and UUID generation. DB unique email constraint resolves concurrent duplicates.
Registration does not sign the user in.

Login: official Auth.js handlers → Credentials authorize → AccountService.verifyCredentials
→ repository lookup + bcrypt compare → verified { id }.

Stable identity:
UserAccount.id → user.id → token.trainingUserId → session.user.id
→ AuthJsRequestAuthenticator → AuthenticatedPrincipal.id → TrainingCore ownerId.

UUID is generated once at registration, never per login. Email is never ownerId.
Core/Domain do not know email/password/bcrypt/login/cookies/JWT. Account ports/service
do not import Prisma, HTTP, Auth.js or Training rules. Hasher and Prisma repository
are injected outer adapters; architecture tests enforce the boundaries.

Shared lazy Prisma pool per worker: src/server/database.ts. Training/account runtimes
compose independent services. AccountService caches a generated dummy hash per service,
not accounts/passwords; Training does not cache aggregates. Failed Training initialization
closes its pool and can retry; account runtime detects a new pool. Production graceful
shutdown infrastructure is not added.

## Account schema and storage

UserAccount contains only id (CHAR(36) PK), normalized email (VARCHAR(254), unique),
passwordHash (CHAR(60)), createdAt, updatedAt. Additive migration adds this table and
a trigger rejecting ID updates. No account update/delete service exists in this phase.
Timestamps are server/DB owned. Repository accepts only cost-12 bcrypt hashes;
plaintext/reversible-encryption columns are absent. Hashes remain private persistence data.

No FK from TrainingSession.ownerId to UserAccount: historical opaque owners remain valid.
No Training migration/data/Core ownership changes. No Auth.js Prisma adapter,
OAuth Account, Session or VerificationToken tables.

## Registration API

POST /api/auth/register accepts only JSON { email, password }. Unknown fields (including
id/ownerId/passwordHash/role/provider/createdAt) and query parameters are rejected.
Limit 2,048 bytes checks both declared length and actual stream; compressed bodies unsupported.
Cross-origin POST with Origin is rejected.

201: { data: { user: { id } } }, without email/hash/timestamps/token/cookie.
Fixed errors: 400 INVALID_REQUEST; 409 ACCOUNT_ALREADY_EXISTS; 413 PAYLOAD_TOO_LARGE;
500 INTERNAL_ERROR; existing origin policy additionally returns 403 INVALID_ORIGIN.
Duplicate registration intentionally reveals account existence under this demo contract;
this remains an enumeration limitation and no rate limiter exists.

## Auth.js protocol, session and failures

GET/POST /api/auth/[...nextauth] delegate to official v5 handlers, fulfilling the Proposal's
login API. No custom /api/auth/login. Registration envelopes do not alter Auth.js responses.

Client uses supported CSRF flow: GET /api/auth/csrf, then POST /api/auth/callback/credentials
with token/cookie. Signout uses GET /api/auth/csrf and POST /api/auth/signout.
Built-in CSRF is not disabled. Live smoke follows the installed next-auth client's
URL-encoded flow including X-Auth-Return-Redirect; no test login endpoint exists.

Credentials passes only validated email/password to AccountService; protocol extras
cannot become identity. authorize returns { id } or null. Incorrect password, unknown
account, malformed credentials and verifier errors fail generically via CredentialsSignin.
Valid-shaped unknown credentials still compare against a random dummy bcrypt hash at
the same cost as real accounts; no random delay. This reduces obvious timing differences,
but does not prove constant time or protection against enumeration/distributed abuse.

JWT retains verified trainingUserId plus Auth.js standard metadata.
Session exposes { user: { id }, expires }. Client update cannot replace identity.
Passwords/hashes/email/provider tokens never enter sessions or Training DTOs.
Missing/malformed/expired/invalid-ID sessions and resolver errors yield 401 before
Training initialization. Headers/body/query/unsigned cookies cannot impersonate users.

Logout clears the current browser's cookie. No server-side JWT revocation list exists:
a copied valid token may remain usable until expiry. Immediate/all-device revocation,
account lifecycle/recovery and production cookie/deployment review remain future work.

## Environment and compatibility

- AUTH_SECRET: private random secret, required; no default or committed value.
  Missing/blank secret fails closed for session resolution and Auth.js handlers.
- AUTH_URL: privately configured trusted canonical origin. Smoke uses its temporary
  loopback origin; do not trust arbitrary forwarded hosts or disable CSRF.
- DATABASE_URL / DATABASE_TLS_CA_PATH / DATABASE_LOOPBACK_RSA_PUBLIC_KEY_PATH:
  existing shared DB settings; TLS/certificate/RSA protections unchanged.
- MYSQL_TEST_DATABASE_URL / MYSQL_TEST_RSA_PUBLIC_KEY_PATH: dedicated test DB only.

next-auth 5.0.0-beta.32 / @auth/core 0.41.3 remains a prerelease. Next 16.3.5, React 19.3.0,
Prisma 7.10.0 are unchanged. Native bcrypt 6.0.0 and @types/bcrypt 6.0.0 are the only new
direct packages. Production and real cryptographic tests use cost 12.
bcrypt upstream supports Node >=18 and Windows prebuilds. Node 24.19.0 native hash/compare
and Next Node-runtime build/live execution are checked locally, not upstream certification.
bcrypt is externalized in the Next server build. If a platform has no matching prebuild,
review native install/build prerequisites; do not silently switch hash implementation.

Official references checked 18 September 2026:

- [Auth.js Credentials](https://authjs.dev/getting-started/authentication/credentials)
- [NextAuth auth/handlers API](https://authjs.dev/reference/nextjs)
- [Deployment and secrets](https://authjs.dev/getting-started/deployment)
- [bcrypt compatibility, cost and 72-byte limit](https://github.com/kelektiv/node.bcrypt.js)

## Verification and limitations

Unit tests inject a test-only hasher when cryptography is not under test. Native-bcrypt/
MySQL tests use actual cost 12. Multi-compare native/new-client tests have a 15-second test
budget; production cost and DB timeouts are unchanged.
Tests cover registration, normalization, duplicates/races, dummy verification, stable/
minimal identity, byte limits, exact password whitespace, persistence and immutable ID.

npm run test:auth:live requires a built app and dedicated loopback test database.
It starts real Next with temporary port/secret and generated credentials, testing actual
CSRF/cookies, two-account isolation on resume/message/action/quit/result, stored UUID,
session-update rejection, safe D/W/S completion, logout→401 and repeat-login identity.
No mock authenticator; no private values/child logs printed; synthetic rows remain.
No reset or deletion of existing data.

Verified 18 September 2026: full regression 290/290 (no skips), HTTP 128/128,
Auth 81/81, MySQL 28/28; Prisma generate/validate/deploy, typecheck and Next build passed.
Real loopback smoke also rejects invalid CSRF; it uses canonical localhost origin
because NextURL normalizes loopback IPs. No origin/CSRF safeguard was weakened.
Dependency audits (all and production-only) reported zero known advisories on this date.
Secret audit of the phase changes found identifiers/generated test values only, no
committed account credentials, AUTH_SECRET, private keys or real database connection URL.

Demo Credentials Authentication ≠ production identity readiness.
Absent: email verification, password reset/change, compromised-password detection,
recovery, MFA, CAPTCHA, production rate-limit/abuse infrastructure, account deletion/
profile/RBAC, deployment security review and verified external TLS.
Do not expose this demo as unprotected production identity infrastructure.
Frontend, OAuth, Live AI, Voice and WebSocket remain unimplemented.
