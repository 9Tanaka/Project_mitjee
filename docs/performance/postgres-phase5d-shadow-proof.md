# Phase 5D — one-SELECT aggregate shadow proof

Decision: **DEFER authoritative GET promotion.** Native Prisma joins are supported
by the pinned toolchain, but exact parity is not established for every persisted
snapshot accepted by the existing schema. A repository-scoped explicit SQL
candidate is also tested; it remains proof-only.

## Contract and isolation

- Baseline runtime commit: `ec5b180313ca347e3ff9e9f5ace2034685e706d3`
  (Phase 5B). The local Phase 5C analysis is the acceptance contract.
- Exact versions: Prisma, Prisma Client and adapter-pg `7.10.0`; pg `8.23.1`.
  The harness refuses other versions. No package or lockfile changes.
- Proof host: Windows x64, Node `v24.19.0`; dedicated Supabase PostgreSQL test
  database through its session pooler, using the existing trusted-CA adapter.
- The original generated client and `PrismaTrainingRepository` remain
  authoritative. No runtime source, schema, generator or dependency is changed.
- Candidates live under `scripts/shadow-aggregate/`; no authoritative `src/`
  module imports them. They only read dedicated fixtures and compare results.
- Candidate adapters reject write statements. Differential reads additionally
  use read-only Repeatable Read transactions. Fixture creation and concurrency
  writes use the original repository/Core, never candidate results.
- Private environment is loaded without printing values. The existing dedicated
  diagnosis-database safeguards and trusted CA handling apply. Only the session
  pooler is used. This is not a production-database or provider benchmark.
- The JSON evidence contains bounded case names, mismatch categories, statement
  counts and source hashes. It contains no rows, raw SQL, parameters, credentials,
  connection strings or caller dialogue.

The evidence file records run timestamps, exact versions, the proof source hashes,
hashes of all tracked runtime/schema/package files and the original generated
client digest. Local documentation changes predating this phase are excluded
from this proof's runtime comparison.

## Native join capability

`native.mjs` copies the schema into ignored `test-results/phase5d-native/`, adds
`previewFeatures = ["relationJoins"]`, and generates a separate client there.
It does not edit `prisma/schema.prisma`, `prisma.config.ts`, or
`src/generated/prisma`. A separate TypeScript probe checks training `join` and
Quiz `query` strategy arguments with the exact installed packages.

Both isolated generation and typecheck succeed. The actual training aggregate
query executes one SELECT with `relationLoadStrategy: "join"`. Explicit
`"query"` retains eight SELECTs. In this isolated client, omitting the strategy
also selects the join strategy. Enabling the generator feature globally would
therefore affect other relation includes unless they explicitly retain `query`.

| Read configuration | Aggregate SELECTs | Full existing RR transaction statements |
| --- | ---: | ---: |
| Original authoritative reader | 8 | 11 |
| Native isolated `join` | 1 | Not used as the final fallback transaction sample |
| Native isolated `query` | 8 | Not separately sampled |
| Explicit SQL shadow candidate | 1 | 4 |

The full transaction samples retain BEGIN, isolation setup and COMMIT. Additional
test-only read-only/timezone SET statements are outside the delegate SELECT
counts. These are statement counts, **not latency measurements or improvement
claims**. The authoritative GET still executes its original transaction.

## Differential method and coverage

`oracle.mjs` extracts the exact existing include and decoder from the baseline
source into ignored scratch. It checks the decoded reference against the actual
repository's `get` result for every static comparison. It does not reimplement
the domain decoder to make the candidate pass.

Each candidate is compared at both levels:

1. Full Prisma `AggregateRow`, including every returned scalar and own-property
   presence, relation array order, SQL-column Date types and null fields.
2. Domain snapshot produced by the unchanged baseline decoder, compared with the
   actual authoritative repository result.

The comparator checks signed zero with `Object.is`; it does not use JSON
serialization as the equality oracle. Mismatch output is limited to categories.

Dedicated fixtures exercise:

- Historical template versions 1–6, default/normal/scam variants, legacy numeric
  results and categorical `DECISION_RULES_V1` results.
- ACTIVE, COMPLETED, FAILED, ABANDONED and EXPIRED sessions; PASSED,
  NEEDS_PRACTICE, CRITICAL_FAILURE and UNASSESSED outcomes.
- No result versus a present result with null fields; omitted legacy assessment
  versus categorical `assessment: null`; categorical `trainingScore: null`.
- Empty/one/many child relations, nested JSON, empty objects/arrays, SQL NULL and
  JSON null stored in separate fixture rows. Their storage distinction remains
  intact even where the Prisma JavaScript representation is the same `null`.
- Pre-epoch timestamps, leap-day millisecond boundaries and SQL session zones
  UTC, Asia/Bangkok and America/New_York. Nested JSON date strings stay strings.
- Reversed physical child insertion with unchanged logical ordering keys.
  A bounded physical-order audit verifies that the test really inserted messages
  in a different order from their logical positions.

Full case-by-case outcomes and coverage flags are in
`postgres-phase5d-proof.json`. The final run contains 62 fixtures and 70
fixture/timezone comparisons per candidate: 67/70 native exact matches and 70/70
explicit exact matches, before the separate tied-order tests. There were no read
or decoder exceptions, and the extracted oracle matched actual repository output
in every comparison. Every candidate comparison executed exactly one SELECT.

## Mismatches and codec findings

The native join loses signed zero in a dedicated SQL Float stress fixture:
baseline `-0` becomes `0` through the JSON aggregate representation. This is a
scalar mismatch at both row and domain levels in all three tested timezones.
The fixture is a codec stress case, not a claim that ordinary Core scoring emits
negative zero. The requested exact scalar contract includes it.

The explicit fallback is one fixed parameterized SELECT with independent
correlated relation aggregates. Only the two owner/session values are bound;
neither can change the SQL. Float columns are carried as text and hydrated back
with `Number`, preserving signed zero. Known SQL timestamp columns alone are
hydrated as Dates with their explicit offsets. Nested JSON is not transformed.
Null fields are retained; no null-stripping operation is used.

This resolves the native numeric codec issue on the untied differential
fixtures. It does **not** resolve the ordering contract below.

## Ordering proof and blocker

The authoritative include orders actions by revision, opportunities/events/
messages by position, and turn receipts by committedRevision. Existing database
constraints do not make every one of those relation ordering keys unique.

Dedicated reversed-insertion fixtures then give every member of one relation an
equal ordering key, one relation at a time, and repeat each comparison three
times. The explicit candidate can return the same complete members in a
different order for opportunities, events and receipts. Messages happened to
match in this run. Stable repetition of one plan is not a total-order guarantee.

The evidence separately records exact ordered mismatches and full member parity
ignoring only the outer relation order. Timestamp/value mismatch categories from
index-by-index comparison must not be misread as corrupted timestamps when
different members occupy those indexes.

| Tied relation | Exact order matches, 3 repetitions | Full members ignoring outer order |
| --- | ---: | ---: |
| SessionOpportunity / position | 0/3 | 3/3 |
| TrainingEvent / position | 0/3 | 3/3 |
| TrainingMessage / position | 3/3 | 3/3 |
| DialogueTurnReceipt / committedRevision | 0/3 | 3/3 |

The native reader is rejected by the earlier scalar-parity gate, so these
tie/concurrency tests use the explicit fallback. Baseline `TrainingAction`
revision ordering is already unique per session and is not given an invalid
duplicate-revision fixture. No extra constraint is introduced.

No secondary sort key, schema constraint or normalization was added. Returning
an invented deterministic order would change the acceptance contract. Exact
parity for tied keys is therefore an unresolved promotion blocker.

## Concurrency, ownership and expiry

The coherence test starts the same Repeatable Read read scope used by GET,
reads once, commits a normal Core quit action on a different connection, and
reads again. Both baseline and selected candidate must keep their first complete
snapshot; a fresh authoritative read outside that scope must observe the newer
revision and ABANDONED state. No candidate row is ever submitted to SAVE.

Wrong owner and missing session tests must return null for both readers.
The expiry test verifies that a candidate read does not expire or mutate an
ACTIVE session, then invokes the unchanged Core clock/expiry path and compares
the resulting authoritative EXPIRED snapshot with a new candidate read.

These tests cover coherent reader snapshots. Existing CAS, replay, append-only
validation, rollback and immutable-template behavior are left in their current
implementation; SAVE was not redesigned in this phase.

## Quiz and non-training impact

The runtime source include audit finds relation includes in the training and
Quiz repositories. Quiz `get`, `recent` and `latestPreTest` are exercised with
the existing filters/order/limit, the original include and decoder, plus a fixture
whose receipts are inserted out of revision order.

For each operation, the original client and isolated explicit `query` strategy
execute two SELECTs. Isolated `default` and explicit `join` execute one SELECT.
Row/domain comparison results are recorded for all three operations and all
four strategies: all 12 checks match. Receipt ordering is checked in the complete
rows. The live Quiz sample is one dedicated attempt with three receipts; it is
not an exhaustive proof over every Quiz bank or historical attempt.

There is no current runtime Quiz impact: its generator/client/source are
unchanged. A future native-feature rollout would need explicit strategy scoping
on every non-training include and on SAVE's existing reload, rather than relying
on the changed default. Explicit repository SQL would avoid that generator-wide
change, but still requires resolving the tied-order contract before promotion.

## Reproduction and recommendation

With the existing private dedicated PostgreSQL diagnosis environment configured:

```text
node scripts/prove-postgres-aggregate.mjs
npx vitest run tests/shadow-aggregate.test.ts --maxWorkers=2
npm run typecheck
npm test -- --maxWorkers=2
```

Required private configuration names are `POSTGRES_TEST_DATABASE_URL`,
`DATABASE_URL`, `DIRECT_URL`, and either `POSTGRES_TEST_TLS_CA` or
`POSTGRES_TEST_TLS_CA_PATH`. The existing guard uses the runtime URL only for
test-target separation and the direct URL only to validate endpoint identity;
neither endpoint is printed, and the proof reads/writes only the dedicated test
database via the session pooler. It does not switch the runtime endpoint.

The script uses only the pinned locally installed toolchain. Scratch generation
and extracted decoder files stay ignored. Re-running creates new dedicated
fixtures with fresh identifiers; no destructive cleanup is performed.

Recommendation: **DEFER**. Native capability is proven and explicit SQL is a
viable shadow fallback for the codec mismatch, but exact tied-array parity has
not been proven. Promotion would first need an explicitly approved ordering
contract for ties and additional proof against that contract. This phase neither
promotes GET nor implements SAVE optimization. `DECISION_RULES_V1`, backend
authority, critical-event authority and `trainingScore = null` remain unchanged.

## Final verification record

- Live shadow run: **COMPLETE**, 2026-10-24 15:47:47.152–15:57:07.881 UTC.
  COMPLETE means evidence collection finished, not that promotion is approved.
- Isolated native generator/typecheck: exit 0, exact pinned versions.
- Untied row/domain comparisons: native 67/70 exact, explicit 70/70 exact.
- Historical versions: 1–6. All declared status/outcome/variant coverage flags
  and empty/one/many relation-cardinality checks are present in the JSON.
- Wrong owner and missing root: null parity, 2/2.
- Writer-between-read coherence: baseline and explicit fallback pass. Both retain
  the initial complete snapshot while a new authoritative read observes the
  committed newer revision/ABANDONED status.
- Expiry: candidate remains read-only; unchanged Core creates EXPIRED and the
  subsequent candidate domain snapshot matches it.
- Reversed-insertion audit: 18 message rows; physical order differs from logical
  positions, while untied reference/candidate comparison still matches.
- SQL NULL / JSON null: stored distinction verified after all candidate reads.
- Candidate write attempts: 0. All protected runtime/schema/package hashes and
  the authoritative generated-client digest remain unchanged during the proof.
- Shadow unit tests: 6/6 pass.
- Full offline regression: 1,012 pass, 69 skipped (63 files pass, 6 skipped).
  Skipped live suites are not counted as live regression passes.
- Root TypeScript typecheck and Node syntax checks for all new scripts: pass.
- Prisma validate: pass. Production build: pass, including the normal pinned
  Prisma generation step. Client audit: pass (69 JavaScript artifacts).
- A post-build digest check also confirms that the tracked protected source,
  proof script versions and regenerated authoritative client still match the
  recorded evidence. No generated client is staged.
- No lint script/configuration exists in this repository. No dependency was added
  to introduce a separate lint tool in this proof phase.
- Whitespace and private-value/PEM checks are performed on the new proof files;
  generated scratch remains ignored. Existing unrelated dirty documentation is
  preserved, with no file staged or committed by this phase.
- Branch/HEAD remain `feat/rule-based-evaluation` /
  `ec5b180313ca347e3ff9e9f5ace2034685e706d3`. This phase leaves local proof
  artifacts for review; there is no GET promotion, SAVE change, commit or push.
