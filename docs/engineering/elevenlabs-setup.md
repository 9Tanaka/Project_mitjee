# ElevenLabs TTS setup

**Status: Phase 3 code preparation; local gates passed 2026-10-24.** This guide describes the verified server-side provider split and the remaining live setup checks. No ElevenLabs request was made, and no credentials, account access, voice/model entitlement, Thai quality, or live audio have been verified. No environment file was changed.

## Provider boundary

Phase 3 keeps Azure Speech for speech-to-text (STT) and adds ElevenLabs for text-to-speech (TTS). The existing Azure variables remain:

| Variable | Purpose after the split |
| --- | --- |
| `AZURE_SPEECH_KEY` | Server-only Azure STT credential. |
| `AZURE_SPEECH_REGION` | Azure Speech resource region used by STT. |

ElevenLabs requires all three provider settings, with no guessed model default:

| Variable | Purpose | Handling |
| --- | --- | --- |
| `ELEVENLABS_API_KEY` | Authenticates the server request. | Secret; server environment only. |
| `ELEVENLABS_VOICE_ID` | Selects a voice available to the owner's account. | Non-secret identifier, but server-only configuration. Choose a voice that is suitable for Thai with the selected model. |
| `ELEVENLABS_MODEL_ID` | Selects the synthesis model. | Required; do not rely on the API's default model. Confirm the exact model identifier and account access before use. |

Current ElevenLabs model documentation lists Thai for Eleven v3 and v4, but the API path matters: v3 is available through the Text to Speech API used here, while v4 is listed for the Text to Dialogue API. For this synchronous adapter, select an explicit model supported by the Text to Speech endpoint; `eleven_v3` is a Thai-capable candidate, but the owner's account access and the requested PCM format remain unverified. Do not set `eleven_v4` for this adapter without changing the endpoint and reviewing the response contract. The endpoint's default model, `eleven_multilingual_v2`, does not list Thai; an ignored or unsupported `language_code` does not make it Thai-capable. Thai language listing is not proof that a particular account, voice, model combination, or subscription can synthesize Thai successfully. Review Thai output quality before production use. See [provider research](./provider-research.md) for the research snapshot and the official [Text to Speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [model overview](https://elevenlabs.io/docs/overview/models), and [language support](https://elevenlabs.io/docs/help-center/other/what-languages-do-you-support) references (checked 2026-10-23).

Do not put `ELEVENLABS_API_KEY` in a `NEXT_PUBLIC_*` variable, browser bundle, client request, source file, or report. The browser must continue to call the application's existing same-origin voice endpoints; it must never call ElevenLabs directly. Do not log the key, authorization headers, raw provider error bodies, user transcripts, or generated audio.

## Audio contract

The existing application voice contract accepts and returns canonical `audio/wav`: mono, 16,000 Hz, signed 16-bit PCM. Request ElevenLabs PCM at `pcm_16000` (signed 16-bit little-endian) and wrap the returned PCM bytes into a canonical RIFF/WAVE container in the backend. Do not relabel raw PCM or MP3 bytes as WAV, and do not add browser-side decoding or transcoding.

The backend WAV helper must validate provider output before returning it: nonempty PCM, an even number of bytes, correct sample-rate/channel/bit-depth metadata, valid RIFF/data lengths, and the existing 4 MiB TTS response cap. For mono PCM16 at 16 kHz, the byte rate is 32,000 bytes/second and each sample frame is 2 bytes. Invalid, oversized, or incomplete provider output is an unavailable-audio result, not a successful WAV.

The browser microphone's input contract is separate: a bounded 30-second canonical mono 16 kHz PCM16 WAV, at most 960,044 bytes including its header. Keep the STT input limit distinct from the TTS output cap.

## Commit, fallback, and replay behavior

The existing service flow commits the dialogue result before requesting TTS. A TTS timeout, cancellation, unavailable provider, invalid response, or missing TTS configuration must not undo a committed turn. Return the committed text with audio unavailable (`audioStatus: UNAVAILABLE`, with no audio payload). Text remains usable even when ElevenLabs is not configured. Do not automatically fall back to Azure synthesis: after the split Azure is the STT provider, not a backup TTS provider.

STT and TTS remain independent ports. TTS receives only the sanitized character text selected by the backend after commit; clients cannot submit arbitrary synthesis text. A duplicate committed voice turn must replay its stored result without repeating STT, dialogue generation, or TTS. Audio remains transient and is not persisted. Preserve cancellation and the existing speech deadline; do not add retries or change the commit/replay protocol as part of setup.

If ElevenLabs settings are absent, TTS should be represented as unavailable while text-based interaction remains available. Partial or invalid ElevenLabs configuration must also resolve to an unavailable TTS implementation without making a vendor request or disclosing secret-bearing diagnostics. It must not throw during shared voice-runtime construction in a way that prevents Azure STT, text commit, or the text fallback. It must not select another vendor or a default model silently.

## Private configuration

Configure these names only in a private server-side environment or secret manager. The local `.env.local` is owner-managed and was not changed for this preparation. The following is a names-only checklist, not a complete or runnable environment file:

```text
AZURE_SPEECH_KEY=<existing private Azure Speech key>
AZURE_SPEECH_REGION=<existing Azure Speech region>
ELEVENLABS_API_KEY=<private ElevenLabs key>
ELEVENLABS_VOICE_ID=<account-approved Thai-compatible voice ID>
ELEVENLABS_MODEL_ID=<explicit account-approved Thai-capable model ID>
```

Never copy real values into this document, `.env.example`, issue text, command output, telemetry, or a client-exposed variable. Do not change the existing local environment simply to test the provider split. Confirm the service's deployment target and supported Node runtime before setting deployment secrets.

## Verification status and next steps

Local verification passed on 2026-10-24: the full suite had 971 passes and 60 PostgreSQL-only skips; focused speech regressions passed 117/117 and WebSocket regressions 20/20. The full details and exact skip breakdown are in [final metrics](../../FINAL_METRICS.md). These tests use local doubles for the provider boundary; they do not establish account access, real TTS output, Thai intelligibility, latency, retention settings, or production readiness.

The live ElevenLabs gate remains **NOT RUN**. The existing opt-in command is:

```text
npm run test:speech:live
```

It requires all five settings in the private process environment: `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, and `ELEVENLABS_MODEL_ID`. With those settings present, it makes one synthetic Thai ElevenLabs TTS request followed by one Azure STT request; it may incur provider charges. If a setting is missing, the script reports **NOT RUN** and exits nonzero without loading `.env` or printing secret values. This command was not run during verification. Only run it for an explicitly authorized, bounded check; the test output suppresses raw provider details and reports Thai language-quality review as **NOT REVIEWED**.

Before production consideration, record the selected model/voice identifiers as non-secret metadata; verify Thai pronunciation with qualified human review; check the owner's account plan and PCM format entitlement; and measure TTS latency separately from the previously measured Azure TTS baseline. Keep the old provider's metrics and the new provider's metrics labeled by provider/model and do not claim a before/after improvement without a comparable approved workload.

## References

- [Provider research snapshot](./provider-research.md) (checked 2026-10-22).
- [ElevenLabs text-to-speech API reference](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).
- [ElevenLabs model/language overview](https://elevenlabs.io/docs/overview/models) and [language support](https://elevenlabs.io/docs/help-center/other/what-languages-do-you-support).
- [ElevenLabs supported audio formats](https://elevenlabs.io/docs/help-center/troubleshooting/what-audio-formats-do-you-support) and [TTS capability guide](https://elevenlabs.io/docs/overview/capabilities/text-to-speech).
