# Phase 5A — PostgreSQL latency diagnosis

This phase observes the existing PostgreSQL persistence path. It does not remove reads, change includes, cache aggregates, alter transactions, tune the pool, or optimize AI/speech/protocol behavior. Runtime `src/`, templates, Prisma schema, and migrations are unchanged.

## Scope and reproducibility

Run from the repository root:

```text
node scripts/diagnose-postgres-latency.mjs --live-test-db
```

For the shorter observer correctness check, run `node scripts/diagnose-postgres-latency.mjs --context-check`. It uses the same private target guards and writes a separate artifact; its one-pair/no-warmup timing cohort must not replace the full benchmark statistics.

The script privately loads `.env.local`. It requires `POSTGRES_TEST_DATABASE_URL`, `DIRECT_URL`, and either `POSTGRES_TEST_TLS_CA` or `POSTGRES_TEST_TLS_CA_PATH`. It never substitutes the runtime `DATABASE_URL`. Guards require a dedicated `mitjee_test`/`mitjee_test_<suffix>` database, reject an alias of the runtime database, require matching Supabase project/database identity for the two endpoint paths, reject transaction-pooler ports, and retain trusted-CA TLS verification. No environment values, hostnames, credentials, certificate content, SQL, query parameters, transcripts, or returned database rows are exported.

Both endpoints must also read an identical newly-created synthetic session before paired measurements begin. The harness creates synthetic training history and retains it; it does not migrate, reset, truncate, delete data, or call paid providers.

The observer is deliberately limited to the pinned `pg 8.23.1` and Prisma/adapter `7.10.0`. It uses a harness-only subclass of the existing adapter factory, observes its lazy pool, and wraps the existing repository instance. The normal runtime does not import this instrumentation. It keeps the original query object, SQL/arguments, query order, callback or promise return shape, transaction options, pool ownership, and disposal. Lazy Prisma operations are awaited exactly once. The installed timestamp compatibility correction from the preceding phase remains in place.

## Methodology and instrumentation points

- Three cold TCP/TLS/authentication connections per endpoint, using the existing pool configuration: maximum 8, connection timeout 10 seconds, idle timeout 10 seconds. Acquisition and connection durations overlap; they must not be added together.
- Two warmups and ten measured `SELECT 1` probes per endpoint. These measure client-visible endpoint round trips, not pure network latency or pure pooler CPU time.
- Two warmup pairs and five measured pairs of an aggregate GET followed by a mock learner-message commit, concurrency 1. Endpoint order is counterbalanced. Each sample starts from a fresh CC-01 v6 session at `IDENTITY_CLAIM`, with matching authored setup outside the measured interval.
- Repository GET/SAVE and transaction boundaries, aggregate fetch and save-reload delegate boundaries, CAS update, and the `writeChildren` boundary are timed separately. Each dispatched statement is correlated with its enclosing span; the raw artifact contains all individual samples.
- Driver enqueue-to-submit time is `queueMs`. Submit-to-callback time is `wireMs`: server work, transport and client decoding together. Enqueue-to-callback is `clientMs`. Concurrently queued relation queries have overlapping client durations, so summing them would overstate elapsed time. No pipelining is enabled.
- BEGIN, isolation-level SET, COMMIT and ROLLBACK are counted as SQL statements separately from SELECTs and DML. SQL text is classified in private memory into bounded commands/table names and immediately discarded from exported records. The harness requires one statement per dispatched query and complete timings.
- Each endpoint also performs three warm uninstrumented GET controls; snapshots must equal the observed repository's snapshot. These provide a coarse overhead comparison, not a statistically powered overhead estimate.
- Read-only `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` replays the actual parameterized aggregate SELECTs captured for one synthetic session. Raw SQL, parameters and plans remain private in memory; only planning/execution times, row counts and buffer totals are exported. EXPLAIN queries are outside measured application intervals. Completion requires all eight SELECTs to be captured and all sixteen endpoint/query plans to be measured.
- Prisma's batch engine can dispatch SQL from a parent transaction's async context. Final attribution therefore correlates dispatch timestamps with the smallest enclosing completed delegate interval; the original dispatch context is retained as `dispatchSpanId`. A regression test covers this case. Early diagnostic output with incomplete delegate tags/EXPLAIN was kept locally under ignored `test-results/` and is not the final measurement evidence.
- An anonymous, run-local `clientRef` distinguishes physical connections without exporting backend PID or connection identity. A `SELECT 1` through the Prisma pool immediately follows each measured turn, and five late warm plain-driver probes per endpoint check whether endpoint/connection timing drifted during the run.
- Live negative controls cover ownership rejection, duplicate turn replay, stale CAS, and injected pre-commit rollback. Existing unit/integration regression suites remain the evidence for broader lifecycle/evaluation invariants.

Percentiles use the arithmetic median and nearest-rank p95. At five samples, p95 is the maximum and is exploratory. SQL counts are statements actually dispatched by the client; PostgreSQL trigger-internal statements, protocol Parse/Bind messages, Supavisor internals, and server lock/CPU attribution are not separately counted. No concurrent-load, production/Vercel, cold-start HTTP, full historical-session-size, or voice-provider benchmark is claimed here. Voice's additional aggregate read is discussed using the preceding measured baseline, not presented as a newly measured voice run.

The public pool/client contracts are documented by [node-postgres Pool](https://node-postgres.com/apis/pool) and [Client](https://node-postgres.com/apis/client). Prisma's PostgreSQL connection modes are described in its [PostgreSQL documentation](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql). The internal query-dispatch hook used solely by this diagnostic is version-specific and must be reviewed before any driver upgrade.

## Measurement environment and evidence

- Runtime source commit: `c723e895305d93b12d12041499c5333a1ca1ee44`. The new diagnostic harness was uncommitted during measurement; exact file SHA-256 hashes are included in each artifact. Existing README/document edits do not affect the measured runtime source.
- Main run: `b2f2ff79-ecac-46a5-8481-4a45fe482c7b`, 2026-10-24 **11:33:14.579–11:45:11.696 UTC**.
- Windows x64 local client, Node `v24.19.0`, PostgreSQL **17.11** (`server_version_num=170011`), Prisma/adapter `7.10.0`, pg `8.23.1`. Same dedicated test database, trusted CA verified, default application pool settings, concurrency 1, warm template cache.
- [Main raw evidence](postgres-latency-diagnosis.json): 92 samples, including warmups/negative controls/probes, every observed statement's timing, aggregate/delegate/transaction spans, pool acquisitions and numeric EXPLAIN evidence. All primary GET/SAVE SQL was observed; all eight SELECTs and sixteen EXPLAIN plans were verified.
- [Context follow-up](postgres-latency-context-check.json): a bounded confirmation after moving the lazy-thenable await inside AsyncLocalStorage. The main GET/SAVE operations already returned native promises and were completely counted; their delegate attribution used recorded time intervals. Optional standalone Prisma raw probes in the main run had elapsed timings but **unobserved SQL**, so their empty query arrays are not evidence of zero executed SQL. The final observer fixes this and tests exactly-once execution within both contexts. Uninstrumented controls likewise intentionally have no observed query records. The follow-up uses one pair per endpoint and is a correctness check, not a replacement five-sample latency cohort.
- Follow-up run `55e2a038-d536-4c52-b151-f07f42e4d21c`, **11:47:27.726–11:50:23.976 UTC**, PASS: 38 samples, sixteen EXPLAIN plans, GET=11 and SAVE=15 statements, raw Prisma probe=one SELECT/one acquisition per endpoint, and all live correctness controls. Its recorded harness/runtime file hashes match the final source files exactly.

## Primary results

All times below are milliseconds. GET and mock message rows have five measured samples per endpoint, excluding setup/warmups. SAVE is the durable aggregate save nested inside those five message samples. A message here is the application **service path**, with no HTTP/WebSocket/Auth.js, LLM, STT or TTS work.

| Endpoint / operation | min | p50 | p95 | max |
| --- | ---: | ---: | ---: | ---: |
| Session pooler / aggregate GET | 1049.65 | 1052.95 | 1062.27 | 1062.27 |
| Direct / aggregate GET | 2322.89 | 2333.12 | 2356.84 | 2356.84 |
| Session pooler / aggregate SAVE | 1442.90 | 1450.40 | 1456.15 | 1456.15 |
| Direct / aggregate SAVE | 3182.48 | 3203.59 | 3212.39 | 3212.39 |
| Session pooler / mock message service total | 5646.16 | 5664.01 | 5700.95 | 5700.95 |
| Direct / mock message service total | 12506.68 | 12592.03 | 12823.30 | 12823.30 |

Raw measured operation samples, also available at full precision with individual statements in the artifact:

| Endpoint | Sample | GET | SAVE | Mock message total |
| --- | ---: | ---: | ---: | ---: |
| Session pooler | 1 | 1058.29 | 1442.90 | 5664.01 |
| Session pooler | 2 | 1049.65 | 1450.40 | 5646.16 |
| Session pooler | 3 | 1052.95 | 1446.44 | 5658.28 |
| Session pooler | 4 | 1052.14 | 1456.15 | 5700.95 |
| Session pooler | 5 | 1062.27 | 1452.71 | 5677.51 |
| Direct | 1 | 2324.78 | 3182.48 | 12506.68 |
| Direct | 2 | 2322.89 | 3194.97 | 12823.30 |
| Direct | 3 | 2333.12 | 3212.39 | 12592.03 |
| Direct | 4 | 2342.17 | 3203.89 | 12544.29 |
| Direct | 5 | 2356.84 | 3203.59 | 12597.72 |

### Actual statement counts and include fan-out

Counts were constant across every measured pair, on both endpoints:

| Operation | SELECT | UPDATE | INSERT | BEGIN | isolation SET | COMMIT | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| One owned aggregate GET | 8 | 0 | 0 | 1 | 1 | 1 | **11** |
| One dialogue aggregate SAVE | 8 | 1 | 3 | 1 | 1 | 1 | **15** |
| One mock message service turn: four GETs + one SAVE | 40 | 1 | 3 | 5 | 5 | 5 | **59** |

Each include fetch executes a parent `TrainingSession` SELECT plus seven relation SELECTs: template version, actions, opportunities, events, messages, turn receipts, result. Six child queries can wait behind an active relation query on the same transaction connection. The driver remains non-pipelined. Pooler message-query queue p95 is **571.68 ms**, versus **1270.96 ms** direct; those waits overlap and are not additional server execution time to add to every query's wire time.

The save does one CAS UPDATE, reloads the entire aggregate with eight SELECTs, and performs three child operations: `TrainingAction.create`, `DialogueTurnReceipt.create`, `TrainingMessage.createMany`. The last INSERT writes the user/character pair together. No opportunity, event or result is created during the measured identity conversation. Other authored states/actions may require different child counts; these are not universal counts for every decision.

### Transaction, connection and reload costs

| Measurement | Session pooler p50 | Direct p50 | Scope |
| --- | ---: | ---: | --- |
| BEGIN wire time | 94.79 | 210.92 | 25 transactions per endpoint within measured message samples |
| Isolation SET wire time | 95.57 | 211.06 | Same transactions |
| COMMIT wire time | 94.83 | 212.36 | Same transactions |
| Warm pool acquisition | 0.097 | 0.095 | Same transactions; no new connections inside measured turns |
| Cold connection establishment | 592.71 | 1516.24 | Three fresh connections per endpoint |
| Cold acquisition total | 593.52 | 1517.03 | Includes connection establishment; overlapping, not additive |
| Save aggregate reload | 770.41 | 1704.36 | Eight SELECTs per save |
| CAS delegate | 95.01 | 212.83 | One guarded UPDATE per save |
| `writeChildren` wall time | 292.29 | 642.16 | Three child ORM calls / three INSERTs per save |

On the pooler, reload accounts for approximately **53% of durable SAVE time**. Three control statements cost approximately 285 ms per transaction before considering SELECTs/DML. Four GETs account for roughly 4.2 seconds of the 5.66-second service turn. These are diagnostic approximations using medians; medians of components need not sum exactly to the median of the total.

The warm pool did not show saturation: measured message acquisitions had `waitingBefore=0`, p95 **0.144 ms** pooler / **0.202 ms** direct. Cold establishment is material when a connection must be created, but it does not explain these already-warm turns.

### Endpoint-path comparison and server execution

| Probe | Session pooler p50 | Direct p50 | Samples per endpoint |
| --- | ---: | ---: | ---: |
| Early warm plain-driver SELECT 1 total | 96.46 | 207.67 | 10 |
| Late warm plain-driver SELECT 1 total | 94.32 | 212.61 | 5 |
| Optional main-run Prisma SELECT 1 elapsed only | 96.49 | 213.85 | 5 |
| Warm uninstrumented aggregate GET control | 1076.26 | 2302.03 | 3 |

The pooler path is approximately **111 ms faster** per early trivial probe, not slower, in this environment. Both early and late probes show the direct-path disadvantage. This is an **endpoint-path difference**, not a measurement of isolated Supavisor CPU overhead: routing/address family/TLS/backend connection behavior cannot be separated from pooler processing with these client measurements. The earlier exploratory run also showed direct-path timing drift. No endpoint, socket option, protocol, pool setting or routing was changed to address that variability.

The eight read-only EXPLAIN executions total **1.170 ms** through the pooler and **0.451 ms** direct. Each individual execution is **0.029–0.852 ms**, with zero shared read blocks in all sixteen plans. Planning is separately recorded in the raw artifact. These are warm, small synthetic histories after the measured turn committed, not the exact earlier repeatable-read snapshot and not production-sized sessions. EXPLAIN overhead and its distinct invocation prevent exact subtraction from each observed SELECT, but the scale difference strongly supports round-trip amplification over slow SQL execution for this workload.

### Ranked bottleneck report — no persistence changes applied

1. **Sequential statement round trips multiplied by aggregate fan-out and repeated aggregate reads.** An owned GET is eleven statements, a service message is fifty-nine, and the observed pooler per-statement wire median is about 95 ms. The eight-SELECT include alone takes about 765–770 ms; warm server execution for those SELECTs is roughly one millisecond in total. This is the largest measured source of elapsed time.
2. **Save reload plus transaction control round trips.** The eight-SELECT reload consumes about 770 ms / 53% of pooler SAVE; BEGIN + isolation SET + COMMIT add about 285 ms per transaction. These implement current consistency/CAS guarantees and have been preserved. Any future reduction must prove equivalent ownership, expiry, replay, coherent snapshot and rollback behavior before approval.
3. **Client-to-endpoint path latency, especially the direct path in this run.** Trivial direct SELECTs are about 208–213 ms versus 94–96 ms through the session pooler. Switching to direct is not supported as a latency improvement by this evidence; no switch was made. The exact network/session cause is unisolated.
4. **Three sequential child INSERT round trips.** About 292 ms through the pooler. The implementation already writes only new children and batches the two messages; this run does not show historical child rewrites or a growing number of writes per conversational turn.
5. **Cold connection establishment, conditional rather than a warm-turn bottleneck.** Approximately 593 ms pooler / 1516 ms direct. Warm acquisition itself is below a millisecond and does not support a pool-starvation diagnosis at concurrency 1.

The [preceding WebSocket benchmark](latency-post-change.md) counted five GETs plus one save for text and six GETs plus one save for voice, versus four GETs plus one save in this direct service measurement. Applying this state's measured 11/15-statement costs would project **70 / 81 statements** for those text/voice training-repository paths. Those are explicitly **derived projections**, not newly instrumented WebSocket/voice SQL counts. The historical MySQL SQL statement counts were never measured, so this report does not claim a proven increase in statement count relative to MySQL or isolate database engine choice from network placement.

### Live correctness controls

Both endpoint aliases read the same newly-created synthetic record. All measured mock turns used one attempt, no fallback, no scoring event and no result. Duplicate turn replay caused **zero DML** (33 read/control statements), and the entire persisted snapshot remained identical. Other-owner GET was rejected; stale CAS used four statements ending in ROLLBACK. The injected pre-commit fault rolled back its header update/reload (twelve statements), and the post-fault snapshot equalled the original. All three uninstrumented GET controls per endpoint returned identical snapshots. No migration, reset, delete, or production data operation was performed.

## Semantics and limits

No ownership/expiration checks, revision/CAS, idempotency/replay handling, atomicity, template immutability, State Machine, EventValidator, Critical Failure rules, result categories, `DECISION_RULES_V1`, or `trainingScore=null` behavior is modified. LLM/STT/TTS remain non-authoritative. This phase ends with a ranked report; any persistence behavior change requires a subsequent phase.

Local certificate and key directories/extensions are now ignored. No certificate, private key, environment file, or credential is committed. The existing developer documentation edits are kept separate from this phase.

## Verification

| Gate | Result |
| --- | --- |
| Prisma generate | PASS, pinned timezone compatibility correction verified |
| Prisma validate | PASS |
| TypeScript typecheck | PASS |
| New diagnostic unit tests | PASS, 10/10; includes lazy execution exactly once inside async contexts, query/callback transparency, context correlation, private export, endpoint guards and gitignore protection |
| Full regression | PASS with `npm test -- --maxWorkers=2`: 997 passed, 60 database cases skipped by default; final run after the observer context correction |
| Production build | PASS |
| Client bundle audit | PASS, 69 JavaScript artifacts inspected |
| JavaScript syntax checks | PASS for all three diagnostic scripts |
| `git diff --check` | PASS |
| Lint | NOT CONFIGURED: `npm run lint` exits 1 because no lint script exists; no lint tool/dependency introduced |

The initial full regression run overlapped a production build and failed two existing 5-second test deadlines plus four worker startup deadlines. The entire suite was rerun after the build, with two workers and unchanged assertions/timeouts, and passed. The live diagnostic ran separately from both test/build workloads. The 60 PostgreSQL integration cases passed in the preceding phase; they were not rerun as part of this instrument-only change. Current live evidence additionally checks both endpoint aliases, ownership, duplicate replay, stale revision, pre-commit rollback, and equality with an uninstrumented repository.
