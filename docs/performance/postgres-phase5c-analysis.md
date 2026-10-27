# Phase 5C — aggregate-read and SAVE-reload redesign analysis

**Recommendation: DEFER runtime implementation.** Select a complete aggregate in one SELECT, with the existing transaction boundaries retained, as the first design to prove. PostgreSQL's snapshot guarantee supports the design in principle; equivalence of the pinned client, row types, decoder, ordering, nulls and failure behavior has not yet been demonstrated for an actual candidate. No candidate reader or migration is implemented in this phase.

Baseline: Phase 5B commit **`ec5b180313ca347e3ff9e9f5ace2034685e706d3`**. [Phase 5B evidence](postgres-phase5b.md) measured 3 GETs + 1 SAVE per text service turn, 4 GETs + 1 SAVE per voice service turn: **48 / 59 statements**, respectively. GET is **11** statements and the identity-dialogue SAVE is **15**. Child writes differ in other states; projections below are specific to the same measured workload. Keep the session pooler.

## 1. Scope and evidence quality

This is source/schema/documentation analysis plus a read-only metadata/scalar probe on the guarded dedicated test database and a synthetic in-memory invocation of the existing `assertUpdate`. There was no application-row write, candidate aggregate query, schema/client generation change, runtime/environment change, deployment or performance benchmark. Existing developer documentation edits are separate.

The [analysis evidence](postgres-phase5c-evidence.json) records only bounded metadata/counts and booleans, never URLs, certificates, credentials, application rows or provider output. Its PASS status describes the probes, **not** full candidate equivalence.

Verified observations:

- Generator preview features are empty, and the current generated `TrainingSession` query types do not expose `relationLoadStrategy`. This means the capability is not enabled, not that pinned Prisma 7.10 cannot support it.
- PostgreSQL test catalog has two template immutability triggers and an account-identity trigger. It has no user trigger maintaining child-history integrity metadata. No history digest/version column exists in the baseline schema.
- No duplicate ordering groups were found in the test database for opportunity/event/message `position` or receipt `committedRevision`. Those keys are nevertheless not protected by matching uniqueness constraints. This observation does not establish cleanliness of runtime/production data.
- Under `Asia/Bangkok`, a typed timestamp arrives as `Date`, while the same timestamp nested in JSON arrives as a string. Explicit parsing reproduced the same instant for the synthetic probe; passing the string directly into today's `.getTime()` decoder would not work.
- An explicit JSON key with null remains present; null stripping removes it. SQL NULL and JSON null both arrive as JS null in the scalar read, despite being distinct stored values. Empty JSON aggregation returns null.
- The existing validator rejects a changed historical message with `HISTORY_IMMUTABLE` although header revision, collection lengths and message IDs remain the same. Counts/IDs/revision alone cannot replace current validation.

## 2. Existing semantic contract

Source of truth: `src/persistence/prisma-repository.ts`, `src/domain/persistence-contract.ts`, `src/core.ts`, `prisma/schema.prisma`, the existing metadata/repository tests and Phase 5B's 69 passing PostgreSQL cases.

### Aggregate GET

The root filter is exactly session ID + owner ID. The repeatable-read transaction includes the pinned template configuration and all children. It does not filter out expired, abandoned or completed sessions. Core subsequently checks its own injected clock, writes expiry through CAS if necessary, and handles expiry conflicts by rereading. A replacement must not use SQL `now()` to redefine expiry or return NOT_FOUND for an expired session.

| Relation | Current order / cardinality | Required output behavior |
| --- | --- | --- |
| Template | Exact `(templateId, templateVersion, variant)`; one required row | Use its configuration/evaluation mode, not current catalog defaults or an inference from version number |
| Actions | `revision ASC`; unique per session | Full ordered history |
| Opportunities | `position ASC` | Full ordered history; preserve open/finalized state and assessment presence |
| Events | `position ASC` | Full ordered history and critical-event identity |
| Messages | `position ASC` | Full ordered sanitized history; keep text as text |
| Receipts | `committedRevision ASC` | Full ordered history; opaque input keys/fingerprints, attempts and replay data |
| Result | Zero or one row | Absent row becomes domain `result:null`; present row preserves its data and mode-specific shape |

The decoder intentionally omits `assessment` for legacy opportunities whose SQL assessment is null, but includes `assessment:null` for unanswered categorical opportunities. Legacy results omit categorical mode/summary properties; categorical results include them and retain `trainingScore:null`. SQL/JSON null, a missing property, an empty array and a missing relation are not interchangeable.

`position` and `committedRevision` ties are a proof gap: normal Core writes generate distinct keys, but the database does not enforce all of them. Do not silently add an ID tie-breaker, reorder history or add uniqueness migrations as part of a latency change. Characterize the baseline's undefined tie order and establish the supported-data contract before claiming equivalence for every stored state.

### SAVE after CAS

The current read-committed transaction performs:

1. Conditional header UPDATE on ID + expected revision. Count other than one rejects the update.
2. Reload the entire aggregate **after** the successful CAS, while the parent row remains locked. The transaction sees its own updated header.
3. Set only the decoded validation copy's revision back to the expected old revision, then call the unchanged `assertUpdate`.
4. Differential child writes and the existing pre-commit fault seam; commit everything or roll everything back.

`assertUpdate` requires immutable identity; complete prior prefixes of actions, events, messages and receipts; immutable existing result; immutable opportunity identity/maximum/opened time; and full immutability of finalized opportunities. It also calls the existing sanitization/receipt checks. `writeChildren` needs prior lengths and prior opportunity values. A smaller read must provide equivalent information for **all** these checks, not only revision/counts.

GET's owner predicate and SAVE's identity validation have different roles. SAVE currently reloads by the successfully CAS-locked ID and then verifies actual owner/identity through `assertUpdate`. Blindly reusing an owner-filtered GET with a caller-supplied owner could change identity-mismatch/error behavior. Preserve that distinction and the rollback of a CAS that later fails identity validation.

## 3. Candidate designs and decisions

Statement targets are unmeasured structural estimates; no latency improvement is claimed.

| Candidate | Expected statements | Correctness risks / missing proof | Migration and runtime impact | Decision |
| --- | --- | --- | --- | --- |
| A. Prisma native `join`, retaining GET/SAVE transactions | GET 11→4; measured SAVE 15→8 if both relation reads become one SELECT | Pinned 7.10 + pg adapter support; nested Date/null/legacy fidelity; exact SQL count; global default changes | Enable documented generator preview and regenerate client; no table DDL expected; audit other include queries, especially Quiz; keep versions pinned | **DEFER; first capability/compatibility proof** |
| B. Explicit parameterized full aggregate SELECT with independent per-relation aggregation; existing transactions/validator | Same 4 / 8 targets | Complete row hydration, all fields/order/nulls, ownership roots, Date/number mapping, empty relations, memory/query plans | Scoped repository query + row codec; no table migration required; retain original decoder/validator/write paths where possible | **DEFER; preferred scoped fallback if A fails or has excessive impact** |
| C. Single-statement GET outside explicit transaction controls | GET 11→1; SAVE still 8 using A/B in its transaction | Snapshot principle supports one SELECT, but acquisition/timeout/cancellation/error behavior is not equivalent yet | Changes runtime transaction handling; current GET timeout 15s/maxWait 5s cannot simply be replaced by pool connect timeout 10s; no equivalent query deadline configured | **DEFER; separate gate after A/B** |
| D. Narrow header + counts/max revisions/last IDs instead of full SAVE history | A compact single SELECT could target SAVE 8, or 7 without a separate reload only if CAS could return everything required | Same-length edits/reordering, result changes and finalized-opportunity mutation are missed; observed baseline counterexample rejects them | Would change `assertUpdate` semantics or require a new integrity protocol | **DEFER; not equivalent as proposed** |
| E. Persisted integrity digests / history versions | Potentially compact validation SELECT (SAVE 8); zero-reload target not established | Canonicalization, stale metadata, all-writer coverage, mutable/open versus finalized opportunities, hash collisions/format versions | New columns/backfill/versioning; atomic maintenance for every writer and restore/import path; possibly triggers/permissions | **DEFER; larger design with no first-stage round-trip advantage over B** |
| F. Compute integrity comparison from live persisted history in one SELECT | Potentially SAVE 8 | Must match JS canonical/omitted-key/number/time behavior; still scans full history; requires adapting validation | SQL validation/codec work; optional digest implementation may add database dependencies; current validator cannot be bypassed without proof | **DEFER; prove full-snapshot reader first** |
| G. Combine CAS + aggregate snapshot in a data-modifying CTE | Could target SAVE 7 after a proven one-SELECT reload | Own-write visibility, zero-row CAS mapping, snapshot while waiting for row locks, exact error/rollback behavior | More intrusive mutation SQL; no table DDL necessarily, but changes CAS implementation | **DEFER; at most one further statement beyond A/B** |
| H. Read-only database function or materialized aggregate document | Function can match 4/8; a persisted document could reduce reads but exact targets depend on maintenance | Function volatility/security/search path; document divergence from child tables and immutable history | Function DDL/permissions or new document columns/triggers/backfill; broader deployment/restore obligations | **DEFER; not the smallest bounded change** |

Prisma's versioned v7 documentation describes `relationJoins` as Preview and `join` as the default once enabled. It uses database aggregation for related reads. The flag is therefore not a harmless local query argument: the existing Quiz repository also uses includes and must be audited or explicitly kept on the old strategy. Current unversioned docs describe ORM 8, so the v7 reference is used here. [Prisma v7 relation strategies](https://www.prisma.io/docs/orm/v7/prisma-client/queries/relation-queries#relation-load-strategies-preview).

Database functions are not a shortcut around snapshot proof: PostgreSQL documents different snapshot visibility for STABLE and VOLATILE functions. A multi-SELECT function declared VOLATILE by default is not automatically equivalent to one coherent read. No function or security-definer privilege is introduced. [Function volatility](https://www.postgresql.org/docs/17/xfunc-volatility.html).

## 4. Statement reduction model for the Phase 5B workload

One successful service turn still keeps **3 text / 4 voice GET calls plus one SAVE**. All provider-boundary, expiry/replay, projection and recovery reads remain.

| Scope changed, if proven | GET statements | SAVE statements | Text turn | Voice turn |
| --- | ---: | ---: | ---: | ---: |
| Phase 5B baseline | 11 | 15 | 48 | 59 |
| GET read shape only, existing controls | 4 | 15 | 27 | 31 |
| SAVE reload shape only | 11 | 8 | 41 | 52 |
| Both full-snapshot reads, existing controls | 4 | 8 | **20** | **24** |
| Later standalone GET without controls, if separately proven | 1 | 8 | 11 | 12 |

For the first combined target, this is 28 / 35 fewer statements, **58.33% / 59.32%** fewer than Phase 5B. These are counts derived from a hypothetical one-SELECT implementation, not measured results or predicted p50/p95. Internal subquery scans still occur, JSON aggregation can shift work to the server, and large histories can increase memory/temp work. Observe actual statements through the existing diagnostic before accepting any count.

Batching semicolon-separated SELECTs is not the same as one SELECT and is not the selected design. Running relation reads on separate connections loses a shared snapshot unless an additional snapshot protocol is introduced. Pipelining/protocol changes are outside scope.

## 5. What a full-snapshot proof must establish

### A. Snapshot argument: supported in principle, incomplete for a candidate

PostgreSQL gives a plain SELECT a statement snapshot; repeatable read gives successive SELECTs a common transaction snapshot. Replacing the relation reads with one plain SELECT inside the same transaction can therefore preserve coherence at a valid read point. This is an architectural inference, not evidence that any particular generated or handwritten query is correct. [PostgreSQL 17 isolation](https://www.postgresql.org/docs/17/transaction-iso.html).

Use an owned root for GET and independent correlated/LATERAL aggregates per child. Joining all child tables directly before aggregating would multiply rows and duplicate history. Arrays need explicit order inside their aggregates and empty-array handling; ordered input subqueries alone are not a sufficient blanket guarantee after joins. [Aggregate ordering and empty inputs](https://www.postgresql.org/docs/17/functions-aggregate.html).

For SAVE, keep CAS as a separate command before the single reload. Supported repository writers acquire the parent CAS lock before child changes, so they cannot concurrently commit another normal mutation to that session while the lock is held. Raw child-only writers are not protected by that protocol. The old read-committed multi-SELECT reload is not a universal shield against arbitrary concurrent DBA edits either; define this boundary honestly rather than claiming a stronger guarantee for either design.

Combining CAS and reload later is a distinct proof: a base-table SELECT in the same data-modifying CTE does not automatically see the UPDATE's result. RETURNING is the communication mechanism. No CAS/read CTE is implemented or considered approved here. [PostgreSQL data-modifying WITH](https://www.postgresql.org/docs/17/queries-with.html#QUERIES-WITH-MODIFYING).

### B. Decoder/shape equivalence: not yet demonstrated

Required equation for an owned, supported persisted snapshot S: **hydrate(candidateRows(S)) = baseline AggregateRow(S)**, followed by the same deterministic domain decoder. Compare property presence and arrays as well as values.

Requirements for a possible row codec:

- Match every selected field and enum/string/number value. Keep fingerprints/input keys opaque strings. Do not truncate history to the model's recent-message window.
- Preserve pinned template identity/configuration and evaluation mode. Do not infer categorical mode from version number alone.
- Preserve absent result versus result with null-valued fields. Empty relation arrays must be `[]`, not null or `[null]`. Do not use blanket null stripping or ABSENT ON NULL to build domain objects.
- Reproduce legacy assessment omission and categorical explicit null through the existing decoder. Preserve zero, false, null, empty object/array and nested JSON values; no new JSON schema validation/coercion is justified by an optimization.
- Keep SQL NULL and JSON null storage semantics unchanged. Plain JS reads can collapse them, so read parity does not prove write/storage parity. Existing Prisma null enums and write behavior stay intact. [Prisma v7 JSON nulls](https://www.prisma.io/docs/orm/v7/prisma-client/special-fields-and-types/working-with-json-fields#using-null-values).
- Hydrate every decoded timestamp to the same millisecond instant before `.getTime()`. Nested JSON timestamps bypass ordinary column typing. An explicit offset-aware conversion or exact epoch-millisecond wire representation needs tests; never replace an offset with Z. The pinned adapter timezone correction remains in place, and no assumption is made that it fixes nested JSON automatically.
- Preserve floating-point/JSON number semantics; characterize non-finite/raw exceptional values rather than quietly turning them into strings/null. Do not introduce stricter business limits under a query change.
- Retain parameter binding and fixed identifiers/field allowlists. A TypeScript generic on a raw query is not runtime hydration or validation. [Prisma v7 raw-query mapping](https://www.prisma.io/docs/orm/v7/prisma-client/using-raw-sql/raw-queries).

### C. SAVE integrity equivalence: retain full evidence first

If the candidate returns the same persisted aggregate after CAS, retaining `assertUpdate`, `writeChildren` and the fault seam supplies the existing acceptance/rejection/rollback behavior without inventing a new validator. Keep the validation-copy revision adjustment and current error categories. Do not move expiry, event authority or scoring into SQL.

Count/revision-only validation has a concrete counterexample in the evidence: changing an old message leaves all counts/IDs/revision unchanged, but the existing validator rejects the next snapshot. Stored digests maintained only by application code also miss child edits committed without updating metadata, or can falsely reject a later snapshot that already read such drift. Current schema does not enforce a complete child-history mutation protocol.

An integrity scheme would need versioned canonicalization, complete coverage of identity/history/results/opportunities, atomic digest updates, restore/backfill rules and explicit writer permissions. JS `canonical` uses ordered arrays and locale-sorted object keys; raw JSONB text/hash bytes are not an established substitute. Finalized and open opportunity rules differ, and expiry can advance session revision without appending history. Cryptographic digest equality also adds an assumption beyond the current exact canonical comparison. Those changes are not needed for the first one-SELECT design.

## 6. Test and promotion plan — not executed for a candidate

| Gate | Required demonstration |
| --- | --- |
| Pinned capability | Isolated generate/typecheck with exact Prisma/adapter 7.10 and pg 8.23.1; no dependency upgrade; inspect actual SQL for native join; audit Quiz/default-strategy impact |
| Frozen-fixture differential | Deep compare baseline and candidate on stable identical fixtures, including own-property presence; full histories, normal/scam variants, historical v1-v6, weighted/categorical and official/unassessed/critical/expired/abandoned states |
| Ordering | Insert records in different physical order; preserve each declared sort; empty/one/many rows; characterize tied keys without adding silent tie-breakers or uniqueness constraints |
| Null/JSON | SQL NULL vs JSON null vs the string "null"; empty arrays/objects; nested nulls; legacy missing assessment/mode fields; categorical `assessment:null` and `trainingScore:null`; unchanged write storage |
| Time/number | Every timestamp consumed by decode, non-UTC transaction timezone, fractional milliseconds, offsets/day boundaries and negative epochs; null dates; representative float values and exceptional supported values |
| Read coherence | Two-client barriers: writer commits header + children between read opportunities. Candidate must return an entirely old or entirely new consistent version; exact differential comparisons require a common snapshot or no concurrent writer, not two unrelated wall-clock reads |
| Owned/lifecycle reads | Other owner/missing session error parity; resume/refresh; expiry before input parsing, during STT/model wait, competing expiry CAS; no SQL-side expiry clock or status filter |
| Save parity | Twin fixtures and identical commands: same accepted state or same domain rejection; immutable identity, every historical prefix, reordered/truncated/changed rows, finalized opportunities, existing result; allowed open-opportunity updates still accepted |
| Replay/CAS | Same/different simultaneous actions and turns at one revision; one winner, correct duplicate recovery, no partial loser; opaque idempotency keys preserved |
| Faults | Fail after CAS, reload, action, opportunity/event, receipt/messages, result, and before commit; original row counts/state/revision restored; retry still works |
| Operational parity | Keep transaction maxWait/timeout, cancellation/late completion, database error mapping and connection release; test malformed required relations/shape failure behavior without exposing data |
| Full regression | Existing full offline suite plus all 69 Phase 5B live PostgreSQL cases; add candidate-specific differential/concurrency cases. Native generator changes also require non-training relation coverage |
| Performance | Same pooler/environment/cohorts; actual statement and aggregate counts, text/voice p50/p95, cold/warm behavior, short and growing histories, concurrency 1 and the existing 20-session demo target; server planning/execution/buffers and client memory/pool occupancy |

A proof/shadow reader, if separately authorized, must remain non-authoritative: the baseline supplies responses and writes, mismatches log only bounded categories or keyed run-local correlation, and no raw row/provider content is logged. No candidate save should write user data before parity/rollback gates pass on dedicated fixtures. A lower statement count is not sufficient to approve a new writer.

## 7. Recommendation and implementation boundary

1. **DEFER all runtime implementation now.** Scalar/source reasoning demonstrates feasibility and specific pitfalls, not a complete candidate equivalence proof.
2. First prove a full one-SELECT aggregate while retaining transaction controls and the unchanged validator. Investigate native Prisma join on the pinned stack first; choose it only if its defaults can be safely scoped and its actual hydrated output passes the gates. Otherwise use the repository-scoped explicit SQL/codec design.
3. Promote GET and post-CAS reload separately after their gates pass. For the measured workload, the combined initial target is 20 text / 24 voice statements, not an asserted latency result.
4. Keep standalone/no-control GET, compact hash validation, CAS CTEs, document snapshots and database functions deferred to separate decisions. No new schema/integrity protocol is justified before proving the simpler full snapshot.

Preserve ownership, Core expiry clock, replay/idempotency, CAS/revision, rollback, append-only validation, immutable templates, backend event authority, `DECISION_RULES_V1` and `trainingScore=null`. No LLM, speech, streaming, frontend, protocol, deployment or endpoint-switch work is part of this phase.
