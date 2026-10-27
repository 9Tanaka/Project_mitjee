# Phase 5H — authoritative one-SELECT post-CAS SAVE reload

This final bounded change replaces only the training SAVE reload. GET remains
owner-scoped. No production deployment or database cutover is performed.

## Exact implementation boundary

The Phase 5F source digests and Phase 5G proof are the baseline. The production
flow is now:

```text
same conditional CAS UPDATE / parent row lock
ID-only one-SELECT aggregate reload
same decode(row)
same current.revision = expectedRevision
same assertUpdate(current, snapshot, expectedRevision)
same writeChildren(snapshot, current)
same beforeCommit fault seam
same COMMIT / ROLLBACK
```

`readTrainingAggregateAfterCas(tx, id)` is a separate persistence entry point.
Its fixed SQL reuses the proven aggregate body and changes only the root
predicate to `WHERE s.id=$1`. It binds no owner value. The existing GET entry
point still uses `WHERE s.id=$1 AND s."ownerId"=$2`.

The new entry point reuses the unchanged codec and supported-ordering guard.
Identity/ownership remains validated by the unchanged assertUpdate inside SAVE.
An owner-tampered snapshot must therefore reload the persisted owner and fail
with SESSION_IDENTITY_IMMUTABLE, rolling back the CAS. It must not become a null
owner-filtered lookup. The defensive missing-row branch preserves Prisma's P2025
missing-record category; successful locked CAS makes it unreachable in supported
states. It is not a new integrity protocol.

SAVE isolation remains Read Committed, timeout 15,000 ms, maxWait 5,000 ms.
GET remains Repeatable Read with the same budgets. The CAS, domain decoder,
assertUpdate, writeChildren and fault seam are unchanged. No transaction control,
schema/migration, constraint, native relationJoins feature, Core, Decision Rule,
provider, frontend or protocol change is included.

Ownership/identity, expiry clock, replay/idempotency, revision/CAS, atomic rollback,
append-only history, immutable opportunities/results/templates, DECISION_RULES_V1,
trainingScore=null and backend-only authority retain their prior contracts.

## Implemented-reader parity

The Phase 5G case source is hash-checked and reused without changing case logic.
The Phase 5H observer reverses authority correctly: the actual one-SELECT wire
row goes back to production SAVE; an additional old Prisma include is used only
as the same-transaction oracle. Neither the oracle row nor its validation verdict
can replace the actual result. Both snapshots are compared after successful CAS,
with the same revision reset before comparing old assertUpdate verdicts.

The harness verifies that the repository's only delta from the frozen Phase 5F
source is the new import and reload dispatch. It also verifies exact GET SQL,
codec, ordering-function and GET-function source equality. All other runtime and
schema/package digests must match the baseline.

Cases include normal dialogue, opportunity/event changes, critical/completion/
result creation, expiry-only saves, replay, stale/concurrent CAS, every existing
SAVE rollback/retry seam, FK failure, owner/history/opportunity/result tampering,
historical/legacy/categorical shapes, null/JSON/date/non-UTC cases and malformed
ordering rejection. Implemented parity passes **117/117 exact row/domain and
validator comparisons**, 22/22 semantic cases and 67 corpus probes. All four
malformed cases reject without repair. Four stale CAS attempts execute no reload.
The observed reload has one SELECT; its old include oracle has eight.

## Verification gates

- Targeted reader/SAVE tests: 16/16 PASS, including bound ID-only SAVE scope,
  unchanged GET owner scope, P2025 preservation, stale-CAS no-reload and identity
  validation before child writes.
- Full offline regression: 1,032 passed, 69 skipped (68 files passed, 6 skipped).
  The live suites are run separately; skips are not counted as live passes.
- Root typecheck: PASS.
- Full correctness: **134/134 PASS**, including **69/69 real PostgreSQL cases**,
  zero failures or skips.
- Prisma validate/generate, production build and client audit: PASS. The generated
  client remains pinned to 7.10.0; no dependencies are upgraded.
- Clean-checkout source reconstruction and bounded runtime-delta check: PASS.
- Final diff/privacy checks pass before checkpoint staging. All 27 unrelated
  dirty documentation files are excluded and their contents preserved.

## Matched benchmark method

The original Phase 5B/5F workload is hash-verified and reused. Only phase/output
metadata, import locations and the baseline-source reference change. BEFORE uses
the exact Phase 5F runtime before editing SAVE; AFTER is run after all DB test and
build activity finishes. Historical artifacts are retained.

Both runs use the same session pooler/trusted CA, pinned Prisma 7.10.0 and pg
8.23.1, Windows x64 / Node v24.19.0, CC-01 v6 IDENTITY_CLAIM fixture, fixed Thai
input/PCM WAV, two warmups and ten measured turns per text/voice cohort, sequential
alternating cohorts. Fresh persisted setup is outside timed intervals.

The database is real; model/STT/TTS are deterministic mocks with no paid requests.
These are service-path measurements, not browser/auth or real-provider speech/
model latencies. Median p50 and nearest-rank p95 are exploratory at n=10, where
p95 equals the sample maximum. Cloud/network/cache variation remains a limit.

`summarize-postgres-phase5h.mjs` reuses the Phase 5F derivation but counts reload
SELECTs by the enclosing SAVE operation, since the explicit query no longer has
the old Prisma delegate label. This changes measurement attribution only.

Evidence files:

- `postgres-phase5h-baseline.json`: frozen Phase 5F runtime digests.
- `postgres-phase5h-save-proof.json`: actual implementation vs old reload oracle.
- `postgres-phase5h-correctness.json`: full dedicated PostgreSQL cases.
- `postgres-phase5h-before.json`, `postgres-phase5h-after.json`: raw benchmark samples.
- `postgres-phase5h-comparison.json`: boundary/count/percentile derivation.
- `postgres-phase5h-completion.json`: explicit completion/non-regression gates.

## Final outcome

**PostgreSQL persistence optimization: COMPLETE.** All correctness gates pass,
and all measured SAVE/total p50/p95 values are non-regressive. Recommendation:
**FREEZE_PERSISTENCE_ARCHITECTURE**. No validation weakening, schema/CAS change or
new integrity protocol is required. No further persistence optimization starts.

| Structural metric (normal dialogue workload) | Phase 5F BEFORE | Phase 5H AFTER |
| --- | ---: | ---: |
| SAVE reload SELECTs | 8 | 1 |
| SAVE total statements | 15 | 8 |
| Text total statements / turn | 27 | 20 |
| Voice total statements / turn | 31 | 24 |
| GET total statements | 4 | 4 |
| Text transaction controls / turn | 12 | 12 |
| Voice transaction controls / turn | 15 | 15 |

All ten measured samples per mode have these exact counts. Each GET and SAVE
retains BEGIN / isolation setup / COMMIT. Logical GET counts remain 3 text / 4
voice, and each turn retains one SAVE. Retries/fallback are zero in both runs.

| Measured boundary | p50 BEFORE (ms) | p50 AFTER (ms) | p95 BEFORE (ms) | p95 AFTER (ms) |
| --- | ---: | ---: | ---: | ---: |
| SAVE during text | 1,463.46 | 777.68 | 1,467.89 | 793.40 |
| SAVE during voice | 1,465.26 | 778.09 | 1,469.44 | 781.34 |
| Total text | 2,638.87 | 1,943.81 | 2,642.92 | 1,958.73 |
| Total voice | 3,031.67 | 2,330.10 | 3,037.73 | 2,337.25 |

Total p50 reduction is 26.34% text and 23.14% voice versus the fresh Phase 5F
baseline. SAVE p50 is approximately 47% lower. Raw min/max and every sample remain
in the linked JSON artifacts. These are measured service/mock-provider results,
not guarantees for real LLM/STT/TTS, browser/auth, production traffic or concurrency.
The small n=10 sequential cloud sample remains an explicit limitation.

The architecture is frozen with the original transaction controls, validation,
locking and integrity contract. Remaining latency is not used to justify another
round of persistence changes within this task.

## Reproduction and checkpoint

```text
node scripts/phase5h-harness.mjs benchmark before
# Apply only the approved Phase 5H SAVE delta.
npm run typecheck
npm test -- --maxWorkers=1
node scripts/phase5h-harness.mjs parity
node scripts/phase5h-harness.mjs correctness
npm run prisma:validate
npm run build
npm run audit:client
node scripts/phase5h-harness.mjs benchmark after
node scripts/summarize-postgres-phase5h.mjs
git diff --check
```

The BEFORE command requires actual Phase 5F source. It cannot be run as a BEFORE
measurement against already optimized SAVE. The recorded baseline digests and
bounded reverse reconstruction allow later validation from a clean optimized
checkout without committing copied/generated runtime files. Rerun outputs are
protected against overwriting evidence. Private environment is loaded quietly;
no credentials, raw rows/provider bodies or SQL parameters are logged.

Existing unrelated documentation edits are preserved and excluded from the
checkpoint. Earlier approved persistence proofs/runtime changes are included as
needed so the checkpoint is self-contained. No env, key, certificate, generated
client, dependencies or build output is committed.

The approved Phase 5C–5G material and exact Phase 5F runtime are checkpointed in
`4767470143b7225ffd7ac00dc2e366a0089d9f96` (`perf: checkpoint one-select GET and
SAVE reload proofs`). The final Phase 5H commit is its child, so reviewers can
compare just the bounded SAVE delta against that baseline. Its SHA is reported in
the task handoff rather than embedded recursively in its own content.

Measurements were produced before those checkpoint commits; their source
digests identify the actual tested working-tree bytes. No push, deployment or
production cutover occurs. The 27 pre-existing unrelated documentation edits
remain outside both commits. Persistence architecture is frozen at COMPLETE.
