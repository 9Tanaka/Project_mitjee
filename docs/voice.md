# Call Center voice — implemented demo design

Status (2 October 2026): adapters, application orchestration, HTTP/socket transport and UI
implemented and covered by fake-provider tests. **LIVE AZURE VERIFICATION NOT RUN**:
private Speech key/region are absent. This is not a claim of production readiness or measured
speech quality. See [current verification](realtime-verification.md).

## Boundaries and data flow

Explicit microphone button → browser AudioWorklet → bounded PCM WAV in memory → authenticated
Call Center WebSocket (or HTTP POST) → SpeechToTextProvider → sanitizer → existing
ScenarioDialogueOrchestrator → committed sanitized dialogue → TextToSpeechProvider → browser audio.

Speech ports are independent of Azure. `AzureSpeechProvider` is an outer server adapter using
the official JavaScript SDK. Core, evaluation, EventValidator and persistence do not import it.
Recognized speech remains free text; it cannot confirm a simulated critical action, move state,
finalize a checkpoint, or assign an assessment. Only existing explicit backend-validated actions
do that. NORMAL_CALL and SCAM_CALL share this transport; the other eight categories stay TEXT.

`POST /api/training/:sessionId/voice` accepts only `turnId`, `expectedRevision`, `mime` and
`audioBase64`. Authentication, same-origin, owned ACTIVE Call Center binding, schema and limits
are checked before processing. No provider/variant/owner/score fields are accepted.

## Private configuration and running

Use the ignored server `.env.local` for `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`.
Do not use NEXT_PUBLIC variables, browser tokens, or commit secrets. Azure resource keys stay
on the server; SDK regional endpoints cannot be replaced through an arbitrary URL.
Choose dialogue explicitly with `AI_PROVIDER=mock|openai|groq` and its provider-specific settings.
No automatic provider/model substitution occurs. Missing Azure credentials do not disable text.

`npm run dev` runs the custom same-origin HTTP/socket server. For a production build, run
`npm run build` then `npm start`. See [WebSocket deployment](websocket.md).
Microphone access requires a secure context (HTTPS or supported loopback development origin).
Permission is requested only after **เริ่มโหมดเสียง**, never on page load. Stop, cancellation,
failed setup and unmount release tracks/worklet/context. Late permission/resume cannot restart
a cancelled recording. Audio playback is an explicit browser control, not autoplay.

Azure F0 can be selected for development subject to the account's current region, quota and
availability. The implementation does not provision a resource or promise free unlimited usage.
It uses `th-TH`, `th-TH-PremwadeeNeural`, and Riff16Khz16BitMonoPcm output.
STT uses `recognizeOnceAsync`: speak **one utterance per recording**; this is not continuous
transcription or full-duplex calling.

## Demo bounds (not Proposal numbers)

| Boundary | Limit |
|---|---|
| Accepted microphone input | `audio/wav`, canonical 44-byte header, PCM 16 kHz mono 16-bit |
| Recording | Nonempty; at most 30 seconds / 960,044 bytes |
| Transport JSON | 1,300,000 bytes; base64 field at most 1,280,060 characters |
| HTTP body read | 10 seconds |
| STT / TTS | 10 seconds each, AbortSignal cancellation; late completion ignored |
| AI dialogue | Existing 20-second attempt timeout + one retry/fallback |
| TTS output | At most 4 MiB, temporary in-memory audio |
| Speech admission | One operation per owner/session; 20 total per Node process |
| HTTP/socket rate | Shared 12 messages/minute/owner, bounded 200-entry map |

Input duration comes from validated byte count/header, not a client duration claim. General WAV
files with arbitrary chunks, MP3, WebM, URLs and file uploads are intentionally unsupported.
HTTP and socket module graphs share primitive admission/rate state, not application class instances.
These are defensive demo limits, not a measured 20-session performance result or distributed limiter.

## Failure, replay and privacy

- STT failure/empty transcript/cancellation before dialogue leaves the session unchanged.
- Transcript is sanitized before dialogue; no raw microphone bytes are stored in DB, filesystem,
  receipts, analytics or logs. Bytes/base64 are transient request/recording memory only.
- AI failures use the existing dialogue retry/fallback; voice adds no alternate business rules.
- TTS runs after commit. Failure returns committed text with `audioStatus=UNAVAILABLE`; no rollback.
- A duplicate committed `turnId` replays its stored transcript/receipt without STT, AI or TTS.
  Audio itself is not persisted, compared or regenerated; replay returns `audioStatus=REPLAY`.
- A pending retry retains the original turn/revision/audio in browser memory. Switching transport
  does not assign a new turn. If an earlier request is still active, VOICE_BUSY is recoverable.
- Disconnect during STT aborts it. If dialogue already started, its own deadline/CAS governs commit;
  disconnect cannot undo a committed turn. Resume/retry loads that result. Stale revisions reject.
- Sanitization is a demo defense, not comprehensive PII detection. Only fictional content is allowed.
  Azure necessarily processes input audio; app non-persistence is not a claim about provider retention.

## Verification

`npm run test:speech` uses fake SDK/speech and in-memory repositories. It covers audio validation,
abort/late output, no-mutation STT failure, sanitization, authority separation, commit-before-TTS,
replay, ownership, CAS, limits, microphone cleanup and UI transport fallback.

`npm run test:speech:live` is opt-in, excluded from default tests. Configure private Speech env
in the process first (the launcher deliberately does not load `.env.local` automatically).
It synthesizes a fictional Thai sentence, then transcribes the generated in-memory audio;
no real-user microphone input or raw output is logged. Missing credentials prints NOT RUN and
exits nonzero before any network call. This synthetic round trip does not certify microphone E2E.

Official references checked 2 October 2026: [Speech-to-text quickstart](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/get-started-speech-to-text),
[text-to-speech quickstart](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/get-started-text-to-speech).
