# Phase 5G — post-CAS SAVE reload shadow proof

Scope: prove equivalence and recommend a decision. Phase 5F remains the
authoritative runtime. SAVE is not replaced in this phase, and no implementation
approval is inferred from approval to perform this proof.

## Baseline and authority

The baseline is the exact Phase 5F working-tree runtime, identified by the source
digests in `postgres-phase5f-parity.json`; Git HEAD remains
`ec5b180313ca347e3ff9e9f5ace2034685e706d3`. The proof checks those digests before
running and hashes all runtime/schema/package files again afterward, including
the uncommitted Phase 5F reader module.

Prisma/client/adapter-pg remain 7.10.0 and pg remains 8.23.1. Tests use the guarded
dedicated PostgreSQL database, session pooler and trusted CA. No runtime database,
schema migration, direct-endpoint switch or paid provider call is involved.

`scripts/shadow-aggregate/save-reload.mjs` wraps only the dedicated repository
instances used by the proof. It observes the real, unchanged SAVE method:

```text
same Read Committed transaction, same controls/budgets
  conditional UPDATE/CAS (unchanged linearization point)
  original Prisma full include reload -> authoritative row
  explicit SELECT shadow probe -> comparison only
  original decode(authoritative row)
  current.revision = expectedRevision
  original assertUpdate
  original writeChildren differential writes
  original beforeCommit fault seam
COMMIT, or original rollback on failure
```

The candidate is never supplied to the production decoder/validator/writer path.
The harness separately runs the **existing** exported assertUpdate on detached
copies of both decoded snapshots to compare validation verdicts. It does not
introduce a replacement validator or weaken any existing check. A unit test makes
the candidate disagree deliberately and proves the original row still controls
the authoritative write.

## Necessary scope distinction: GET is not a direct drop-in

Phase 5F GET intentionally filters by session ID **and owner ID**. The existing
SAVE reload filters by ID only, after a successful CAS, then validates owner and
all immutable identity fields using assertUpdate.

Using the GET helper with `snapshot.ownerId` without adaptation is not equivalent:
an owner-tampered snapshot can win the revision CAS, but the owner-filtered SELECT
returns null instead of loading the original owner for SESSION_IDENTITY_IMMUTABLE.
Borrowing the owner from the baseline eight-SELECT row would hide the very
dependency this proof is trying to remove.

The tested candidate therefore retains the entire proven aggregate SQL/codec and
existing ordering guard, but changes **only the fixed root predicate**, inside
the proof's post-CAS lookup:

```text
GET:         WHERE s.id=$1 AND s."ownerId"=$2
SAVE reload: WHERE s.id=$1
```

The session ID remains a bound parameter. No owner, template, row or identity
value is borrowed from the reference result. This mirrors the original SAVE
lookup, rather than moving identity validation into a new WHERE clause. The
ordinary GET entry point stays owner-scoped. The old assertUpdate remains the
authority for identity/history/opportunity/result validation and rolls the
entire header CAS back when validation fails.

This is a bounded lookup-scope adaptation, not a new validator, digest, schema
field, trigger, CAS CTE, savepoint, isolation change or transaction redesign.
Any eventual implementation must keep this SAVE-only scope confined to the
post-successful-CAS branch; an unchanged call to the owner-filtered GET helper
is not the recommended implementation.

## Why same-transaction comparison is meaningful

The successful conditional UPDATE holds the parent session row lock until commit
or rollback. Supported writers acquire that same CAS lock before changing
children. While this SAVE holds the lock, a competing supported writer cannot
commit a different child history between the original include reads and the
candidate statement. Published template configuration is immutable.

The reload intentionally sees the **new header revision R+1 and mutable header
fields**, with the **old children/result before writeChildren**. Both readers
must reproduce that internal snapshot exactly. The existing algorithm resets
only the detached `current.revision` to R before assertUpdate. The proof checks
row parity before that reset and domain/validation parity with the same reset.
It does not expose the transient post-CAS snapshot to a frontend or result API.

Stale CAS never reaches either reload. Replay without a new SAVE never probes.
Concurrent duplicate attempts return the existing receipt after the loser rolls
back, following the unchanged Core logic.

## Required-case coverage

Live proof cases include:

- Normal dialogue, opportunity finalization, event append, completion and result
  creation through the actual Core and unchanged repository SAVE.
- Explicit critical failure and the same retry path after an injected failure.
- Expiry-only save, competing expiry reads and unchanged children.
- Action/turn replay with no extra SAVE reload; different-request and
  duplicate-turn concurrent CAS; direct stale repository save with no reload.
- All five existing beforeCommit SAVE fault scenarios: decision, transition,
  critical, dialogue and safe-result. Each verifies full persisted snapshot
  rollback, then retries the same action/turn successfully.
- A real child foreign-key failure after preceding action/opportunity writes,
  requiring the action, opportunity and header revision to roll back together.
- The CREATE use of the same fault seam, verifying it does not reach SAVE reload.
- Owner identity, message history, opportunity identity, finalized opportunity
  and result tampering, with matching old assertUpdate errors and full rollback.
- Core-derived historical/categorical snapshots, default/normal/scam variants,
  lifecycle/result states, legacy missing assessment, categorical null fields,
  JSON null/SQL NULL/nested/empty values and non-UTC/pre-epoch timestamp cases.

The snapshot corpus uses revision-only trusted-port saves to exercise old
persisted shapes, including terminal results; these are test probes, not new
learner actions or new Core lifecycle behavior. Its original fixture creation
can reverse physical insertion while retaining supported ordering keys.

Four intentionally malformed ordering fixtures are separate from supported-state
parity. Phase 5F GET and the candidate's **existing** ordering guard must reject
them. The original SAVE remains authoritative during the shadow run and is forced
to roll back at the existing fault seam if it reaches it; row bags and headers
are checked afterward to ensure there was no silent repair or persisted change.
The proof does not assert that old direct repository SAVE already rejected every
malformed external snapshot. Such rows are outside the Phase 5E contract.

## Evidence and decision

Detailed bounded evidence is written to `postgres-phase5g-save-proof.json`.
It contains case names, statement counts, mismatch categories, validation error
categories and source digests. No raw rows, SQL, IDs, credentials or provider
payloads are logged. Baseline and candidate use the same transaction; candidate
SELECTs are observed separately from the original eight-SELECT reload.

Final live proof: **PASS**, 2026-10-24 18:18:38.021–18:25:46.538 UTC.
Recommendation: **IMPLEMENT_SAVE_ONE_SELECT**, using the SAVE-only ID-scoped
lookup described above and all existing validation/writer logic unchanged.

| Check | Result |
| --- | --- |
| Supported persisted-row snapshot comparisons | 117/117 exact row and domain parity |
| Post-CAS revision equivalence | 117/117 |
| Original include reload SELECTs | 8 per supported comparison |
| Candidate reload SELECTs | 1 per supported comparison |
| Existing validator verdicts | 117/117 match |
| Live semantic cases | 22/22 PASS |
| Historical/shape corpus | 67 successful save probes from 61 fixture cases, including additional non-UTC cases |
| Stale CAS attempts | 4; none invoked either reload |
| Malformed ordering | 4/4 candidate/GET rejections; all original row bags/headers preserved after rollback |
| Runtime and proof source digests | unchanged throughout the run |

There are 121 total shadow comparisons: 117 supported-row comparisons and four
separate expected malformed rejections. The latter are **not** claimed as exact
row parity. Of the 117 matching validation verdicts, 112 are ACCEPT; the remaining
five match SESSION_IDENTITY_IMMUTABLE (1), HISTORY_IMMUTABLE (1),
OPPORTUNITY_IMMUTABLE (2), and RESULT_IMMUTABLE (1). Their authoritative SAVE
attempts reject and roll back as expected.

The owner-tamper probe confirms the unadapted owner-scoped GET returns null,
while the ID-scoped candidate exactly matches the original persisted row and
produces the same SESSION_IDENTITY_IMMUTABLE verdict. This integration condition
must not be omitted from a future implementation.

The decision rule is strict: IMPLEMENT_SAVE_ONE_SELECT requires exact supported
row/domain parity, matching unchanged-validator verdicts, post-CAS revision
equivalence, successful CAS/rollback cases, malformed rejection and unchanged
runtime source. Any need for a replacement validator or weakened history check
requires DEFER_SAVE_OPTIMIZATION and freezing further persistence optimization.

## Verification and performance limits

New unit tests cover fixed query scope/binding, rejection of an unexpected query,
candidate non-authority on mismatch, and the stale-CAS no-reload rule. Full offline
regression/typecheck are run alongside the bounded real PostgreSQL proof.

Verification: new shadow unit tests **4/4 PASS**; full offline regression
**1,030 passed, 69 skipped** (67 files pass, 6 skipped); root typecheck, Node
syntax checks, diff/whitespace and private-value scans pass. The 69 skipped live
tests are not counted as newly passed by this phase; Phase 5F's full 69/69 live
baseline is preserved, while Phase 5G runs the additional bounded real database
proof described above. No production build, Prisma generation or full live-suite
rerun is needed to integrate this proof-only harness because no runtime/schema
source changes are made.

No SAVE implementation or matched AFTER performance benchmark is performed in
this proof phase. An extra SELECT in the shadow harness adds diagnostic work; it
is not a performance result for a replacement SAVE. Phase 5F remains the measured
baseline: normal dialogue SAVE is 15 statements with an eight-SELECT reload.
There is no claim of SAVE or text/voice latency improvement here.

After a separate implementation approval, the bounded change to review would be
only the ID-scoped post-CAS reload, preserving current.revision reset,
assertUpdate, writeChildren, fault seam, exception behavior and transaction
controls. It would then require full correctness/regression verification and the
same matched Phase 5F benchmark before reporting any performance gain.

Reproduce with private dedicated-test configuration already in place:

```text
npm run typecheck
npx vitest run tests/save-reload-shadow.test.ts --maxWorkers=1
node scripts/prove-save-reload.mjs
npm test -- --maxWorkers=1
```

No schema, migration, Core, decoder, provider, frontend or protocol change is made.
DECISION_RULES_V1, trainingScore=null and backend-only authority remain intact.

The five Phase 5G files (proof runner, shadow observer, unit tests, report and
JSON evidence) remain local and unstaged on `feat/rule-based-evaluation` at the
same HEAD. No commit, push, deployment or SAVE implementation is performed.
