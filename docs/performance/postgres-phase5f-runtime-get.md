# Phase 5F — authoritative explicit aggregate GET

The explicit one-SELECT training aggregate reader is now used by
`PrismaTrainingRepository.get`. This is a source/runtime integration, not a
deployment. SAVE and its complete Prisma include reload are unchanged.

## Implementation and acceptance boundary

- Baseline runtime HEAD: `ec5b180313ca347e3ff9e9f5ace2034685e706d3`.
  The Phase 5E supported persisted-state contract is the acceptance boundary.
- New runtime module: `src/persistence/aggregate-reader.ts`. Its fixed SQL is
  byte-for-byte equal to the Phase 5D/5E proven explicit query. Session ID and
  owner ID are separate bound parameters; neither is interpolated into SQL.
- The proven codec hydrates only known SQL Date/Float columns. Nested JSON,
  nullable fields, own-property presence and the existing domain decoder remain
  intact. Float columns retain the text transport needed for signed zero.
- GET still uses the existing transaction wrapper: Repeatable Read,
  timeout 15,000 ms, maxWait 5,000 ms. Root absence and owner mismatch still
  produce `SESSION_NOT_FOUND`; Core remains responsible for expiry/clock checks.
- Dense position order and strictly increasing positive receipt revisions are
  checked at the GET boundary. Receipt gaps remain valid. Unsupported/tied
  ordering throws the bounded internal error `UNSUPPORTED_PERSISTED_ORDERING`;
  there is no sorting, row repair, write or invented evaluation outcome.
- The ordering check runs only on the GET reader. The shared domain decoder,
  SAVE validation/CAS, immutable history validation, writeChildren, template
  behavior and Quiz repository remain unchanged.
- No native relationJoins preview, secondary order key, schema constraint,
  migration, provider switch, LLM/TTS/STT optimization or protocol change.

Only the training repository's GET dispatch changes. Ownership, expiration,
revision/CAS, replay/idempotency, rollback, append-only validation, immutable
templates, DECISION_RULES_V1, trainingScore=null and backend-only authority retain
their existing Core/repository semantics.

## Correctness and parity verification

`scripts/verify-aggregate-runtime.mjs` compares the actual authoritative GET and
its row codec with the original Prisma include and unchanged baseline decoder.
It verifies source equality of the SQL, domain decoder and complete SAVE/writer
tail before reading fixtures. Line endings are normalized for source comparison;
the initial verifier-only mismatch caused by CRLF/LF was corrected without any
decoder implementation change.

Final parity evidence: `postgres-phase5f-parity.json`.

- **62 fixtures / 70 comparisons: PASS**, no scalar, relation-order, property,
  null, JSON, timestamp, row or domain mismatch.
- Historical versions 1–6; default/normal/scam; all lifecycle/result categories;
  legacy missing assessment; categorical assessment:null and trainingScore:null;
  absent/present results; empty/nested JSON and signed-zero stress.
- UTC, Asia/Bangkok and America/New_York connections; pre-epoch and millisecond
  boundaries. Date-looking nested JSON strings remain strings.
- Reversed physical insertion with unchanged supported ordering keys.
- SQL NULL and JSON null storage distinctions remain intact after reads.
- Wrong owner and missing root retain the same domain error, 2/2.
- All four synthetic tied relations are rejected without repair, 4/4.
- A writer commits between read opportunities: the existing RR scope remains
  coherent, and a fresh authoritative GET sees the new revision/status.
- Every measured authoritative GET executes **4 statements: 1 SELECT and
  BEGIN / isolation setup / COMMIT**.

Full offline regression passes with one worker: **1,026 passed, 69 skipped**
(66 files passed, 6 skipped). The 69 skips are the separately run live suites,
not claimed as live passes. Targeted reader/ordering/decoder/SAVE tests pass
38/38. The two existing decoder/transaction mocks were adapted to the raw query
boundary while preserving their domain-shape, ownership and budget assertions.

The full dedicated PostgreSQL correctness suite is run using the original Phase
5B file set and assertions, with output redirected to a new Phase 5F evidence
file. It includes pre-provider and post-provider expiry, stale/concurrent CAS,
replay, rollback, legacy/categorical reload, ownership, immutable templates,
accounts, Quiz and real HTTP persistence. Final counts are recorded below.

Dedicated correctness verification: **134/134 PASS**, including **69/69 real
PostgreSQL cases**, zero failures or skips. The live expiry-before-input,
expiry-during-provider-wait, stale-after-model-wait, replay, concurrent expiry/CAS
and rollback cases all pass. Schema/metadata, accounts and Quiz cases also pass.

## Benchmark method

The Phase 5B benchmark implementation is reused exactly. The wrapper
`scripts/phase5f-harness.mjs` verifies its original source digest, changes only
phase labels/output paths/baseline metadata and relocates module imports into
ignored scratch. Historical Phase 5B artifacts are not overwritten.

The fresh BEFORE run finished before any runtime source edit. The AFTER run is
performed after correctness/build verification, without concurrent DB test work.
Both use:

- Windows x64 / Node v24.19.0; Prisma/client/adapter 7.10.0; pg 8.23.1.
- The same dedicated PostgreSQL database, session pooler, trusted CA and UTC pool
  configuration. The direct endpoint is not used.
- CC-01 v6, IDENTITY_CLAIM, identical authored fixture, sanitized Thai text and
  PCM WAV, with fresh persisted sessions outside timed intervals.
- Sequential alternating text/voice cohorts, two warmups and ten measured turns
  per cohort. Median p50 and nearest-rank p95; at n=10 p95 is the sample maximum.
- Real PostgreSQL with deterministic mock model/STT/TTS and zero paid provider
  requests. These are service-path timings, not browser/auth or live speech/model
  latency claims.

Raw samples:

- `postgres-phase5f-before.json`
- `postgres-phase5f-after.json`
- `postgres-phase5f-comparison.json` (derived boundaries/counts/percentiles)

The BEFORE run reproduces Phase 5B semantics: text 48 statements / 3 GETs and
voice 59 statements / 4 GETs. Each SAVE has 15 statements. Fresh measured BEFORE
latency is text p50 4,629.68 ms / p95 4,646.59 ms and voice p50 5,695.10 ms /
p95 5,722.81 ms. This fresh pair is used for improvement calculations rather than
combining an old network sample with a new one.

## Final results

Both fresh benchmark runs pass: 24 turns each (2 warmups + 10 measured per
cohort), no retries/fallback, no authoritative evaluation from free text. The
AFTER run begins after all correctness and build activity has finished.

| Metric | BEFORE (Phase 5B semantics) | AFTER (Phase 5F) |
| --- | ---: | ---: |
| GET SELECTs / total statements | 8 / 11 | 1 / 4 |
| GET transaction controls | 3 | 3 |
| Text total statements / turn | 48 | 27 |
| Voice total statements / turn | 59 | 31 |
| Text GET calls / turn | 3 | 3 |
| Voice GET calls / turn | 4 | 4 |
| Text transaction controls / turn | 12 | 12 |
| Voice transaction controls / turn | 15 | 15 |
| SAVE statements / reload SELECTs | 15 / 8 | 15 / 8 |

All ten measured turns in each cohort have those exact counts. Statement
reductions come entirely from the seven SELECTs removed per GET. No logical
read, provider wait freshness check, transaction control or SAVE query is removed.

Measured total service latency, milliseconds:

| Cohort/run | min | p50 | p95 | max |
| --- | ---: | ---: | ---: | ---: |
| Text BEFORE | 4,604.49 | 4,629.68 | 4,646.59 | 4,646.59 |
| Text AFTER | 2,573.56 | 2,587.16 | 2,599.36 | 2,599.36 |
| Voice BEFORE | 5,676.66 | 5,695.10 | 5,722.81 | 5,722.81 |
| Voice AFTER | 2,941.65 | 2,979.45 | 2,992.60 | 2,992.60 |

Observed p50 reduction: **44.12% text**, **47.68% voice**. Observed p95 reduction:
44.06% text and 47.71% voice. These are measured results for this matched
service/mock-provider workload, not a guarantee for production/live speech or
model latency. Cloud RTT, cache state and the small sequential n=10 sample remain
limitations; the structural statement reduction is deterministic.

GET boundary p50 falls from 1,058.85 to 383.02 ms in text and from 1,059.74 to
383.90 ms in voice. SAVE boundary p50 is 1,435.90 ms text / 1,437.12 ms voice,
versus 1,449.48 / 1,450.71 ms before; the implementation and statement count are
unchanged, so the small drift is not claimed as a SAVE optimization.

**Remaining bottleneck:** SAVE is still the slowest individual aggregate
operation, with its eight-SELECT reload and 15 total statements. Its median share
of measured total latency is 55.47% for text and 48.25% for voice. Combined GET
time per voice turn is 1,536.32 ms p50, slightly greater than that turn's one SAVE;
it would be inaccurate to call SAVE a majority of all voice persistence time.
Transaction-control round trips also remain. No SAVE optimization starts here.

Production build (including pinned Prisma generation), root typecheck, Prisma
validate, client audit (69 JavaScript artifacts), syntax checks, diff checks and
private-value checks pass. The original generated-client digest is unchanged.
No decoder/parity mismatch or runtime regression is found in the executed suites.

Tracked runtime changes are confined to the GET dispatch in
`prisma-repository.ts`, plus the new reader module. Complete SAVE/writeChildren
and decoder source equality are verified. The schema, dependencies, Core,
providers and other runtime files retain their Phase 5E hashes.

## Reproduction and limits

With the existing private dedicated-test environment configured:

```text
node scripts/phase5f-harness.mjs benchmark before
# Apply only the approved GET promotion.
npm run typecheck
npm test -- --maxWorkers=1
node scripts/phase5f-harness.mjs correctness
node scripts/verify-aggregate-runtime.mjs
npm run prisma:validate
npm run build
npm run audit:client
node scripts/phase5f-harness.mjs benchmark after
node scripts/summarize-postgres-phase5f.mjs
git diff --check
```

The BEFORE command requires the exact baseline runtime source and will reject
the promoted source. Benchmark/correctness output files are protected against
accidental overwrite. The parity harness creates fresh dedicated fixtures and
retains all previous data, including deliberately malformed test rows. No runtime
or production database migration, cleanup, deployment or paid provider call is
part of this phase. Private environment, rows, SQL parameters and credentials
are never printed in the reports.

Offline original MySQL row contents remain unverified as documented in Phase 5E.
The acceptance contract covers supported Core-origin states and validated legacy
snapshots. Malformed/external rows are rejected, not silently made compatible.

The source integration and evidence remain local for review on
`feat/rule-based-evaluation`; HEAD is still
`ec5b180313ca347e3ff9e9f5ace2034685e706d3` with the reviewed working-tree GET
change identified by the recorded source digests. No commit, push or deployment
is performed by Phase 5F, and earlier unrelated dirty files are preserved.
