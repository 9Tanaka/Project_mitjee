# PostgreSQL preparation verification checklist

This is the Phase 2 verification contract for the Prisma/PostgreSQL preparation. For the subsequent owner-approved isolated live execution on 2026-10-24, see [the live verification report](postgres-live-verification.md), including the preserved failing attempts and final case evidence. Record each item as **PASS**, **FAIL**, **BLOCKED**, or **NOT RUN** with the exact environment scope; a mock, TypeScript check, build, or generated Prisma client cannot substitute for a database test.

## Safety preconditions

- [ ] Preserve the reviewed MySQL Phase 1 baseline checkpoint `91e707f376372aed5bdf415dd7bbb32d58583536` and source artifacts before any PostgreSQL/source transition.
- [ ] Do not edit the existing MySQL `.env.local`; do not use its runtime `DATABASE_URL` as a test target or migration target.
- [ ] For DB tests, explicitly provide `POSTGRES_TEST_DATABASE_URL` in the test process from a private secret/config source. Require a dedicated `mitjee_test` or `mitjee_test_<suffix>` database, reject database name `postgres`, and reject the URL if it points at the runtime target. Do not infer a test URL from `DATABASE_URL` or `DIRECT_URL`.
- [ ] If a dedicated PostgreSQL database is absent, mark the PostgreSQL integration suite **NOT RUN** and keep deployment/cutover approval withheld. Do not create a Supabase project or provision test PostgreSQL under this checklist.
- [ ] Do not run tests against the live MySQL runtime, Supabase production, or a database that contains user data. Do not use destructive cleanup/reset/migration commands outside a separately approved disposable test database.
- [ ] Run CLI migration operations only with a separately configured, verified `DIRECT_URL` direct endpoint. Assert that deploy rejects missing `DIRECT_URL`, runtime fallback, MySQL URL, transaction-pooler endpoint, insecure TLS, untrusted CA, and malformed/unknown URL options before connecting.

## Static and build gates

Run after the SOL source handoff, with environment values suppressed from logs:

```powershell
npm run prisma:validate
npm run prisma:generate
npm run typecheck
npm test
npm run build
npm run audit:client
```

The names above are the repository's current `package.json` scripts. `npm run build` also generates Prisma Client; keep the explicit generation step so its result can be inspected before typecheck/build. The full test run may skip PostgreSQL integration cases when no test URL is configured; report those skips as **NOT RUN**. The static commands do not need a live PostgreSQL connection.

- [ ] Prisma schema validation succeeds with PostgreSQL provider and the final configuration.
- [ ] Prisma Client generation succeeds; generated artifacts/manifests match the package lock.
- [ ] Typecheck passes.
- [ ] Full tests and targeted legacy/regression tests pass; note skipped database-dependent tests explicitly.
- [ ] Production build succeeds.
- [ ] Client-bundle security audit passes; no database URLs, adapter/server modules, or credentials enter browser artifacts.
- [ ] No lint script exists unless later added; if absent, report **NOT CONFIGURED**, not PASS.
- [ ] Review repository search results for unintended MySQL runtime references. Keep the old adapter/migration sources only where explicitly archived for rollback/provenance; list any remaining MySQL live-test harness/dependencies honestly.

## Runtime adapter, URLs, TLS, and pooling

With an isolated local/server test setup where no real provider is necessary:

- [ ] Runtime factory accepts PostgreSQL URLs only; rejects MySQL/unknown schemes, query/hash/TLS overrides, and invalid configuration without printing the URL or credentials.
- [ ] Runtime CA loading works from the approved inline/path variable. Remote TLS requires a trusted CA and hostname verification; invalid/missing CA fails closed. Loopback disposable testing is explicitly limited and does not weaken remote behavior.
- [ ] `node-postgres` SSL options cannot be replaced/overridden by connection-string flags. No `rejectUnauthorized: false`, encryption-only downgrade, or plaintext fallback.
- [ ] Runtime `DATABASE_URL`, CLI `DIRECT_URL`, and test `POSTGRES_TEST_DATABASE_URL` are separate; a direct migration URL is required and the deploy helper rejects transaction pooling.
- [ ] Pool limits and acquisition/connect timeouts are bounded with supported driver options. Test initialization failure, successful close, repeated close, and pool close after app shutdown; do not claim the old MariaDB connect/acquire timeout pair is reproduced exactly by one pg timeout.
- [ ] Direct and session-pool connection modes are documented as candidates; transaction pooling is not enabled by default. Any transaction-pool test includes interactive transaction, prepared-statement, session-state, and race behavior.

The current command for the dedicated integration suite is `npm run test:postgres`. It requires `POSTGRES_TEST_DATABASE_URL`; the helper does not fall back to `DATABASE_URL`, and the URL must have no query/hash options. Supply remote test TLS through `POSTGRES_TEST_TLS_CA` or `POSTGRES_TEST_TLS_CA_PATH`. The guard accepts only a database named `mitjee_test` or `mitjee_test_<lowercase letters, digits, or underscores>` and rejects that database name if it matches a PostgreSQL `DATABASE_URL`, even when host or credentials differ. Without the dedicated URL, record the suite as **NOT RUN** and do not invoke it as though it were a passing skip.

## Migration and PostgreSQL catalog checks

Against the dedicated disposable PostgreSQL test DB after migrations:

The repository's guarded migration command is `npm run db:deploy`. It reads only `DIRECT_URL`, refuses missing/runtime-fallback or pooler targets, and must be used only after an isolated test target or an empty owner-approved target is positively identified. For database tests, first point `DIRECT_URL` at the same dedicated test database named by `POSTGRES_TEST_DATABASE_URL`, run `npm run db:deploy`, then `npm run test:postgres`. The guard validates URL shape/TLS/pooler mode but does not prove a target is empty or disposable; verify its identity before migration. For the owner-approved Supabase target, use `DIRECT_URL` for that target only after the dedicated integration suite passes. The pinned Prisma 7.10 migration engine requires remote TLS via `sslmode=require`, `sslaccept=strict`, and a readable CA file in `sslcert`; `verify-full` and `sslrootcert` are rejected because this engine does not implement those libpq options. Optional URL options are `schema=public` and `connect_timeout` from 1 to 60 seconds; other or repeated options are rejected. Do not use `DIRECT_URL` as a substitute for the dedicated `POSTGRES_TEST_DATABASE_URL` used by integration tests.

- [ ] Fresh migration history and lock file identify PostgreSQL; the MySQL SQL history is outside the active migration directory and retains provenance. No MySQL migration is marked applied as though it ran on PostgreSQL.
- [ ] Assert the full model/column inventory, field widths/types, nullable fields, PKs, unique constraints, indexes, column order, and all composite relation target/column order.
- [ ] Assert every foreign key action remains exact: `CASCADE`/`RESTRICT` as inventoried, including the nullable composite `SessionOpportunity(sessionId, finalizedByActionId)` reference. Confirm there is still no account-owner FK.
- [ ] Assert no new SQL `CHECK` constraint was invented.
- [ ] Assert all date fields use the chosen `timestamptz(3)` mapping/default policy and retain exact millisecond precision.
- [ ] Assert JSONB mappings preserve SQL `NULL` versus JSON `null` semantics and the repository's Prisma `DbNull` behavior.
- [ ] Assert fixed-width account/receipt string fields preserve the valid current ID/hash/fingerprint values and round-trip/uniqueness behavior; do not trim, lowercase, or convert string IDs to UUID.
- [ ] Assert explicit binary-like collation choices for training/account identity data and record quiz collation compatibility as **UNVERIFIED** until source-data audit and comparison tests are complete.

### Trigger behavior

- [ ] Direct SQL `UPDATE` on `ScenarioTemplateVersion` is rejected with the stable `PUBLISHED_TEMPLATE_IMMUTABLE` category, including a no-op update.
- [ ] Direct SQL `DELETE` on `ScenarioTemplateVersion` is rejected with the same category.
- [ ] Direct SQL change of `UserAccount.id` is rejected with `ACCOUNT_ID_IMMUTABLE`; updating other columns while keeping the same ID is accepted.
- [ ] Verify trigger names, schema-qualified functions/objects, `BEFORE` timing, SQLSTATE `P0001` or other ASTRA-approved PostgreSQL exception code, and that the app runtime role cannot alter/disable the triggers.

## Repository and application regression tests

- [ ] Full training aggregate create/read/save round trip, including JSON values, messages, receipts, actions, events, opportunities, result, pinned template, and categoric/legacy historical results.
- [ ] SQL `NULL` and JSON `null` produce the intended distinct Prisma/domain states. Canonical JSON equivalence ignores property order; verify number/string/array behavior and Unicode boundaries.
- [ ] Convert historical MySQL `DATETIME(3)` values explicitly as UTC and prove a fixture at millisecond precision round-trips to the same epoch milliseconds, independent of test machine timezone. Validate database timestamp defaults.
- [ ] Two concurrent revision-CAS saves yield exactly one winner; the other maps to the intended conflict result. Transaction rollback fault injection leaves no partial child rows/receipts.
- [ ] RepeatableRead aggregate loads, ReadCommitted save/linearization path, stale revision, ownership checks, expiration across provider wait, conflict recovery, and result-once semantics behave as before.
- [ ] Race tests cover start receipts, message/action receipts, template publication uniqueness recovery, account uniqueness, and quiz receipt/commit paths. After a PostgreSQL constraint error aborts a transaction, recovery occurs only after the failed transaction is rolled back; no same-transaction query is attempted.
- [ ] Account normalized-email duplicate registration race has one correct outcome and retains intended application canonicalization.
- [ ] Quiz snapshot/receipt/history behavior and quiz/account/dashboard regressions pass.
- [ ] Trigger, role, and app tests prove the runtime user cannot bypass immutable-template or account-ID protections.

## Data-preservation and cutover gates

These are separate from code preparation and remain **NOT RUN** until a data-transfer change is specifically authorized:

- [ ] Backup source MySQL and perform an isolated restore rehearsal; establish a quiescence plan and verify there are no writes during the final consistent export.
- [ ] Audit counts, source constraints, owners, JSON-null cases, `CHAR` values, and time ranges before export.
- [ ] Validate transform rules: naive MySQL `DATETIME(3)` is interpreted as UTC; `JSON`/JSONB null semantics are explicit; fixed character identifiers remain exact; no IDs are trimmed, lowercased, or UUID-converted.
- [ ] Audit case, accent, Unicode normalization, trailing spaces, equality, ordering, and unique collisions for all identity/quiz strings. MySQL `utf8mb4_unicode_ci` behavior is not presumed equivalent to PostgreSQL `C` or an arbitrary ICU collation. Any unexpected/noncanonical values block import pending ASTRA choice.
- [ ] Compare table counts, PK/FK/unique results, canonical aggregate hashes, historical legacy and decision-rule outcomes, account normalized-email semantics, quiz snapshots/results, and UTC millisecond values after import.
- [ ] Rehearse restore and rollback before cutover. Before PostgreSQL production writes, rollback means returning to the preserved MySQL baseline; after writes, do not point back blindly—stop and reconcile/forward-fix with the data owner.
- [ ] No dual-write, deployment cutover, runtime environment change, backup restore, or destructive rollback occurs without separate authorization.

## Current status

The initial Phase 2 preflight found no Supabase project or dedicated PostgreSQL test URL, and no `psql`, `postgres`, `pg_ctl`, or Docker executable in the host snapshot. Its source-gate results below are historical preparation evidence. The owner later supplied and approved a dedicated Supabase test database: connectivity, verified client TLS, the fresh baseline migration, and exact catalog checks have now run. A non-UTC timestamp defect in the pinned adapter was reproduced and corrected with a version/build-verified compatibility patch; the unchanged seven metadata regressions passed after a clean install. The final 60-case rerun is recorded in the linked live report. Backup/restore rehearsal, real historical-data transfer/parity, restricted production-role enforcement, and cutover remain **NOT RUN** and are not authorized by these isolated tests.

### Local source-gate results (2026-10-23)

These results cover the checked-out source only; they do not establish PostgreSQL connectivity or migration correctness:

| Gate | Result | Scope / notes |
| --- | --- | --- |
| `npm run prisma:validate` | **PASS** | Prisma schema/config validation; no database connection. |
| `npm run prisma:generate` | **PASS** | Generated Prisma Client 7.10.0. |
| `npm run typecheck` | **PASS** | TypeScript `--noEmit`. |
| `npm test -- tests/ai-evaluation-harness.test.ts` | **PASS** | 8/8 tests, including exact measured-case-set matching with order ignored. |
| `npm test -- --maxWorkers=1` | **PASS** | 57 files passed, 5 skipped; 936 tests passed, 60 skipped. The five skipped PostgreSQL test files / 60 cases are **NOT RUN**, not integration passes. |
| `npm run build` | **PASS** | Prisma generation and Next.js production build completed with a temporary process-only, nonconnecting `DATABASE_URL` placeholder; `.env.local` was not changed. |
| `npm run audit:client` | **PASS** | 69 JavaScript artifacts inspected; server dependency/secret markers absent. |
| Lint | **NOT CONFIGURED** | No lint script is present in `package.json`. |

The initial default-parallel `npm test` run encountered one 5-second timeout in the aggregate speech-work test and three Vitest worker-start timeouts. The same speech test passed by itself (1 passed, 16 skipped), and the complete single-worker suite above passed; no timeout was relaxed. The PostgreSQL integration command `npm run test:postgres`, migration command `npm run db:deploy`, and any live TLS handshake were **NOT RUN** because `POSTGRES_TEST_DATABASE_URL` / `DIRECT_URL` are not configured and no PostgreSQL test service/toolchain is available. No environment file, database, Supabase project, or user data was changed.

The retained Phase 1 archive was compared against commit `91e707f376372aed5bdf415dd7bbb32d58583536`: all 19 archived migration/source files matched after line-ending normalization. Legacy MySQL live commands `test:mysql`, `test:auth:live`, `test:e2e`, `profile-call-runtime`, and `reproduce-training-start` now fail closed and direct operators to a separate Phase 1 checkout; `benchmark-latency --live` also refuses to run from this PostgreSQL-preparation source. The `@prisma/adapter-mariadb`, `mariadb`, and `mysql2` package entries remain as Phase 1 provenance/dependency remnants; they are not evidence of a PostgreSQL integration run.
