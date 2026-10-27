# Phase 5E — supported persisted-state ordering contract

Scope: ordering-contract resolution and explicit-reader shadow verification only.
The authoritative Prisma GET, SAVE, schema, relation sort expressions and provider
configuration are unchanged. No native-join promotion is considered.

Recommendation: **PROMOTE_EXPLICIT_GET_SHADOW_TO_RUNTIME**, as the next separately
reviewed phase for the supported-state contract below. This is a recommendation,
not a promotion performed by Phase 5E. No ordering migration is justified by the
supported-writer evidence.

Baseline: Phase 5B runtime `ec5b180313ca347e3ff9e9f5ace2034685e706d3`, together
with the local Phase 5C/5D analysis and proof. Prisma/Client/adapter-pg remain
7.10.0, pg remains 8.23.1. Execution uses Windows x64 / Node v24.19.0 and the
existing dedicated PostgreSQL test database through the session pooler/trusted CA.

## Writer-path map

All positions below are scoped **per session and per relation**. They are not
global identifiers, timestamp order, action order or AI output.

| Relation/key | Domain producer | Persistence assignment | Classification |
| --- | --- | --- | --- |
| SessionOpportunity.position | `openStateOpportunities` appends a definition once, after its backend eligibility/signal guard | `writeChildren`: `for (const [position, o] of s.opportunities.entries())`; updates retain the same index | GUARANTEED_UNIQUE_BY_SUPPORTED_WRITERS |
| TrainingEvent.position | `TrainingCore.apply` appends backend-validated event codes; several events can belong to one action | `writeChildren`: `s.events.entries()`, writing only indexes beyond the immutable old prefix | GUARANTEED_UNIQUE_BY_SUPPORTED_WRITERS |
| TrainingMessage.position | `apply` appends user then character for a normal dialogue turn, or one character for an opening/state turn | New message offset + previous message-array length; formerly `s.messages.entries()` in the historical writer | GUARANTEED_UNIQUE_BY_SUPPORTED_WRITERS |
| DialogueTurnReceipt.committedRevision | One receipt per `apply` dialogue commit, assigned `session.revision + 1`; snapshotRevision is the checked expected revision | `writeChildren` copies that Core value; the same transaction increments the session revision through CAS | GUARANTEED_UNIQUE_BY_SUPPORTED_WRITERS |

The complete authoritative entry-point graph is:

```text
HTTP / application / realtime commands
  -> TrainingApplicationService
     -> Core.start -> repository.create -> writeChildren
     -> Core.submit -> Core.apply -> repository.save -> writeChildren
     -> DialogueOrchestrator.sendMessage -> Core.commitDialogueTurn -> apply
     -> DialogueOrchestrator.openCall -> Core.commitCharacterOpening -> apply
     -> Core.resume -> expiry-only repository.save -> writeChildren (no new children)

Voice.send -> STT -> TrainingApplicationService.message -> same dialogue path
Voice.speak / TTS replay -> owned reads only
measuredRepository -> transparent delegation to the same repository port
```

Account and Quiz repositories write separate aggregates. Model, STT and TTS
providers have no training-repository write access. No other active application
code calls training `repository.create/save` outside Core; the observability
wrapper delegates without changing snapshots.

Relevant source anchors:

- `src/core.ts`: start 64; expiry/resume 80; dialogue commit 109; opening commit
  122; apply 134; event append 167; messages 194/198; receipt 199; CAS save 216.
- `src/persistence/prisma-repository.ts`: create 138; save 162; writeChildren 190;
  opportunity index 195; event index 205; receipt copy 212; message batch 215–220.
- `src/domain/persistence-contract.ts`: revision/identity/prefix/opportunity
  validation 46–64; `src/domain/session-opportunity.ts`: guarded append 7–23.
- `src/dialogue/orchestrator.ts`: commit sites 106/140; provider retries finish
  before either commit site. `src/application/voice-service.ts` delegates STT
  text and committed-turn replay to the same application message operation.

## Proof by construction and induction

**Base case.** Core.start constructs empty dense arrays, then appends eligible
opportunities. `repository.create` enumerates each position-bearing array from
zero. An existing session ID cannot be created twice: the parent identity and
the atomic create transaction reject the loser. Receipts begin empty.

**Append case.** Given dense unique old positions 0..n-1, new events and messages
are written at n..n+k-1. Opportunity enumeration assigns one distinct index to
each array member; old member identities remain at their old indexes. Core does
not remove/reindex children. `assertUpdate` rejects changed or truncated history
prefixes and changed opportunity identities/order. Finalization updates an
opportunity at its existing index rather than appending another copy.

**Receipt case.** Given session revision R, `apply` requires the command revision
to be R and appends at most one receipt with committedRevision R+1. Its action
records revision R. SAVE advances exactly R -> R+1 with a conditional update in
the same transaction. Every previously committed receipt is <= R. Thus the new
receipt cannot equal a previous receipt's committedRevision. Explicit actions
and expiry can create revision gaps; receipt revisions need not be contiguous.

These guarantees require a valid initial Core-origin snapshot and the supported
writer lineage. They do not follow merely from the Prisma types or SQL schema.

## Replay, concurrency and lifecycle

| Path | Why no duplicate ordering key is committed |
| --- | --- |
| Same action/turn replay | Prior action fingerprint/turn receipt is returned; no child append/save occurs |
| Provider retry/fallback | Both attempts finish before a single Core commit; no receipt is created for an unsuccessful provider attempt |
| Two different requests at revision R | CAS/parent row lock admits one write; the other has no child writes and receives a revision conflict |
| Concurrent duplicate request | One commit wins; Core reloads the matching committed action and returns duplicate for the loser |
| Rollback after child writes | Header revision and all children roll back together; retry may reuse a rolled-back position because no earlier row with that position committed |
| Opening/state-turn retry | Backend-owned turn ID and receipt checks return the existing opening; a state turn is not appended twice |
| Resume | Ordinary resume preserves arrays and does not refresh the idle clock |
| Expiry | Clock-triggered save increments revision and changes lifecycle header only; children/receipt keys are unchanged; competing expiry saves use CAS |
| Critical failure / abandonment / completion | Use the same append/CAS path; terminating a session does not reset ordering counters |
| Voice reconnect / TTS replay | Voice uses the same committed turn ID and message path; TTS presentation does not create a new training turn |

No timing assumption, timestamp uniqueness or AI confidence is used in this proof.

## Historical writers, migrations and imports

The automated audit traverses all locally retained Git refs for the two writer
files, including archived pre-refactor history, rather than examining only the
current branch head. All discovered writer revisions retain array enumeration
for opportunities/events and either enumeration or old-length-plus-offset for
messages. All retained Core revisions have one receipt append site, R+1
assignment, expected-revision guard and CAS save. The JSON evidence contains each
commit, source digest and bounded assignment facts. Static checks are supporting
evidence; the construction argument and dynamic tests establish the contract.
The audit checks 12 repository source snapshots (current HEAD plus 11 locally
retained change commits) and 9 Core snapshots (current plus 8 change commits).
Repeated source content is retained in the provenance record rather than claimed
to be a distinct implementation.

The retained MySQL baseline at `91e707f376372aed5bdf415dd7bbb32d58583536` uses
the same assignments. Archived MySQL persistence tests create ordinary legacy
sessions through Core/repositoryHarness. They also contain explicitly adversarial
direct persistence tests; those are not new application writer paths.

The four archived MySQL migrations and the active PostgreSQL baseline contain
schema/constraint/trigger definitions. The categorical migration adds assessment
and result columns; it does not rewrite any position or receipt revision. No
application data importer, historical-session backfill, COPY/LOAD DATA or
ordering-key repair path is implemented in the active repository. The database
deployment script executes schema migrations only. No schema migration is run
in Phase 5E.

Arbitrary SQL, unvalidated restore/import, and hand-built calls to the trusted
repository port can bypass the Core-origin precondition. In particular the port
does not independently validate every supplied receipt revision. Such snapshots
are **external input**, not evidence that ordinary Core operations permit ties.
A future importer must validate the contract explicitly before treating its
output as a supported training aggregate.

### Locally retained MySQL data

Read-only filesystem inspection confirms both old `mitjee_test` and
`mitjee_test_verification` InnoDB directories exist on C:, each with the four
relevant `.ibd` table files. No MySQL/MariaDB server is running and no dedicated
MySQL test connection is configured. No logical SQL dump was found in the
inspected repository/backup artifacts.

The original data files, server configuration and private environment are not
changed. A logical duplicate-row scan of those offline InnoDB data files is
**NOT RUN**; file presence/schema/source history cannot prove their row contents.
Starting/recovering the original server would write to its data directory, so it
is not done under this read-only inspection. Their actual data-quality status
remains unverified. They are not imported into the PostgreSQL supported corpus.

## Supported persisted-state contract

1. A supported aggregate originates from Core.start and subsequent successful
   Core commits using the current or audited historical writer lineage. A
   preserved legacy snapshot must satisfy the same structural invariants.
2. Each position-bearing relation has distinct dense positions 0..count-1 within
   its session. Relation order is the existing ascending position order.
3. Each receipt's committedRevision is distinct within its session, equals its
   snapshotRevision+1, corresponds to its dialogue action revision+1, and is no
   greater than the session revision. Gaps are allowed.
4. Append-only history and opportunity identity order are preserved. New keys
   are assigned only within the existing atomic CAS transaction.
5. Tied rows are malformed/unsupported persisted states under this contract.
   The current reader's ability to decode them does not make a raw SQL mutation
   an authorized Core writer path. There is no silent secondary ordering rule.

The three position keys are assigned by the adapter; receipt revision uniqueness
depends jointly on Core and CAS. This is an application writer invariant, **not
a new database-enforced uniqueness guarantee**. No schema constraint, sorting
normalization, SAVE validation change or automatic data repair is introduced.

For a future promotion, retain the explicit repository-scoped SQL candidate.
Do not silently repair/sort malformed rows or infer missing provenance from
their absence in a test database. An actual target-data audit remains a rollout
check; unvalidated historical/external data must not be assumed compliant.

## Dedicated PostgreSQL evidence and supported parity rerun

`scripts/prove-postgres-ordering.mjs` performs a read-only Repeatable Read scan
over all four existing test relations **before** adding new fixtures. It records
only relation names, counts of duplicate groups/sessions/excess rows and groups
whose key is zero. Session IDs and rows are never logged.

The shared test database already contains deliberate Phase 5D raw-SQL tied
fixtures. Any observed tied groups are reported rather than deleted, repaired or
silently excluded from the whole-database result. Historical Phase 5D runs did
not retain an ID provenance manifest, so matching the synthetic zero-key shape
is not treated as proof of provenance for every observed group.

A separate explicitly scoped supported corpus is built from the existing Core
fixtures (excluding raw JSON mutations, signed-zero stress and tied-key stress).
It retains historical versions 1–6, normal/scam, all lifecycle/result categories,
zero/one/many relations, timestamp boundaries and different physical insertion
order with unchanged writer-assigned keys. The explicit SELECT and unchanged
Prisma row/domain decoder are compared again at UTC and selected non-UTC cases.
The candidate adapter is read-only and never supplies a write or application
response. Existing Prisma remains authoritative.

Additional live cases exercise actual Core/Prisma SAVE behavior, with no SAVE
implementation changes: safe multi-turn completion and replay, different-turn
CAS races, duplicate-turn races, injected rollback and retry, resume/competing
expiry/ownership, and critical/abandoned paths. Scoped scans then verify the
freshly created corpus has no duplicate keys.

### Verification and decision

Final live proof: **PASS**, 2026-10-24 16:37:03.481–16:44:32.370 UTC.
Source hashes, bounded counts and comparison cases are recorded in
`postgres-phase5e-evidence.json`.

| Relation | Existing rows scanned | Existing duplicate groups / sessions | Existing excess rows | Duplicate groups in new scoped corpus |
| --- | ---: | ---: | ---: | ---: |
| SessionOpportunity | 720 | 2 / 2 | 8 | 0 (84 rows) |
| TrainingEvent | 848 | 2 / 2 | 16 | 0 (80 rows) |
| TrainingMessage | 1,262 | 2 / 2 | 34 | 0 (166 rows) |
| DialogueTurnReceipt | 789 | 2 / 2 | 16 | 0 (100 rows) |

All eight existing duplicate groups use key 0. These are nonconformant with the
proved writer contract; receipt committedRevision 0 is independently outside the
Core R+1 range. Their precise historical source is not inferred from shape alone.
The raw rows are preserved. The absence of duplicates in the new scoped corpus
corroborates the construction proof; it is not the basis of the invariant.

- Supported corpus: 56 fixtures / 62 fixture-timezone comparisons, **62/62 exact
  row and domain matches**, no ordering violations or oracle discrepancies.
- Every explicit candidate comparison uses exactly **one SELECT**. There are no
  candidate write attempts. No latency improvement is claimed.
- Live semantic cases: **6/6 PASS**: safe dialogue/action replay, competing
  distinct turns, concurrent duplicate turns, rollback/retry, resume/competing
  expiry/ownership, and critical/abandoned paths.
- All protected runtime, schema and package digests remain unchanged.

New unit tests inspect the actual public Prisma create mappings across the
supported historical fixtures, replay/CAS, expiry, receipt gaps, bounded tie
detection, retained writer history, provider retry success and fallback.
No authoritative runtime source imports the proof modules.

The first attempt at a full offline regression could not initialize workers
because Windows VirtualAlloc failed under host memory pressure. This is recorded
separately from assertion outcomes. The unmodified full assertions then pass
with `npm test -- --maxWorkers=1`: **1,020 passed, 69 skipped** (65 files passed,
6 skipped). Skipped live suites are not counted as live passes. The new eight
ordering tests and root typecheck also pass.

Prisma validate, the normal pinned Prisma generation step, production build and
client audit also pass (69 client JavaScript artifacts). Node syntax checks,
`git diff --check`, private-value/PEM scans and the post-build runtime/proof digest
checks pass. The Phase 5D harness digests still match its recorded evidence.
No lint command/configuration is present; no lint dependency is introduced.

Repeat the bounded proof with the existing private dedicated-test configuration:

```text
node scripts/prove-postgres-ordering.mjs
npx vitest run tests/ordering-contract.test.ts tests/ordering-retry.test.ts --maxWorkers=1
npm run typecheck
npm test -- --maxWorkers=1
```

The script loads private `.env.local` quietly and uses the existing dedicated
target/CA safeguards. It creates fresh test fixtures without deleting old data.
It reports aggregate counts and mismatch categories only, never IDs, raw rows,
SQL, credentials or provider payloads.

Remaining boundary: logical row contents of the offline original MySQL data are
unverified, and no runtime/production target-data scan or reader rollout is done.
The supported writer tie blocker is resolved. Before an actual cutover, apply the
contract to the intended target data and handle malformed/external rows explicitly;
do not invent a tie-breaker or retroactively assume an unchecked import is valid.
No legitimate supported-writer tie was found that would require an ordering
migration. Native join remains excluded from the promotion recommendation.

No GET promotion, SAVE optimization, ordering migration, secondary sort key,
schema constraint, provider call or production deployment occurs in this phase.
Ownership, expiry clock, replay/idempotency, revision/CAS, atomic rollback,
append-only validation, template immutability, DECISION_RULES_V1,
trainingScore=null and backend-only authority are preserved.

Git remains on `feat/rule-based-evaluation` at
`ec5b180313ca347e3ff9e9f5ace2034685e706d3`. The six Phase 5E proof/test/report
files are local, unstaged artifacts for review. No commit/push occurs, and all
pre-existing unrelated documentation changes and Phase 5C/5D artifacts are kept.
