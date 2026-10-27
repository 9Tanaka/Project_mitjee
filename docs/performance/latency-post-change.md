# Post-change latency: PostgreSQL and ElevenLabs

The new stack passed the bounded functional gates, but **latency regressed in this measurement**. Text p50 rose from 4,535.496 to 8,685.674 ms (+91.50%); voice p50 rose from 6,927.263 to 12,540.406 ms (+81.03%). No speedup is claimed, and no read removal, prompt optimization, streaming or perceived-latency redesign was implemented.

## Exact source and environment

- Branch: `feat/rule-based-evaluation`.
- New measurement commit: `abbcec3f93b28f3a5911b6d6d353c4a4e872c4f1`.
- Old authenticated measurement commit: `c7e0a2ce7cd9bfc529b9f57822ccec7c6e08e479`.
- New run: 2026-10-24 07:12:47.774–07:25:30.051 UTC. The old run's exact timestamps are retained in its JSON.
- Same Windows x64 workstation / Node v24.19.0 / Azure Speech SDK 1.51.0 / Prisma 7.10.0. The new adapter includes the reviewed, version/build-bound TIMESTAMPTZ correction described in the [live database report](../engineering/postgres-live-verification.md).
- Old: remote MySQL + Groq `openai/gpt-oss-120b` + Azure STT/TTS.
- New: owner-approved isolated Supabase PostgreSQL 17.11 through the session pooler, verified client TLS, `pg` 8.23.1, the same Groq model, Azure STT and owner-approved ElevenLabs `eleven_v4_turbo` TTS. Azure region matches the baseline. The private selected voice is identified only by a fingerprint in the JSON; keys, URLs and voice IDs are omitted.
- Application/benchmark source was committed before measurement. The dirty tree contains excluded user documentation, private certificate files and new reports; it does not contain uncommitted application/benchmark source.

## Method and privacy boundary

Both runs use CC-01 immutable template v6, one learner turn per fresh session beginning in IDENTITY_CLAIM, concurrency one, two warmups and ten measured samples per text/voice cohort, and the unchanged production WebSocket handler on loopback. SocketCookieAuthenticator verifies an ephemeral valid Auth.js encrypted JWT. Token creation and the socket handshake are outside the turn. This is not production login/password hashing or a remote-browser timing.

The scenario provider is live only during measured/warmup learner turns. Each fresh session receives one answer action and two deterministic mock caller openings outside its trace, as in the baseline: 24 setup actions, 48 mock openings, and 24 retained synthetic sessions. The run is capped at 24 logical live dialogue turns, with the existing initial-attempt/one-retry policy and early-stop rules. All 24 completed successfully with zero retries.

One Azure-generated synthetic input WAV was reused for all voice samples, following the same `th-TH-PremwadeeNeural`, Thai text and mono 16 kHz PCM16 policy as the baseline. Its setup request took 660 ms and produced 102,044 bytes outside the measured trace. The old waveform was not retained, so byte-identical audio cannot be demonstrated; the generation policy matches. Runtime response TTS uses ElevenLabs, not this benchmark-only Azure input generator. No runtime speech selection or protocol was changed.

The dedicated URL guard and passing PostgreSQL/live-speech evidence are required by `--post-change`. The guard checks matching source/dependency hashes before any paid work. Runtime `DATABASE_URL` is never substituted or rewritten. There was no reset, migration, production access, cleanup of user records or infrastructure provisioning during this benchmark. Synthetic records remain in the approved test database.

Records contain numerical spans, counts, closed outcome categories and pseudonymous correlation only. Raw text/audio, credentials, database URLs, certificates and provider bodies are excluded. The retained-session manifest stays in ignored local artifacts.

## Total latency

Server total in milliseconds; warmups excluded:

| Cohort / stack | n | min | p50 | p95 | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Text — old | 10 | 4,298.582 | 4,535.496 | 5,031.751 | 5,031.751 |
| Text — new | 10 | 8,382.497 | 8,685.674 | 9,285.286 | 9,285.286 |
| Voice — old | 10 | 6,574.897 | 6,927.263 | 8,104.219 | 8,104.219 |
| Voice — new | 10 | 12,187.052 | 12,540.406 | 13,235.779 | 13,235.779 |

New p95 increased by 84.53% for text and 63.32% for voice. Positive deltas mean slower. At n=10, nearest-rank p95 is the maximum observed sample, not a stable production tail estimate.

## Stage comparison

Milliseconds, p50 (old → new). Full min/p50/p95/max and p95 comparisons are in the JSON:

| Stage | Text | Voice |
| --- | ---: | ---: |
| auth | 1.268 → 1.073 | 1.037 → 1.121 |
| DB preflight | 754.608 → 2,155.477 | 1,121.721 → 3,428.497 |
| STT | unavailable | 1,394.411 → 1,395.153 |
| context build | 0.111 → 0.112 | 0.084 → 0.081 |
| LLM | 1,761.913 → 1,618.035 | 1,799.125 → 1,679.211 |
| commit | 1,202.334 → 2,747.295 | 1,189.970 → 2,739.810 |
| durable save, nested in commit | 825.163 → 1,476.224 | 829.857 → 1,472.472 |
| TTS | unavailable | 591.762 → 1,107.589 |

Commit contains durable save. LLM/validation/retry envelopes overlap; context's preceding database load and some projection work also occur outside the named context span. These stages and their percentiles must not be added to reconstruct total. Provider spans include network/adapter/body handling, not isolated model inference or TTFT.

The larger DB preflight and commit costs are the clearest observed contributors to the regression. STT was effectively unchanged in this small sample; the LLM was slightly faster observationally. New TTS p95 was 1,980.765 ms versus 782.541 ms before. Different generated caller text lengths and remote load can affect provider timing, so these figures do not establish a causal provider/model advantage or disadvantage.

## Reads, writes, retries and outcomes

Counts per measured turn are unchanged:

| Counter | Text | Voice |
| --- | ---: | ---: |
| Actual aggregate DB fetches, including SAVE reload | 6 | 7 |
| Repository GET calls | 5 | 6 |
| Template port calls, including cache hits | 4 | 5 |
| All logical repository reads | 9 | 11 |
| Successful aggregate commits | 1 | 1 |
| Provider retries | 0 | 0 |

Across measured samples: text has 60 successful aggregate fetches / ten aggregate commits; voice has 70 / ten. SQL statement counts remain unavailable. A relation-inclusive fetch can execute several SELECTs, and one aggregate commit contains several writes. All twenty measured turns succeeded; all ten measured voice replies had audio READY. No LLM fallback, TTS-unavailable result, operation failure, cancellation or replay was observed. Warmups also passed; their timings do not enter the tables.

## Next optimization proposal — not implemented

1. **HIGH: diagnose database access cost first.** Compare sanitized operation timings and actual statement/roundtrip counts, database placement and connection/pooler behavior on the isolated target. DB preflight is now 2.16/3.43 seconds p50 and commit about 2.74 seconds. Aggregate counts alone cannot identify network, query, relation-loading or pooler cost. Do not change the production endpoint based on this one run.
2. **HIGH: design any redundant-read reduction only after that diagnosis.** Six/seven aggregate fetches per turn remained unchanged. Evaluate which reads can be shared while preserving ownership, expiry across waits, revision/CAS, replay and atomicity. Require the repository/race tests and a same-workload before/after run for each change. This report does not approve removing a consistency-protecting read.
3. **MEDIUM: isolate TTS tail and payload effects.** Add privacy-safe character/byte counts and separate headers/body timings if needed; then evaluate options with the owner's approved model and audio contract. Keep `eleven_v4_turbo` and the current deadlines until a separate reviewed change. No streaming or model substitution occurred here.
4. **LOW in this run: auth, context and prompt micro-optimization.** Cookie verification is about 1 ms and context construction about 0.1 ms. The LLM was not the observed source of the new DB-side regression. Prioritize evidence over changing these paths.

Perceived-latency work remains separate: browser rendering/playback and user-perceived timing were not measured, and the existing committed-text-before-audio behavior remains unchanged.

## Evidence and reproduction

- [New numerical summary and comparisons](latency-post-change-websocket.json).
- [All 24 raw numerical samples, with warmups identified](latency-post-change-websocket-samples.csv).
- [Old authenticated baseline](latency-baseline.md), [old JSON](latency-baseline-websocket.json), [old samples](latency-baseline-websocket-samples.csv).
- [Isolated PostgreSQL acceptance](../engineering/postgres-live-verification.md) and [bounded live speech acceptance](../engineering/elevenlabs-live-verification.md).

From the measurement commit, after supplying the existing private configuration and verifying the same isolated target:

```text
npm ci
node scripts/benchmark-latency.mjs --synthetic --websocket --post-change
node scripts/benchmark-latency.mjs --live --websocket --post-change
```

The historical `--live` command without `--post-change` still fails closed and points to the exact old-stack checkout. A future live rerun creates retained synthetic sessions and incurs provider requests; do not repeat or expand the sample plan automatically.

## Verification and remaining limits

Clean install, Prisma validate/generate, typecheck, the full offline suite (987 passed; sixty database cases separately verified), real PostgreSQL 60/60, benchmark guard/statistics 9/9, synthetic authenticated benchmark 30+30 measured samples, production build, 69-artifact client audit and diff checks passed. Lint is NOT CONFIGURED.

The `pg` driver emitted its deprecation warning about concurrent query calls on one client. The pinned 8.23.1 driver completed this run; compatibility with a future pg 9 upgrade was not verified. Do not relabel this warning as a measured SQL bottleneck.

There is no SQL-level profiling, pure inference timing, remote-browser/playback measurement, production login test, concurrency-20 capacity claim, qualified Thai quality evaluation, historical MySQL data-transfer parity or production role/cutover approval. Database location/path, engine, adapter and TTS changed together across runs. This is a small combined-stack observation, not a causal experiment. DECISION_RULES_V1, categorical results and `trainingScore: null` semantics remain unchanged; official results were not benchmarked.
