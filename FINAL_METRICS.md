# Final metrics and evidence review

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
| Post-PostgreSQL latency | No real PostgreSQL service/database was configured or measured. | **NOT MEASURED** |
| Phase 3 speech source behavior | Local full suite plus focused speech and WebSocket regressions passed as listed below. | **PASS — local test doubles only** |
| ElevenLabs TTS latency/audio quality | No account, key, voice/model access was tested and no live request was made. | **NOT RUN** |
| Before/after latency delta | No comparable post-change run exists; provider and persistence stack are changing. | **NOT AVAILABLE** |
| AI quality/safety | Offline evaluation-harness tests validate the harness only; no new model evaluation or qualified Thai review was completed. | **NOT REVIEWED / NOT RUN** |
| Authenticated HTTP/WS or browser playback | Not part of the service-level baseline; no updated end-to-end measurement is recorded here. | **NOT MEASURED** |

### Local source gates

After the Phase 3 source handoff, the following checks passed on 2026-10-24: Prisma schema validation and client generation, TypeScript typecheck, the offline AI harness tests (8/8, harness-only), the serialized full suite (58 files passed, 5 skipped; 971 tests passed, 60 skipped), focused speech tests (117/117 across 8 files), WebSocket tests (20/20 across 2 files), production build, and client bundle audit (69 JavaScript artifacts). Focused speech and WebSocket counts overlap the full suite and must not be added to it.

All 60 skipped tests are PostgreSQL-only cases, confirmed by verbose output with `POSTGRES_TEST_DATABASE_URL` set to an empty process-only value so no database connection could be allocated. Counts were: `accounts.postgres.test.ts` 4, `call-variants.postgres.test.ts` 1, `persistence.postgres.test.ts` 41, `postgres.metadata.test.ts` 7, and `quiz.postgres.test.ts` 6; `http.integration.test.ts` also contains 1 skipped PostgreSQL case while the rest of that file passed. These cases are **NOT RUN** database coverage, not integration passes. The build used a process-only loopback `DATABASE_URL` placeholder for static generation; `.env.local` was not edited. The initial default-parallel run on the earlier source encountered one test timeout and three worker-start timeouts. The final serialized run passed without relaxing the timeout.

The client audit found no server dependency/secret markers in those 69 artifacts. Lint is **NOT CONFIGURED** in the repository scripts. These are code checks, not live provider or database evidence. For details see [the PostgreSQL verification checklist](docs/engineering/postgres-verification.md).

## Remaining external gates

- The independent Azure STT / ElevenLabs TTS source split and focused regression gates are complete and passed locally. Missing, partial, or invalid ElevenLabs configuration resolves to unavailable TTS without preventing STT/text commit or making a vendor call; Azure TTS fallback remains disabled and committed text is preserved with audio unavailable.
- Keep live ElevenLabs verification **NOT RUN** unless the existing `npm run test:speech:live` check is separately authorized and configured. Thai model/voice/account compatibility and human language-quality review are unverified.
- Keep PostgreSQL integration, catalog/trigger/race behavior, and live TLS handshake **NOT RUN** without the dedicated isolated database, direct migration URL, trusted CA, and approved test target. No database was provisioned or migrated.
- If an after-change comparison is later authorized, freeze its workload, concurrency, sample count, provider/model/voice configuration, environment/region, source commit, and percentile method first. Report each provider/stage separately, preserve missing values as unavailable, and explain differences from the old MySQL/Azure baseline.
- QLoRA remains **BLOCKED**: no licensed base model/checkpoint or tokenizer, curated dataset, training runtime/environment, GPU/memory budget, or approved split manifest is established. Do not report training or model-comparison metrics.
- Phase 5 persistence-read optimization: **NO CHANGE**. Existing measurements do not justify changing the snapshot/read/CAS path; the phase's race/ownership/expiration gates are not ready.
- Phase 6 perceived-latency/streaming work: **NO CHANGE**. The old service trace does not measure browser playback or perceived completion, and streaming/cancellation/reconnect/load gates have not been designed and passed.

## Interpretation rules

- Do not treat a skipped test, unavailable metric, null count, mock result, or source-level guard as a successful live gate.
- Keep service latency, database integration, language quality/safety, and browser-perceived latency separate.
- The original baseline is a small exploratory sample, not a performance target, SLO, or claim about the current PostgreSQL-prepared source.
- Update this report only from reviewed, reproducible evidence. Record the exact code commit and environment scope; never include credentials, connection URLs, user data, raw transcripts, audio, or retained-session identifiers.
