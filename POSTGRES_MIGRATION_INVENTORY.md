# PostgreSQL migration preflight inventory

**Snapshot date:** 2026-10-22. Read-only inventory of the current repository state for the Phase 2A migration preflight. No environment values were opened, no database connection or migration was run, and no source code was changed. This records existing behavior; it does not select a target schema design.

## Current Prisma/database wiring

- `prisma/schema.prisma`: Prisma Client generator outputs to `src/generated/prisma`; datasource provider is `mysql`. Models use application-supplied string ids; no auto-increment columns or enum database types are present.
- `prisma/migrations/migration_lock.toml`: `provider = "mysql"`. Migration history consists of four tracked migration directories listed below.
- `package.json`: Prisma CLI and `@prisma/client` 7.10.0; `@prisma/adapter-mariadb` 7.10.0 and `mariadb` 3.5.4. There is no PostgreSQL adapter dependency in the current package manifest.
- `prisma.config.ts`: points Prisma CLI at `DATABASE_URL`, falling back to a dummy local MySQL URL when unset. The config does not import dotenv. `db:deploy` runs `prisma migrate deploy`; `prisma:generate`, `prisma:validate`, `build`, and `postinstall` also invoke Prisma operations.
- Runtime database composition is `src/server/database.ts` → `src/persistence/prisma-client.ts`. `DATABASE_URL` is required. TLS CA comes from inline `DATABASE_TLS_CA` or `DATABASE_TLS_CA_PATH`; remote connections require that CA with certificate verification enabled (`rejectUnauthorized: true`). `DATABASE_LOOPBACK_RSA_PUBLIC_KEY_PATH` is limited to loopback. The helper only accepts `mysql:` URLs, rejects URL query/hash options, sets pool limit 8, connect timeout 10 seconds, acquire timeout 15 seconds, and timezone `Z`.
- The current runtime entry (`scripts/serve.mjs`, `src/server/serve.ts`) is a custom Node HTTP/WebSocket server. `vercel.json` declares the Next.js framework, so the production execution shape should be confirmed before choosing PostgreSQL runtime pool settings.

## Existing migration objects

### Primary keys, unique constraints, and secondary indexes

| Table | Primary key | Unique constraints / indexes | Secondary indexes |
| --- | --- | --- | --- |
| `Scenario` | `id` | — | — |
| `ScenarioTemplateVersion` | (`templateId`, `version`, `variant`) | — | — |
| `TrainingSession` | `id` | — | (`ownerId`, `status`) |
| `TrainingAction` | (`sessionId`, `id`) | (`sessionId`, `revision`) | — |
| `SessionOpportunity` | (`sessionId`, `definitionId`) | — | — |
| `TrainingEvent` | (`sessionId`, `id`) | — | — |
| `DialogueTurnReceipt` | (`sessionId`, `id`) | (`sessionId`, `actionId`) | — |
| `TrainingMessage` | (`sessionId`, `id`) | (`sessionId`, `turnId`, `role`) | — |
| `TrainingResult` | `sessionId` | — | — |
| `UserAccount` | `id` (`CHAR(36)`) | `email` | — |
| `QuizAttempt` | `id` | — | (`ownerId`, `startedAt`, `id`); (`ownerId`, `mode`, `bankVersion`, `blueprint`, `completedAt`) |
| `QuizReceipt` | (`attemptId`, `requestId`) | (`attemptId`, `revision`) | — |

Migration names/order: `202609130001_persistence`, `202609180001_add_user_accounts`, `202609250001_decision_rules`, `202609260001_quiz`. The decision-rules migration adds nullable `SessionOpportunity.assessment`, plus `TrainingResult.evaluationMode NOT NULL DEFAULT 'LEGACY_WEIGHTED_V1'` and nullable JSON `decisionSummary`.

### Foreign keys and delete/update actions

- `ScenarioTemplateVersion.templateId` → `Scenario.id`: RESTRICT / RESTRICT.
- `TrainingSession(templateId, templateVersion, variant)` → `ScenarioTemplateVersion(templateId, version, variant)`: RESTRICT / RESTRICT.
- `TrainingAction.sessionId` → `TrainingSession.id`: CASCADE / CASCADE.
- `SessionOpportunity.sessionId` → `TrainingSession.id`: CASCADE / CASCADE; nullable (`sessionId`, `finalizedByActionId`) → `TrainingAction(sessionId, id)`: RESTRICT / RESTRICT.
- `TrainingEvent.sessionId` → `TrainingSession.id`: CASCADE / CASCADE; (`sessionId`, `actionId`) → `TrainingAction(sessionId, id)`: RESTRICT / RESTRICT; (`sessionId`, `opportunityId`) → `SessionOpportunity(sessionId, definitionId)`: RESTRICT / RESTRICT.
- `DialogueTurnReceipt.sessionId` → `TrainingSession.id`: CASCADE / CASCADE; (`sessionId`, `actionId`) → `TrainingAction(sessionId, id)`: RESTRICT / RESTRICT.
- `TrainingMessage.sessionId` → `TrainingSession.id`: CASCADE / CASCADE; (`sessionId`, `turnId`) → `DialogueTurnReceipt(sessionId, id)`: RESTRICT / RESTRICT.
- `TrainingResult.sessionId` → `TrainingSession.id`: CASCADE / CASCADE.
- `QuizReceipt.attemptId` → `QuizAttempt.id`: CASCADE / CASCADE.
- There is deliberately no FK from `TrainingSession.ownerId` or `QuizAttempt.ownerId` to `UserAccount`; the account migration comment preserves historical opaque owner IDs.

### Checks and triggers

- No SQL `CHECK` constraints appear in the four tracked migrations. Validation of status/state/value combinations is therefore in application/domain code unless added separately in the target.
- `202609130001_persistence` installs `published_template_no_update` and `published_template_no_delete` triggers on `ScenarioTemplateVersion`; both raise SQLSTATE `45000` with `PUBLISHED_TEMPLATE_IMMUTABLE`.
- `202609180001_add_user_accounts` installs `UserAccount_id_immutable`; it rejects direct `id` changes with SQLSTATE `45000` / `ACCOUNT_ID_IMMUTABLE`.
- These triggers are not represented in `schema.prisma`; preserve their direct-database enforcement intentionally when translating to PostgreSQL (including trigger timing/error mapping and migration rollback).

## Data-type and behavioral hazards for PostgreSQL

- **Collation:** The first persistence migration and account migration set tables to `utf8mb4_0900_bin`; quiz tables use `utf8mb4_unicode_ci`. These are not one uniform comparison policy. Binary collation, Unicode case/accent-insensitive comparison, and MySQL NO PAD behavior can affect equality, sort, and uniqueness. In particular, `UserAccount.email` uniqueness is exercised with normalized uppercase/whitespace input by account tests; confirm application normalization and the target index collation preserve concurrent duplicate detection. Inventory string identifiers/statuses before selecting PostgreSQL database/column collations or expression indexes.
- **Timestamps:** All current SQL datetime columns are `DATETIME(3)`. They include `ScenarioTemplateVersion.publishedAt` (DB `CURRENT_TIMESTAMP(3)` default); session start/activity/end; action/event/message times; opportunity open/finalize times; result calculation; account create/update; quiz start/completion. Account `createdAt` also defaults to DB current time; `updatedAt` is Prisma `@updatedAt` with no SQL default. `src/persistence/prisma-client.ts` configures MySQL timezone `Z`, and repository boundaries convert epoch milliseconds through JS `Date`. Schema fields do not specify PostgreSQL native time types. Preserve millisecond precision and explicitly choose a UTC/instant convention for PostgreSQL `timestamp` versus `timestamptz`, DB defaults, and session timezone; do not assume MySQL `DATETIME` carries timezone semantics.
- **JSON:** MySQL JSON fields are `ScenarioTemplateVersion.configuration`; opportunity warning/evidence id arrays; `DialogueTurnReceipt.response`; `TrainingResult.scores`, event/skill arrays, `recommendation`, optional `decisionSummary`; and quiz `snapshot`, `answers`, optional `result`. Code writes cloned values through Prisma Json types. Nullable JSON writes use `Prisma.DbNull` in repository code. PostgreSQL `jsonb` is the usual Prisma PostgreSQL mapping, but its normalization/ordering, numeric handling, operators, and SQL-NULL versus JSON-null distinctions should be checked against the app’s round-trip/canonicalization and snapshot tests. No JSON-specific raw SQL was found.
- **CAS and transaction invariants:** `PrismaTrainingRepository.save` performs `updateMany` filtered by `id` and expected `revision`, increments the revision, checks exactly one row, then writes child rows/receipts in the same explicit `ReadCommitted` transaction with 15-second timeout. Quiz commits similarly condition by attempt/owner/revision/status and create the receipt in the same transaction; quiz aggregate reads use `RepeatableRead`. Preserve row-count conflict semantics, unique constraints, receipt atomicity, and read snapshots in PostgreSQL integration tests.
- **Fixed-length chars and unique text:** `UserAccount.id`, `passwordHash`, and quiz receipt `requestId`/`fingerprint` are fixed-length `CHAR`; others are variable-length identifiers. PostgreSQL `char(n)` blank-padding/comparison and collation rules can differ. Consider whether to preserve exact fixed-char semantics or map to a different PostgreSQL native type, then test serialization and uniqueness.
- **Composite foreign keys:** Several relations use composite keys and a nullable `finalizedByActionId`. Preserve referenced/target column order, nullability, uniqueness, and the mix of CASCADE versus RESTRICT actions. Do not replace these with independent single-column FKs.
- **Triggers/checks:** Prisma schema alone does not encode the three triggers or any check constraints. Target migration generation and drift checks must account for custom SQL objects.

## Raw SQL and MySQL-specific code/test surface

- No production repository raw SQL call was found. The only raw calls located were:
  - `scripts/profile-call-runtime.mjs`: `$queryRawUnsafe("SELECT 1")` as a connection probe; query itself is dialect-neutral, but the profile uses the current MySQL adapter/environment and writes a profile JSON artifact when intentionally run.
  - `tests/accounts.mysql.test.ts`: `$queryRaw` against MySQL `information_schema.COLUMNS` with `TABLE_SCHEMA = DATABASE()`; this assertion is MySQL-specific and must be rewritten for PostgreSQL catalog metadata if retained.
- `scripts/test-auth-live.mjs` imports `mariadb` directly for live auth test setup; inspect/translate that harness during a provider switch.
- Database-focused tests are `tests/persistence.mysql.test.ts`, `tests/accounts.mysql.test.ts`, `tests/quiz.mysql.test.ts`, and `tests/call-variants.mysql.test.ts`. `tests/http.integration.test.ts` also contains live-DB paths. `tests/prisma-client.test.ts`, `tests/preview.database.test.ts`, `tests/http.runtime.test.ts`, and `tests/architecture.test.ts` encode current MySQL URL/adapter/security or dependency-boundary assumptions.
- `scripts/test-mysql.mjs` requires `MYSQL_TEST_DATABASE_URL` and runs the four `*.mysql.test.ts` suites; it errors if missing rather than silently skipping. Each real suite guards for the dedicated `mitjee_test` / `mitjee_test_<suffix>` name. Tests use `MYSQL_TEST_RSA_PUBLIC_KEY_PATH` as optional trusted loopback test-server key. `scripts/test-e2e.mjs` requires that URL to be a loopback MySQL test database and starts a production Next server for browser E2E. Other relevant commands are `test`, `test:http`, `test:auth`, `test:auth:live`, `test:e2e`, `db:deploy`, `prisma:validate`, and `prisma:generate`.

The test suites were not run for this inventory. `MYSQL_TEST_DATABASE_URL` and any TLS/key environment values were not read or logged.

## Files inspected

`prisma/schema.prisma`; `prisma/migrations/migration_lock.toml`; all four `prisma/migrations/*/migration.sql`; `prisma.config.ts`; `package.json`; `src/persistence/prisma-client.ts`; `src/server/database.ts`; `src/persistence/prisma-repository.ts`; `src/persistence/quiz-repository.ts`; `scripts/serve.mjs`; `src/server/serve.ts`; `scripts/test-mysql.mjs`; `scripts/test-e2e.mjs`; `scripts/test-auth-live.mjs`; `scripts/profile-call-runtime.mjs`; database-related tests listed above; and documentation references used only to identify environment-variable names.

Related official adapter/TLS/collation semantics and provider references are summarized in [`docs/engineering/provider-research.md`](docs/engineering/provider-research.md).
