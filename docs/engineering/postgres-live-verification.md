# Isolated PostgreSQL live verification

Date: 2026-10-24. Repository base: `5c13cf078f0503e7b08998ea7ac5f12fee200ccd`, branch `feat/rule-based-evaluation`. The test-harness changes and version-bound adapter compatibility patch described below are identified by SHA-256 in the final JSON evidence. Core, State Machine, scoring, repositories and public contracts retain their source from the base. This report supplements the earlier [preparation checklist](postgres-verification.md); it does not retroactively turn earlier skipped tests into passes.

Environment: Windows x64 10.0.26200, Node v24.19.0, workstation timezone Asia/Bangkok; PostgreSQL 17.11, configured application connection timezone UTC; Prisma/adapter 7.10.0, `pg` 8.23.1, Vitest 5.0.0. Endpoint identities are withheld. Integration traffic uses a session pooler; migration uses the direct endpoint.

## Target and safety boundary

The owner supplied an isolated disposable Supabase PostgreSQL test database and confirmed READY. The dedicated-target guard accepted `POSTGRES_TEST_DATABASE_URL` and rejected substitution of the MySQL runtime target. Test traffic used a session pooler on port 5432; migration traffic used the corresponding direct endpoint. The direct and pooler identities were checked to refer to the same project and dedicated database before migration. This report intentionally omits connection identities, database URLs, passwords, certificate contents, and retained synthetic session identifiers.

The runtime `DATABASE_URL` remains the original MySQL setting. No production database, deployment, MySQL data, application environment file, or rollback artifact was changed. Synthetic integration records remain only in the owner-approved test database; individual tests clean up only records they own where their existing contract requires it.

## Connection, TLS, and migration

| Check | Result | Evidence |
| --- | --- | --- |
| Session-pooler authentication and client TLS | PASS | `pg` connected using `postgresPoolConfig`; the TLS socket reported `authorized=true`. |
| Direct authentication and client TLS | PASS | Read-only probe using the same trusted CA reported `authorized=true`; server-side SSL was also enabled. |
| Wrong trusted CA | PASS: rejected | A distinct valid CA was rejected with `SELF_SIGNED_CERT_IN_CHAIN`. No insecure fallback was enabled. |
| Wrong hostname | PASS: rejected | The real peer certificate was checked against a deliberately incorrect hostname using Node's standard certificate identity checker; it rejected with `ERR_TLS_CERT_ALTNAME_INVALID`. |
| Empty target before migration | PASS | Both connection paths reported zero application tables. |
| Baseline migration | PASS | Native Prisma deploy applied `202610220001_postgresql_baseline` successfully. One finished migration record, no rollback marker, and exact SHA-256 equality with the checked-out SQL were verified. |

The session pooler's `pg_stat_ssl` result describes the separate pooler-to-database connection. Its false value is not evidence that the verified client-to-pooler TLS socket was plaintext. The direct connection's server-side SSL check was true. Encryption of the provider-managed pooler-to-database hop was not established by this check.

`DIRECT_URL` in the private file did not contain the Prisma-native TLS flags. For this migration only, a process-local URL copy received `sslmode=require`, `sslaccept=strict`, and `sslcert` pointing to the existing `POSTGRES_TEST_TLS_CA_PATH`; `directMigrationUrl` validated it before the child process started. No credential-bearing URL was placed in command arguments or output. Future CLI invocations still need this documented TLS configuration; the private file was not rewritten.

The first native deploy attempt returned P3015 because four local, untracked empty directories remained from the archived MySQL migration history. Each resolved path was checked to be an empty immediate child of `prisma/migrations`, with the corresponding SQL preserved under `archive/mysql/migrations`, before nonrecursive removal. No tracked source or archived SQL was deleted. Retrying the deploy then passed. Clean Git checkouts do not contain these empty directories.

## Catalog and native semantics

The application connection reported PostgreSQL 17.11 and timezone UTC.

| Catalog object | Observed |
| --- | ---: |
| Application tables / primary keys | 12 / 12 |
| Application columns | 104 |
| Foreign keys | 14 |
| Indexes, including primary-key indexes | 20 |
| Non-primary unique indexes | 5 |
| Custom immutability triggers | 3 |
| CHECK constraints | 0, intentionally matching the approved baseline |

The integration metadata cases additionally verify exact FK column order and RESTRICT/CASCADE actions, trigger timing, fixed CHAR widths, all 14 millisecond timestamptz columns, all 12 JSONB columns, deterministic C collation, direct-SQL trigger exceptions, UTC epoch-millisecond round trips under a different transaction timezone, SQL NULL versus JSON null, and receipt/cascade behavior. Their actual case results are recorded below rather than inferred from catalog counts.

A separate read-only [exact catalog comparison](postgres-live-catalog-results.json) passed against the checked-out baseline SQL: all 104 columns including order, types, widths, nullability, precision, collation and defaults; all 12 ordered primary keys; all eight non-primary index definitions including uniqueness; and both trigger functions' fixed `search_path=pg_catalog`. PostgreSQL catalog `name[]` values were explicitly cast to `text[]` before comparing ordered key columns.

Read-only C-collation comparisons returned false for case equality, accent equality, composed/decomposed Unicode equality, and TEXT trailing-space equality; fixed CHAR padding equality returned true. These are observed PostgreSQL semantics, not proof of equivalence to historical MySQL `utf8mb4_unicode_ci`. Existing canonical quiz/account fixtures and legacy training snapshots can establish only their tested cases. Auditing/importing arbitrary historical production strings and comparing source-data hashes remains NOT RUN and blocks production cutover.

The test role is not a superuser but owns the protected tables. The triggers reject normal direct UPDATE/DELETE operations, but a table owner can alter its own protections. A separate restricted production runtime role that cannot alter/disable triggers has therefore NOT been verified; no roles or grants were changed in this run.

## Integration execution

The dedicated five PostgreSQL test files contain 59 cases; the PostgreSQL case in `http.integration.test.ts` is the sixtieth. The live run explicitly includes all six files. HTTP tests use a mock dialogue provider and test authentication at the application boundary; these database tests make no paid LLM/STT/TTS requests and do not prove a deployed Auth.js/browser flow.

The final execution uses Vitest with one worker, a complete-test limit of 300 seconds, and a hook limit of 60 seconds for the remote database. The fresh-client categorical cases also use the 300-second whole-test budget; explicit account/variant case limits remain effective. These runner limits do not change application database transaction deadlines (10/15 seconds), provider deadlines, CAS, state transitions, scoring, or critical-event authority. Configuration is loaded privately into the test process; it is never committed or logged.

The public entry point `npm run test:postgres` now includes the HTTP integration file and the remote whole-test budgets above. As before, it requires private process configuration and does not load `.env.local` itself. A caller must load the existing environment settings privately, retain the dedicated-target guard, and avoid printing raw failure diagnostics. The recorded live run used the same file list and limits with an additional reporter that retained only test names, statuses, numerical durations, closed error names/codes, and aggregate totals. No provider payload, SQL parameter, connection identity, account password, or transcript is included in the evidence.

### Test-harness failures and corrections

- The first capture wrapper reached its ten-minute total limit before it could produce a complete result. It is NOT a passing test run.
- A subsequent diagnostic attempt stopped after 28 PostgreSQL case results: 23 passed and five failed; the other 32 were unexecuted, not passes. [Initial attempt evidence](postgres-live-initial-test-results.json) is retained with `runCompleted: false`.
- Four failures hit whole-test limits: the HTTP and legacy full-dialogue paths used a 60-second runner limit, and two fresh-client categorical paths used their own 30-second limit. The final run budgets complete paths separately from the unchanged transaction deadlines. For example, the unchanged HTTP complete-path assertions passed in approximately 90 seconds, and the legacy multi-turn path passed in approximately 77 seconds.
- The other failure was a test fixture collision: the immutability contract tried to publish a hypothetical SMS v3 over the real catalog's already-published SMS v3. The backend correctly rejected it. The contract now uses a private template identity for its versioning exercise and retains every immutability/session-pinning assertion. No published configuration, trigger, or backend immutability rule was changed.
- The initial harness corrections are confined to `scripts/test-postgres.mjs`, `tests/persistence.postgres.test.ts`, and `tests/repository-contract.ts`. The final rerun starts clean processes after the diagnostic attempt was explicitly stopped; results from unfinished diagnostic operations are not reused as passes.

### Non-UTC adapter defect discovered by the live test

The next complete run executed all 60 PostgreSQL cases: **59 PASS, 1 FAIL, 0 skipped** (124/125 including the repeated HTTP mock cases). [Pre-fix evidence](postgres-live-pre-timezone-fix-results.json) is retained. The original non-UTC timestamp assertion was not removed, relaxed, skipped, or rewritten.

A synthetic reproduction isolated the problem to the pinned `@prisma/adapter-pg` conversion. With a transaction timezone of Asia/Bangkok, input `2026-10-23T12:34:56.789Z` returned that apparent instant from Prisma create, but PostgreSQL's stored epoch corresponded to `2026-10-23T05:34:56.789Z`; a subsequent UTC-client reload exposed the seven-hour error. The adapter emitted an offset-free UTC wall-clock input and relabeled returned offsets instead of converting the instant. The standard UTC connection policy mitigated normal paths but did not satisfy the tested non-UTC invariant. This is consistent with the upstream [write issue](https://github.com/prisma/orm/issues/28629), [read issue](https://github.com/prisma/orm/issues/26786), and still-open [proposed fix](https://github.com/prisma/orm/pull/29481), checked 2026-10-24. Our live reproduction, rather than the issue report alone, establishes the failure here.

`scripts/patch-prisma-pg-timezone.mjs` supplies a temporary compatibility correction: explicit UTC offsets on datetime writes and real UTC conversion on TIMESTAMPTZ reads. It preserves the schema's millisecond instants. It accepts only the exact original or exact already-patched CommonJS/ES-module bundles of the pinned 7.10.0 release, validates both before writing either, and fails closed on unknown versions/builds. There is no fuzzy patch, dependency upgrade, or new network dependency. `postinstall`, `prisma:generate`, and `build` run the same check; installed dependency files and generated Prisma files are not committed. The new unit suite checks positive/negative/fractional offsets, date boundaries, explicit UTC writes, idempotency and unsupported/partial package builds. Remove this compatibility fix only after a reviewed upstream upgrade passes the original live regression.

After the correction, `npm ci --no-audit --no-fund` completed from a fresh dependency installation and ran the patch plus Prisma generation through `postinstall`. The original seven metadata tests then passed against the real test database, including the unchanged non-UTC assertion. Explicit Prisma generation/validation, typecheck, production build and the 69-artifact client audit passed as well. The build used only a process-local nonconnecting database placeholder; it did not connect to MySQL or change the private file.

Per-case `durationMs` in the evidence measures whole tests, including fixture publication, many actions/turns, reconnects and verification queries. It is not per-turn latency, a performance benchmark, or evidence of a before/after speedup. The old MySQL/Azure baseline remains unchanged.

### Reproduction and changed files

After configuring the existing private settings and positively identifying the same disposable target, load them into the test process without printing their values. For example, from the repository root on the verified Node runtime:

```powershell
node --input-type=module -e "import env from '@next/env'; import { spawnSync } from 'node:child_process'; env.loadEnvConfig(process.cwd(), false, { info(){}, error(){} }); const r = spawnSync(process.execPath, ['scripts/test-postgres.mjs'], { env: process.env, stdio: 'inherit', windowsHide: true }); process.exit(r.status ?? 1);"
```

The dedicated URL guard still runs before any database client is created. Do not substitute the runtime URL, reset/drop the database, or share raw failure output. The archived evidence uses an additional sanitized reporter; the normal command above retains the usual private terminal output.

| File group | Change |
| --- | --- |
| `scripts/test-postgres.mjs` | Includes the sixtieth database case and bounded remote complete-test budgets. |
| `tests/repository-contract.ts` | Isolates the immutability version exercise from published catalog identities. |
| `tests/persistence.postgres.test.ts` | Budgets the complete fresh-client replay case separately from transaction deadlines. |
| `scripts/patch-prisma-pg-timezone.mjs`, `package.json` | Version/build-verified datetime compatibility fix on install, generation and build. |
| `tests/prisma-pg-timezone-patch.test.ts` | Ten conversion/idempotency/fail-closed package regressions. |
| This report and `postgres-live-*.json` / `postgres-local-regression-results.json` | Sanitized live/failure/catalog/local evidence. |
| `postgres-verification.md`, root `FINAL_METRICS.md`, root `FINAL_ENGINEERING_REVIEW.md` | Current operational addenda while preserving historical source-gate scope. |

The 27 pre-existing user README/documentation modifications and untracked certificate files are excluded. No generated client, dependency bundle, private environment file, database URL or certificate body is included in the changes.

Final full live rerun: **PASS, 60/60 PostgreSQL cases, 0 failures, 0 skipped**, and **125/125 total cases** across the six files (65 HTTP mock cases overlap the offline regression). [Final per-case evidence](postgres-live-test-results.json) records the environment, exact source/dependency hashes, runner limits, statuses and numerical durations. It completed in 1,169,487 ms including setup and assertions. No unhandled errors were reported.

| PostgreSQL case group | PASS / total |
| --- | ---: |
| Persistence/repository contracts | 41 / 41 |
| Accounts | 4 / 4 |
| Quiz | 6 / 6 |
| Call variant concurrency | 1 / 1 |
| Native/catalog metadata, including original non-UTC regression | 7 / 7 |
| HTTP services with real database | 1 / 1 |

Local final gates: clean dependency install, Prisma generation/validation, typecheck, production build, 69-artifact client audit and diff whitespace checks PASS. The separate latest full offline suite has **987 PASS / 60 deliberately excluded database cases**, including four added benchmark guard tests; those exclusions are not counted as passes. The live results above supply the missing database evidence. Lint is NOT CONFIGURED.

## Remaining gates

- Restricted production runtime-role enforcement, real historical-data parity, backup/restore rehearsal, data transfer, and production cutover remain unverified and unauthorized.
- The owner subsequently configured the three ElevenLabs settings and approved `eleven_v4_turbo`. The bounded synthetic ElevenLabs TTS / Azure STT test passed with one synthesis and one transcription after the PostgreSQL gate passed; see [speech live evidence](elevenlabs-live-verification.json). Model/voice metadata checks were successful. Console per-provider timing telemetry was not captured; the exit code and Vitest cache establish the passing test, and no paid replay was made to fill the log gap. Human Thai-quality review remains NOT REVIEWED.
- The [comparable post-change benchmark](../performance/latency-post-change.md) subsequently completed at committed source `abbcec3f93b28f3a5911b6d6d353c4a4e872c4f1`. All measured turns succeeded, but latency regressed; no optimization was implemented. Integration-test duration and the single speech roundtrip are not used as before/after performance evidence.
- Core, State Machine, DECISION_RULES_V1 result categories, `trainingScore: null`, and backend-only authority are unchanged.
