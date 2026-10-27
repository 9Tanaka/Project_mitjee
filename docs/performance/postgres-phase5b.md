# Phase 5B — bounded pre-provider read sharing

Evidence baseline: `595a579498814317843907a65b7d09e9a5505ca4`, [Phase 5A](postgres-latency-diagnosis.md). Existing developer README/document edits remain separate. No runtime switch to direct, schema/migration, AI/prompt, speech, frontend, protocol, or Decision Rule change is planned.

## Read map and design before implementation

Normal service text: application preflight → orchestrator context/replay read → model wait → Core apply fresh read → SAVE aggregate reload under CAS → application projection read. Four GETs plus one SAVE reload: five aggregate fetches, 59 statements.

Normal service voice: voice ownership/expiry/replay/revision read → STT wait → entire text path → TTS wait. Five GETs plus one SAVE reload: six aggregate fetches, 70 statements. The pre-STT snapshot must not be reused after STT.

WebSocket adds a handshake binding read outside each turn, and a fresh per-frame binding read inside each turn. Auth.js identity checks do not replace session ownership checks. HTTP dispatch has no extra aggregate read. The successful WebSocket text/voice paths therefore add one GET to the service counts; handshake/reconnect and conditional error/replay paths are separate.

| READ / TRANSACTION | WHY IT EXISTS | CAN SHARE? | CAN REMOVE? | RISK | EXPECTED ROUND-TRIP SAVING |
| --- | --- | --- | --- | --- | --- |
| WebSocket handshake/per-frame bind | Ownership, expiry, category, connected/ready call and cancellation checks | Handshake REQUIRED_FRESH; equivalent per-frame sharing is UNKNOWN | No; protocol untouched | A status-only callback does not replace the full pre-dispatch binding guard | 0 |
| Voice pre-STT read | Ownership, expiry, replay, stale revision before paid work | REQUIRED_FRESH | No | STT is an external wait; a later read is still required | 0 |
| Application message preflight | Ownership and expiration / application error mapping | SAFE_TO_SHARE with orchestrator pre-provider read | Remove duplicate fetch, retain guard | Keep expired replay blocking and expiry errors | 11 statements per successful text/voice turn |
| Orchestrator pre-provider context | Owned lifecycle snapshot, replay/idempotency, expected revision, context | REQUIRED_FRESH, especially after STT | No | Never reuse pre-STT data | 0 |
| Core apply after model wait | Post-provider freshness, ownership, expiry, duplicate action, revision | REQUIRED_FRESH | No | Concurrent changes and expiry during provider waits | 0 |
| SAVE aggregate reload | assertUpdate, immutable identity/history/opportunities/results; differential child writes after CAS lock | REQUIRED_FRESH; narrower equivalent is UNKNOWN | No | A supplied/cached snapshot must not bypass validation against persisted history | 0 |
| Application projection GET | Current state/revision and expiry at response projection | UNKNOWN equivalence of returning an older committed copy | No | Preserve existing latest-read response behavior | 0 |
| Core CAS-conflict recovery GET | Latest committed action receipt / replay fingerprint | REQUIRED_FRESH, conditional | No | Duplicate concurrent requests or conflicting idempotency keys | 0 |
| Expiry CAS-conflict reread | Competing expiry/update recovery | REQUIRED_FRESH, conditional | No | Exactly one expiry revision; no stale update | 0 |
| GET repeatable-read controls | Coherent parent+relation snapshot | UNKNOWN equivalent reduction | No | Multiple SELECTs cannot silently become separate read-committed snapshots | 0 |
| SAVE read-committed transaction controls | CAS linearization, append-only validation, atomic rollback | UNKNOWN equivalent reduction | No | Lock/revision/child/result atomicity | 0 |

The selected change shares only the application pre-provider status guard with the Orchestrator's owned/lifecycle-checked snapshot. A server-only callback receives the primitive session status, never a mutable aggregate or authority token. The Orchestrator still obtains its snapshot from Core. All after-STT and after-model freshness checks remain; the application cannot supply a snapshot and providers cannot access the callback. Projection, SAVE reload, transaction controls, conflict recovery and expiry behavior are retained.

Expected service counts: text 4→3 GETs, 59→48 statements; voice 5→4 GETs, 70→59 statements. Standalone GET stays 11; SAVE stays 15. These are design predictions until measurement completes.

Application expiry and ownership checks still run before parsing invalid application messages, including expired duplicate replays. Direct Orchestrator callers keep their existing parsing order when no application status guard is supplied. The shared guard is synchronous and receives only a status enum. No cross-turn cache or caller-supplied authoritative aggregate is introduced. The caller-opening path is unchanged; this optimization targets learner message turns.

Conditional reads also remain: application expiry translation rereads after `SESSION_NOT_ACTIVE`, Core's expiry-CAS conflict recursively resumes, and write-CAS conflict recovery fetches the latest receipt. Voice duplicate replay retains its own owned pre-STT lookup, skips speech/model work, and follows the shared message replay path. Normal duplicate text replay therefore has 3→2 GETs; normal voice replay 4→3, with zero SAVE in either case. These conditional counts are source-map explanations, not the timed successful-turn workload.

## SAVE reload and transaction investigation

`assertUpdate` compares persisted immutable identity fields, the complete prior prefix of actions/events/messages/turn receipts, existing result data, and each opportunity's immutable/finalized fields. `writeChildren` also uses prior collection lengths and prior opportunity values to choose only new/changed rows. A header-only or count-only reload cannot establish these same conditions. Accepting a previously-read in-memory aggregate would weaken validation against the actual persisted history unless an additional integrity/revision protocol were proven, including out-of-band child changes; none is introduced here.

Narrowing a few selected columns would still leave eight SELECTs, so would not address the dominant round trips. A complete single-statement aggregate read or SQL-side integrity comparison could be investigated separately, but would require equivalence of ordering, legacy absent/null assessments, JSON nulls, timestamp instants, all `assertUpdate` comparisons, and rollback/locking behavior. That is a larger persistence/decoder change than sharing one guard read. Its equivalence is UNKNOWN in this phase, so the current reload is preserved.

Removing repeatable-read controls while keeping multiple relation SELECTs is not proven equivalent: successive read-committed SELECTs can observe different committed snapshots, while repeatable read preserves the same snapshot across queries. See the [PostgreSQL 17 isolation documentation](https://www.postgresql.org/docs/17/transaction-iso.html). A future single-statement implementation would still need to prove all decoder and mutation invariants before changing transaction behavior. Neither isolation level, transaction timeout, pool configuration nor SQL controls changed here.

## Measurement plan

`node scripts/benchmark-postgres-turns.mjs before` and `... after` use the same session-pooler test target, CA, source-derived CC-01 v6 identity history, input text, PCM fixture, deterministic model/STT/TTS, concurrency 1, two warmups plus ten measured turns per cohort, alternating text/voice order. Setup uses the real authored domain in memory and forks identical fresh histories into PostgreSQL outside timed intervals; equality is checked before every turn. This avoids timing initial scenario setup and compares the same persisted cardinalities. Before mode verifies runtime sources against Phase 5A commit 595a579. Each artifact records source hashes and individual SQL timings; no SQL/parameters/URLs/audio/transcripts or provider raw data are exported. No paid provider calls.

These are service-path PostgreSQL measurements with mock model/speech providers. They are not end-to-end live Groq/Azure/ElevenLabs or Vercel latency measurements. Historical live provider measurements remain separate and are not used to claim the size of this optimization's improvement.

Counts cover the training repository. Account/authentication SQL, handshake/reconnect, read-only speech replay and simulator/navigation requests are outside a successful service message turn. Voice TTS after the committed reply has no additional aggregate read in `VoiceApplicationService.send`; the separate `speak` endpoint owns its own fresh lookup and is unchanged.

## Measured before/after results

Both runs passed all per-sample checks: identical persisted fixtures (CC-01 v6, revision 3, two messages, three actions, two receipts), one model attempt, no fallback, voice READY, exactly one committed revision, no evaluation event/result/opportunity change. Twenty measured turns plus four warmups per run. Before runtime source was verified against commit `595a579498814317843907a65b7d09e9a5505ca4`; after source hashes differ only for the two intended runtime files.

- [Before raw samples and per-query timings](postgres-phase5b-before.json), run `3c5c9fd1-770f-49c0-84e7-38b71ecd7fff`, **2026-10-24 13:37:27.248–13:41:13.021 UTC**.
- [After raw samples and per-query timings](postgres-phase5b-after.json), run `d76d4b5d-f754-4ecc-9c6c-396c476d6865`, **2026-10-24 13:42:23.641–13:45:49.461 UTC**.
- Windows x64, Node v24.19.0, Prisma/adapter 7.10.0, pg 8.23.1, same dedicated PostgreSQL test database through the session pooler, trusted CA and existing pool configuration. No direct endpoint connection or runtime configuration switch.

Counts were constant across all measured samples:

| Measurement | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Text service GET calls | 4 | 3 | 1 |
| Voice service GET calls | 5 | 4 | 1 |
| Text aggregate fetches including SAVE reload | 5 | 4 | 1 |
| Voice aggregate fetches including SAVE reload | 6 | 5 | 1 |
| Text SQL statements | 59 | 48 | 11 (18.64%) |
| Voice SQL statements | 70 | 59 | 11 (15.71%) |
| SQL statements per standalone GET | 11 | 11 | 0 |
| SQL statements per SAVE | 15 | 15 | 0 |
| SAVE calls per successful turn | 1 | 1 | 0 |

Latency in milliseconds, ten measured samples per cell. p95 uses nearest rank and equals max at n=10; it is exploratory.

| Cohort / code | min | p50 | p95 | max |
| --- | ---: | ---: | ---: | ---: |
| Text / before | 5707.91 | 5738.55 | 5749.54 | 5749.54 |
| Text / after | 4744.48 | 4800.77 | 4897.41 | 4897.41 |
| Voice / before | 6767.06 | 6798.82 | 6814.17 | 6814.17 |
| Voice / after | 5883.78 | 5899.83 | 5916.99 | 5916.99 |

Observed text p50 fell **937.77 ms / 16.34%**, p95 **852.13 ms / 14.82%**. Voice p50 fell **898.99 ms / 13.22%**, p95 **897.18 ms / 13.17%**. These are measured local service improvements for this workload, with no claim of statistical significance or identical production savings.

The cohorts ran in consecutive windows rather than randomized cross-version A/B execution. Existing commit work did not become faster: commit p50 was approximately 2530→2602 ms text and 2528→2602 ms voice, with the same statements and unchanged commit code. Endpoint timing variation remains a confounder. The reduction in actual GET/SQL counts is exact; the elapsed-time reduction is smaller than the statement-count percentage in this run. Preflight span ownership moved to the shared context read; total time and actual SQL counts are the primary comparison.

Successful WebSocket turn counts would be 70→59 text and 81→70 voice because the per-frame binding GET remains. Those are derived mappings, not newly measured WebSocket latencies. No real LLM/STT/TTS/provider-network or Vercel latency improvement is claimed.

## Correctness verification

`node scripts/verify-postgres-phase5b.mjs` privately loads the guarded test environment and runs all six existing PostgreSQL/HTTP test files plus the new shared contract on PostgreSQL, with the existing case/hook budgets and one worker. The historical `scripts/test-postgres.mjs` and Phase 5A evidence are unchanged. The new verifier drains raw output privately; only allowlisted case names, statuses, timings and counts are exported. The full private Vitest artifact stays under ignored `test-results/`.

| Gate | Result |
| --- | --- |
| New shared guard contract / in-memory | PASS, 9 cases |
| Targeted guard, voice and latency regression | PASS, 44 cases |
| Full offline regression | PASS, 1006 passed; 69 real database cases skipped by default |
| Prisma generate / validate | PASS |
| Typecheck | PASS |
| Production build | PASS |
| Client bundle audit | PASS, 69 JavaScript artifacts |
| `git diff --check` | PASS |
| Real PostgreSQL correctness | PASS, 69/69 real database cases; full selected run 134/134 including 65 HTTP/in-memory cases; zero failures/skips |

The new contract checks ownership rejection before model work, text/voice read counts, expiry before malformed-message parsing and expired replay, expiry during model wait, a competing text commit during STT, stale work after model wait, duplicate/conflicting replay and injected pre-commit rollback of header/action/receipt/messages. The existing PostgreSQL suite additionally covers categorical results with `trainingScore=null`, explicit critical events, immutable templates/history, coherent snapshots, concurrent CAS, expiry conflicts, resume and rollback across child/result writes.

[Live correctness evidence](postgres-phase5b-correctness.json): **2026-10-24 13:47:27.945–14:08:17.681 UTC**, duration 1,249,736 ms. All nine new contract cases passed against PostgreSQL as well as in-memory. Every recorded verification source hash matches the final runtime/test files. No test assertion, runtime transaction/provider deadline, retry rule, isolation level, result formula or authority rule was relaxed. The live verification ran after both benchmark windows, so it did not compete for database or CPU resources during timing samples.

## Remaining bottlenecks and boundary

Aggregate GET still has eight SELECTs plus three transaction controls; SAVE still has CAS, its complete reload and three measured child INSERTs. Projection and provider-boundary fresh reads remain. This phase deliberately leaves unknown equivalence cases untouched. A future persistence change should independently prove snapshot/decoder/history integrity before reducing relation fan-out or reloads. No State Machine, Decision Rule, Core/EventValidator/Scoring authority, result category, `trainingScore=null`, speech/AI/provider selection, schema, HTTP/protocol or frontend behavior was redesigned.
