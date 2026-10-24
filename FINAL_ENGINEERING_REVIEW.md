# Final engineering review

## Operational addendum by primary agent (2026-10-24)

The historical architecture/source review below is retained. New owner-approved isolated PostgreSQL evidence is in [the live report](docs/engineering/postgres-live-verification.md). The live run exposed a non-UTC TIMESTAMPTZ adapter defect; a narrowly version/build-guarded compatibility patch corrects serialization/parsing without changing Core, State Machine, repository interfaces or Decision Rule semantics. Its original non-UTC regression passes on the real database after clean installation. Local gates pass, including 983 offline tests, generation/validation, typecheck, production build and client audit. The complete post-fix live rerun passed **60/60 PostgreSQL cases, zero skips** (125/125 including repeated mock cases).

This addendum is an operational verification record, not a new ASTRA review or production approval. The owner-approved `eleven_v4_turbo` synthetic TTS/Azure-STT roundtrip subsequently passed once; per-provider console timing telemetry was not captured and no paid replay was made for that gap. The separately authorized [post-change benchmark](docs/performance/latency-post-change.md) then completed at `abbcec3f93b28f3a5911b6d6d353c4a4e872c4f1`: all 24 turns succeeded, but measured text/voice p50 regressed to 8,685.674/12,540.406 ms. Database preflight and commit are the first diagnostic priority. The final offline suite, including benchmark guards, passed 987 tests. No optimization was implemented. Restricted runtime-role enforcement, real historical-data parity/restore rehearsal and qualified Thai-quality review remain open. The owner-approved test migration does not authorize a production migration, environment cutover or MySQL removal.

Reviewer: ASTRA. Review date: 2026-10-24. Decision: **READY_WITH_NOTES for code/setup preparation; NOT_READY for production deployment or cutover.** Final local gates passed. The outstanding live gates below prevent production approval.

## Scope and evidence

This review covers the approved sequence of instrumentation and baseline, PostgreSQL/Supabase code preparation, independent Azure STT and ElevenLabs TTS, and offline AI evaluation tooling. It does not authorize infrastructure provisioning, environment changes, database migration execution, data transfer, cutover, additional paid evaluation, or training.

The reproducible old-stack checkpoint is `91e707f376372aed5bdf415dd7bbb32d58583536`. The offline AI harness is recorded at `480b104`; PostgreSQL preparation is recorded at `840744c`; the verified speech implementation is recorded at `5f8c48370d8713a436bf8f932cf9a5cca4e6812a`. The original benchmark collection-time HEAD predates the preservation commit; the report explicitly records that instrumentation was uncommitted during collection.

The old MySQL/Groq/Azure service baseline measured ten text and ten voice turns after two warmups per cohort, concurrency one, using synthetic CC-01 inputs. Text total p50/p95 was 4,171.76/4,908.74 ms; voice was 7,213.91/9,492.16 ms. All measured turns succeeded, and all voice samples returned audio. At ten samples, nearest-rank p95 is the maximum, not a stable production tail estimate. These are historical service timings, excluding authentication, browser delivery and playback. No PostgreSQL/ElevenLabs after-change speedup has been measured.

## Architecture and invariants

The decision rule, pinned template mode, categorical null training score, historical weighted results, quiz scoring separation and backend-only authority remain requirements. Speech receives sanitized committed character text and has no result, action, event or transition authority. Ownership, expiration, idempotency, fresh authoritative reads, CAS, aggregate atomicity and replay remain in the existing backend flow.

PostgreSQL source preparation was approved in the engineering plan. The new migration history, archived MySQL history/source, translated immutability triggers, UTC millisecond timestamps, deterministic collation policy, JSON null handling, runtime/CLI verified TLS policies and dedicated-test target guards are prepared. The temporary MariaDB dependency and old-stack checkpoint remain intentionally available. Real PostgreSQL catalog, trigger, transaction, race, TLS, role and historical-data parity verification remains NOT RUN. In particular, noncanonical historical quiz collation equivalence is a cutover blocker.

Phase 3 review confirms independent factories, Azure STT preservation, explicit ElevenLabs model/voice/key configuration, fixed HTTPS PCM request, bounded response reading, canonical WAV framing, abort/deadline behavior, generic errors and committed-text fallback. The fixed PCM buffer bounds both stored bytes and per-chunk metadata; the 4 MiB WAV cap is independent of the STT input cap. The existing service commits before TTS and replays committed turns without repeating providers. The partial/invalid TTS configuration finding is resolved: construction returns an unavailable provider, and the regression matrix verifies no vendor calls while a service regression verifies successful STT and durable text commit. No remaining source blocker was found within the approved scope. The opt-in live roundtrip is prepared but was not run.

The offline AI harness was approved after exact measured case-ID set equality was added to comparison eligibility. Its 19 synthetic cases and eight self-tests establish harness behavior only. Human Thai quality, live model safety and comparative optimization evidence remain unassessed. No prompt/history/model/retry optimization is approved.

## Outstanding gates and decisions

| Area | Decision or outstanding evidence |
| --- | --- |
| Phase 1 | Accepted historical baseline and instrumentation; production latency/SLO claims unsupported. |
| Phase 2 | Code preparation accepted; subsequent isolated PostgreSQL acceptance PASS 60/60. Production replacement/cutover not authorized. |
| Phase 3 | Source preparation accepted; bounded live account/model/voice/PCM/STT compatibility subsequently PASS, and separate benchmark TTS spans measured. Human Thai quality NOT REVIEWED. |
| Phase 4a | Offline evaluation harness accepted; live quality/safety review NOT RUN. |
| Phase 4b | NO CHANGE: no comparable quality-controlled optimization evidence. |
| QLoRA | BLOCKED: no established licensed checkpoint/tokenizer, curated dataset/split, GPU budget or training environment. No pilot/full training or adapter evaluation occurred. |
| Phase 5 | NO CHANGE: isolated correctness and post-change measurements now exist; diagnose DB cost and review any consistency-preserving read-sharing design before implementation. |
| Phase 6 | NO CHANGE: browser-perceived latency is unmeasured; streaming ordering/cancellation/reconnect/load design is not approved. Existing committed-text-before-audio behavior remains. |

## Verification and readiness

LUNA's final verification, relayed by root, passed Prisma validation/generation, TypeScript typecheck, the full serialized suite (971 tests passed and 60 skipped; 58 files passed and five skipped), focused speech tests (117/117), WebSocket tests (20/20), production build and client bundle audit (69 JavaScript artifacts). The 60 skipped PostgreSQL-dependent cases are NOT RUN database coverage, not passing integration evidence. Lint is NOT CONFIGURED. These final results supersede the earlier PostgreSQL-only preparation gate for local source readiness. The reviewed Phase 3 state is the working-tree handoff atop `840744c`; root records the exact voice/report commit after this review, so no future SHA is invented here.

Code/setup preparation is READY_WITH_NOTES: the approved implementation and local verification are complete, with the live prerequisites explicitly documented. Production deployment/cutover readiness is NOT_READY until live database behavior, verified TLS and deployment roles, historical-data parity/rollback rehearsal, ElevenLabs account/audio compatibility and qualified Thai review are satisfied. The existing MySQL deployment and private environment were not transitioned by this work. No additional live provider evaluation or performance improvement is claimed. QLoRA and optimization exclusions are deliberate unmet evidence gates, not hidden implementation completion claims.

See [the engineering plan](ENGINEERING_PLAN.md), [final metrics](FINAL_METRICS.md), [baseline report](docs/performance/latency-baseline.md), [Supabase setup](docs/engineering/supabase-setup.md), [PostgreSQL verification](docs/engineering/postgres-verification.md), [ElevenLabs setup](docs/engineering/elevenlabs-setup.md) and [AI evaluation guide](docs/engineering/ai-evaluation.md) for the evidence and operating boundaries.
