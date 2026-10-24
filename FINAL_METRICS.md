# Final metrics and evidence review

## Isolated live verification addendum (2026-10-24)

The latest operational evidence is [the isolated PostgreSQL live report](docs/engineering/postgres-live-verification.md), based on application checkpoint `5c13cf078f0503e7b08998ea7ac5f12fee200ccd` plus the recorded compatibility/test patches. Connection/TLS, the dedicated fresh migration, and the exact 104-column catalog comparison passed. The first complete live test run found a real non-UTC timestamp defect (59/60 PASS); its failure is preserved. A version-bound adapter correction retains the original assertion. The complete post-fix live suite passed **60/60 PostgreSQL cases with zero skips**, or **125/125** including repeated HTTP mock cases.

Clean `npm ci`, Prisma generation/validation, typecheck, production build and the 69-artifact client audit passed after the correction. The final offline full suite passed **987 tests**, including four new post-change benchmark guard cases, with the **60 database cases deliberately excluded from that offline run**, not counted as passes; see [regression evidence](docs/engineering/postgres-local-regression-results.json). The live database run is separate. Lint remains NOT CONFIGURED.

The owner subsequently configured ElevenLabs and approved `eleven_v4_turbo`. The bounded synthetic TTS/Azure-STT roundtrip passed once; [speech evidence](docs/engineering/elevenlabs-live-verification.json) records the passing process/cache evidence and the per-provider console-telemetry gap without repeating paid calls. The [comparable post-change benchmark](docs/performance/latency-post-change.md) then completed 10+10 measured successes after 2+2 warmups at commit `abbcec3f93b28f3a5911b6d6d353c4a4e872c4f1`. **Latency regressed:** text p50 4,535.496 → 8,685.674 ms (+91.50%); voice 6,927.263 → 12,540.406 ms (+81.03%). Aggregate fetches remain 6/7 per turn; DB preflight/commit costs increased. No speedup or causal attribution to a single component is claimed. Production role restrictions, historical MySQL data/collation parity and restore/cutover rehearsal remain open. No production switch or optimization occurred. Historical sections below retain their original source-gate scope and counts.

**Scope: local source verification through Phase 3, 2026-10-24.** This report records code-level verification and the earlier bounded Phase 1 measurement. The latest measured service baseline predates the PostgreSQL preparation and the Azure-STT/ElevenLabs-TTS split. There is no post-change latency comparison.

Verified source commit for the final local gates: `5f8c48370d8713a436bf8f932cf9a5cca4e6812a`.

## Decision

**READY WITH NOTES for local code preparation; NOT READY for a production-readiness or post-change performance claim.** Phase 1 has a bounded live-provider baseline, and the PostgreSQL and voice changes pass local source gates. Those facts do not prove the PostgreSQL target works, that the new TTS provider is reachable, or that it improves latency or Thai quality. Keep PostgreSQL live verification, ElevenLabs live verification, and any production/cutover decision as separate open gates.

No extra provider calls were made to fill gaps. A further paid/live comparison must be explicitly authorized and capped; do not silently repeat or expand the Phase 1 run.

## Phase 1 live service baseline

The bounded baseline was collected on 2026-10-22 with the MySQL runtime repository, Groq `openai/gpt-oss-120b`, and Azure Speech. It used synthetic CC-01 template-v6 sessions, one measured learner turn per fresh session, concurrency one, two warmups and ten measured samples per cohort. The voice cohort included Azure STT and Azure TTS. This service measurement excludes HTTP authentication, transport/network time, browser work, and playback completion.

| Cohort | Measured turns | Total min | Total p50 | Total p95 (nearest rank) | Total max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Text | 10 | 3,752.1 ms | 4,171.8 ms | 4,908.7 ms | 4,908.7 ms |
| Voice | 10 | 5,959.2 ms | 7,213.9 ms | 9,492.2 ms | 9,492.2 ms |

At n=10, nearest-rank p95 is the maximum observed sample; it is exploratory, not a stable service-level estimate. Warmups are excluded. All 20 measured dialogue turns succeeded; all ten voice responses returned `READY`. No LLM fallback, TTS-unavailable result, operation failure, cancellation, replay, or retry was observed. Those zero counts describe this small run only.

| Stage | Text p50 | Text p95 | Voice p50 | Voice p95 |
| --- | ---: | ---: | ---: | ---: |
| Application DB preflight | 377.6 ms | 401.0 ms | 769.0 ms | 784.4 ms |
| Context construction | 0.1 ms | 0.7 ms | 0.1 ms | 0.2 ms |
| LLM provider call | 1,847.3 ms | 2,553.2 ms | 2,214.2 ms | 2,996.0 ms |
| Validation | 0.1 ms | 0.9 ms | 0.1 ms | 0.3 ms |
| AI envelope | 1,848.4 ms | 2,553.3 ms | 2,214.3 ms | 2,996.1 ms |
| Commit | 1,246.1 ms | 1,300.6 ms | 1,253.6 ms | 1,331.6 ms |
| Durable save (nested in commit) | 856.6 ms | 896.6 ms | 873.1 ms | 945.8 ms |
| Azure STT | n/a | n/a | 1,389.6 ms | 1,409.5 ms |
| Azure TTS | n/a | n/a | 656.0 ms | 2,914.2 ms |

The spans overlap and must not be added as though exclusive. Authentication and SQL query counts are unavailable, not zero. Repository counts are logical repository operations, not SQL statements: text recorded 70 reads and 10 writes; voice recorded 90 reads and 10 writes. The complete bounded report is [latency-baseline.md](docs/performance/latency-baseline.md), with its sanitized aggregate in [latency-baseline.json](docs/performance/latency-baseline.json).

**Provenance note:** the baseline report says its collection-time `HEAD` was `fc5af44c2773851179b8a3599d370c3a178b1cb2` and that the instrumentation/harness were uncommitted during collection. The reviewed source-preservation checkpoint was later recorded as `91e707f376372aed5bdf415dd7bbb32d58583536`. Do not conflate the collection-time SHA with the later preservation commit.

## Current measurements and verification status

| Area | Current evidence | Status |
| --- | --- | --- |
| Phase 1 text/voice latency | Values above; MySQL + Groq + Azure Speech. | **MEASURED — historical baseline** |
| Post-PostgreSQL latency | Isolated live database verification is PASS (60/60); the comparable live benchmark is recorded separately from integration-test timing. | **See latest operational/performance report** |
| Phase 3 speech source behavior | Local full suite plus focused speech and WebSocket regressions passed as listed below. | **PASS — local test doubles only** |
| ElevenLabs live compatibility / quality | One owner-approved `eleven_v4_turbo` TTS/Azure-STT roundtrip passed; human Thai quality is not established by that test. | **Compatibility PASS; human quality NOT REVIEWED** |
| Before/after latency delta | Comparable authenticated workload completed; combined new stack was slower in this run. Full stage statistics and limitations are in the post-change report. | **MEASURED — regression** |
| AI quality/safety | Offline evaluation-harness tests validate the harness only; no new model evaluation or qualified Thai review was completed. | **NOT REVIEWED / NOT RUN** |
| Authenticated WS / browser playback | Old/new loopback production-WS-handler measurements exist. Remote-browser rendering/playback and production login are outside both. | **WS MEASURED; browser NOT MEASURED** |

### Local source gates

After the Phase 3 source handoff, the following checks passed on 2026-10-24: Prisma schema validation and client generation, TypeScript typecheck, the offline AI harness tests (8/8, harness-only), the serialized full suite (58 files passed, 5 skipped; 971 tests passed, 60 skipped), focused speech tests (117/117 across 8 files), WebSocket tests (20/20 across 2 files), production build, and client bundle audit (69 JavaScript artifacts). Focused speech and WebSocket counts overlap the full suite and must not be added to it.

All 60 skipped tests are PostgreSQL-only cases, confirmed by verbose output with `POSTGRES_TEST_DATABASE_URL` set to an empty process-only value so no database connection could be allocated. Counts were: `accounts.postgres.test.ts` 4, `call-variants.postgres.test.ts` 1, `persistence.postgres.test.ts` 41, `postgres.metadata.test.ts` 7, and `quiz.postgres.test.ts` 6; `http.integration.test.ts` also contains 1 skipped PostgreSQL case while the rest of that file passed. These cases are **NOT RUN** database coverage, not integration passes. The build used a process-only loopback `DATABASE_URL` placeholder for static generation; `.env.local` was not edited. The initial default-parallel run on the earlier source encountered one test timeout and three worker-start timeouts. The final serialized run passed without relaxing the timeout.

The client audit found no server dependency/secret markers in those 69 artifacts. Lint is **NOT CONFIGURED** in the repository scripts. These are code checks, not live provider or database evidence. For details see [the PostgreSQL verification checklist](docs/engineering/postgres-verification.md).

## Remaining external gates

- The independent Azure STT / ElevenLabs TTS source split and focused regression gates are complete and passed locally. Missing, partial, or invalid ElevenLabs configuration resolves to unavailable TTS without preventing STT/text commit or making a vendor call; Azure TTS fallback remains disabled and committed text is preserved with audio unavailable.
- Keep live ElevenLabs verification **NOT RUN** unless the existing `npm run test:speech:live` check is separately authorized and configured. Thai model/voice/account compatibility and human language-quality review are unverified.
- Isolated PostgreSQL integration (60/60), catalog/trigger/race behavior, verified client TLS and the owner-approved test migration now PASS. A restricted production role, real source-data parity, backup/restore rehearsal and any production migration/cutover remain separate unverified gates. No production database was changed.
- If an after-change comparison is later authorized, freeze its workload, concurrency, sample count, provider/model/voice configuration, environment/region, source commit, and percentile method first. Report each provider/stage separately, preserve missing values as unavailable, and explain differences from the old MySQL/Azure baseline.
- QLoRA remains **BLOCKED**: no licensed base model/checkpoint or tokenizer, curated dataset, training runtime/environment, GPU/memory budget, or approved split manifest is established. Do not report training or model-comparison metrics.
- Phase 5 persistence-read optimization: **NO CHANGE**. The new measurement prioritizes database-path diagnosis, then a reviewed read-sharing design that preserves ownership, expiration, replay, CAS and atomicity. The isolated correctness suite is green, but no read-removal change is approved or implemented.
- Phase 6 perceived-latency/streaming work: **NO CHANGE**. The old service trace does not measure browser playback or perceived completion, and streaming/cancellation/reconnect/load gates have not been designed and passed.

## Interpretation rules

- Do not treat a skipped test, unavailable metric, null count, mock result, or source-level guard as a successful live gate.
- Keep service latency, database integration, language quality/safety, and browser-perceived latency separate.
- The original baseline is a small exploratory sample, not a performance target, SLO, or claim about the current PostgreSQL-prepared source.
- Update this report only from reviewed, reproducible evidence. Record the exact code commit and environment scope; never include credentials, connection URLs, user data, raw transcripts, audio, or retained-session identifiers.
