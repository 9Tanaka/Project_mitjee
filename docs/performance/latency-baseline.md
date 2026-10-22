# Phase 1 latency baseline

## Result

The bounded live run completed on 2026-10-22 with all planned samples successful. It used the MySQL runtime repository and live Groq/Azure providers; it was not a mock-only run. Each cohort had two warmups followed by ten measured samples. All 20 measured dialogue turns succeeded: there were no LLM fallbacks, committed TTS-unavailable outcomes, operation failures, cancellations, replays, or retries. Voice synthesis returned `READY` for all ten measured voice turns.

| Cohort | Measured turns | Total min | Total p50 | Total p95 (nearest rank) | Total max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Text | 10 | 3,752.1 ms | 4,171.8 ms | 4,908.7 ms | 4,908.7 ms |
| Voice | 10 | 5,959.2 ms | 7,213.9 ms | 9,492.2 ms | 9,492.2 ms |

At n=10, nearest-rank p95 is the maximum observation. Treat it as exploratory, not as a stable service-level estimate. Warmups are excluded from all latency distributions.

| Stage | Text p50 | Text p95 | Voice p50 | Voice p95 |
| --- | ---: | ---: | ---: | ---: |
| Authentication | unavailable | unavailable | unavailable | unavailable |
| Application DB preflight | 377.6 ms | 401.0 ms | 769.0 ms | 784.4 ms |
| Context | 0.1 ms | 0.7 ms | 0.1 ms | 0.2 ms |
| LLM provider call | 1,847.3 ms | 2,553.2 ms | 2,214.2 ms | 2,996.0 ms |
| Validation | 0.1 ms | 0.9 ms | 0.1 ms | 0.3 ms |
| Retry span | unavailable | unavailable | unavailable | unavailable |
| AI envelope | 1,848.4 ms | 2,553.3 ms | 2,214.3 ms | 2,996.1 ms |
| Commit | 1,246.1 ms | 1,300.6 ms | 1,253.6 ms | 1,331.6 ms |
| Durable save | 856.6 ms | 896.6 ms | 873.1 ms | 945.8 ms |
| STT | not applicable | not applicable | 1,389.6 ms | 1,409.5 ms |
| TTS | not applicable | not applicable | 656.0 ms | 2,914.2 ms |

These spans are not additive. `ai` surrounds generation/retry/fallback and overlaps the `llm` and validation spans. `commit` includes the existing commit path; `durable_save` is nested within it. Authentication and SQL query counts are `null`, not zero: this was a direct service-level trace, without HTTP authentication, and no trustworthy request-correlated SQL counter was enabled. The repository counts below are logical repository operations only.

Measured text turns recorded 70 logical repository reads and 10 writes (40 `get`, 30 `getTemplate`, 10 `save`). Voice turns recorded 90 logical reads and 10 writes (50 `get`, 40 `getTemplate`, 10 `save`). All observed operations succeeded. These figures must not be interpreted as SQL statement counts.

## Frozen method and scope

- Scenario: CC-01, authored template v6, with each fresh session advanced to `IDENTITY_CLAIM` before measurement; one learner turn per session.
- Concurrency: one. Live cap: 24 successful live dialogue calls total, including the four warmups; the run used exactly 24 (20 measured plus 4 warmups).
- Text turns used the application message service. Voice turns used the voice application service, including live STT, the measured dialogue turn, commit, and live TTS.
- Each sample used a fresh synthetic session retained in the configured MySQL runtime. Session setup actions and mock caller openings were outside measured traces. The run retained 24 synthetic sessions, used 24 setup actions and 48 mock openings; it did not clean them up.
- The single 102,044-byte synthetic WAV input fixture was generated with Azure before measurement and took 935 ms. Application initialization was 3,380 ms, reported separately from warm turn timing.
- Provider metadata reported Groq with model `openai/gpt-oss-120b` and Azure Speech. Provider credentials, endpoint/region values, SQL, per-sample traces, and user/character text are intentionally not reproduced here.
- Percentiles use the nearest-rank method. The full sanitized aggregate is in [latency-baseline.json](latency-baseline.json). The ignored run artifacts live under `frontend-artifacts/`; the retained-session manifest contains session identifiers and should stay local.

The benchmark traces are labeled `service`. They do not include HTTP authentication, transport/network latency, browser work, audio playback, or client-perceived completion. A null value means that the stage/count was not measured in this setup; it is never evidence of zero cost. LLM fallback and TTS-unavailable are separate outcome dimensions, even though both were zero in this run.

## Reproduction and limitations

The harness was run from the working tree with silently loaded local environment configuration. The report records base `HEAD` `fc5af44c2773851179b8a3599d370c3a178b1cb2`, but Phase 1 instrumentation and benchmark files were uncommitted at collection time; the SHA alone is not a complete source snapshot. Preserve the reviewed Phase 1 changes together with this report when establishing the reproducible benchmark commit. Do not rerun live merely to replace this record; a future comparison should use the same frozen workload and provider/model configuration and separately disclose environment changes.

There was no dedicated MySQL test database, so MySQL integration tests and end-to-end tests were **NOT RUN**. No migrations or destructive cleanup were performed. The live run only created the explicitly authorized synthetic benchmark sessions. A deterministic in-memory synthetic run is separate evidence and its latency numbers must never be combined with these live results.

The separate in-memory harness validation completed earlier the same day: two warmups and 30 measured turns per cohort, with 30/30 mock-success outcomes for text and 30/30 for voice. This establishes that the harness can run a larger deterministic sample; it is not real-provider evidence and contributes no values to the live distributions.

The small sample is suitable as a first bounded baseline, not a performance target or proof of production behavior. It does not provide authenticated HTTP/WS totals, actual SQL counts, client playback timing, language-quality review, or a reliable p95 confidence estimate. Any optimization remains a separate evidence and review decision.

## Verification status

Verification completed after collection:

- Full Vitest suite: **PASS**, 55 files passed and 4 skipped; 897 tests passed and 49 skipped. The MySQL test URL was absent for this run.
- Typecheck: **PASS**.
- Production build: **PASS**.
- Client bundle audit: **PASS**, 69 JavaScript artifacts checked; server dependency and secret-name markers were absent.
- Prior SOL focused source regression: **PASS**, 168 passed and 1 skipped across 9 files; focused voice integration rerun: 17/17 passed. Focused benchmark-helper tests: 4/4 passed.
- `test:mysql` and `test:e2e`: **NOT RUN**, because no dedicated test database is available. These are not counted as passing.
