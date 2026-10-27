# Bounded live speech verification

Date: 2026-10-24. Application base: `5c13cf078f0503e7b08998ea7ac5f12fee200ccd`; the speech factory/provider/test files are unchanged from that checkpoint and their hashes are in [the sanitized evidence](elevenlabs-live-verification.json). This gate ran only after isolated PostgreSQL verification passed 60/60.

The owner configured the existing three ElevenLabs variables privately and explicitly approved `eleven_v4_turbo`. No environment file was rewritten, and no API key, voice identifier, transcript or audio was logged or saved.

## Actual live result

| Check | Result |
| --- | --- |
| Configured model/voice metadata | PASS: two bounded GET requests returned HTTP 200; the selected model was present, TTS-capable and listed Thai; the selected voice was found. |
| Real ElevenLabs synthesis | PASS: one synthetic Thai phrase through the existing synchronous provider using `eleven_v4_turbo`. |
| PCM/WAV contract | PASS: existing provider and `validateWav` accepted canonical mono, 16 kHz, PCM16 RIFF/WAVE audio. |
| Real Azure STT | PASS: one transcription of that generated audio returned nonempty Thai-script text. |
| Full roundtrip test | PASS: `tests/speech.live.ts`, exit code 0 and Vitest cache `failed=false`. Test-module duration was 8,425.7201 ms, including module/test overhead; this is not an isolated TTS latency. |
| Human Thai pronunciation/naturalness | NOT REVIEWED. Thai-script recognition does not establish perceptual quality. |

The completed single-test harness calls synthesis once and transcription once, with retry disabled and the existing speech deadlines unchanged. No paid replay or load test was used to repair missing telemetry. Forced provider failures, timeout/abort and committed-text fallback are covered by the existing offline speech/service tests in the 983-pass full regression; no extra live failure injection was performed. This does not claim empirical live abort behavior for a deliberately interrupted vendor request.

## Telemetry limitation

The first instrumented launch used an unsupported Vitest `setupFiles` CLI flag and made no provider request. It was corrected to an equivalent temporary configuration with a setup file. The real test completed successfully, but the wrapper's console-JSON collector did not capture the test/provider messages. Its initial summary therefore incorrectly classified the missing telemetry as FAIL despite recording exit code 0. Reconciliation used the unchanged test assertions and the matching passing Vitest cache entry. The evidence now records PASS with `ttsRequestsObserved=null`, harness-derived request counts, and missing per-provider timings explicitly. Raw provider output was never printed or retained, and another synthesis was not requested to fill the gap.

## Model/API scope

The current official [model overview](https://elevenlabs.io/docs/overview/models) lists `eleven_v4_turbo`; [model metadata](https://elevenlabs.io/docs/api-reference/models/list) exposes capabilities, and the [Create speech endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) requires a TTS-capable model. Some model-specific prose emphasizes Text to Dialogue WebSocket availability. The actual metadata and synchronous PCM request in this run establish support for this selected account/model/voice combination, rather than assuming every endpoint/voice combination works. No WebSocket feature or vendor/provider selection was changed.

The separately authorized [comparable benchmark](../performance/latency-post-change.md) subsequently completed with twelve real voice turns (two warmups and ten measured), all with audio READY. Its own TTS/STT spans provide separate per-turn timing evidence; it was not a paid replay solely to fill this test's log gap. The combined new stack was slower in that measurement. Integration-test duration and this one roundtrip are not used to establish a speedup against the old MySQL/Azure benchmark.
