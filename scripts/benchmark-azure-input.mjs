import * as sdk from "microsoft-cognitiveservices-speech-sdk";

/** Measurement input only: retain the Phase 1 Azure voice/text/audio policy.
 * Runtime TTS remains ElevenLabs; this one setup request is outside traces. */
export function baselineInputAudio(text, env, signal) {
  const config = sdk.SpeechConfig.fromSubscription(env.AZURE_SPEECH_KEY, env.AZURE_SPEECH_REGION);
  config.speechSynthesisVoiceName = "th-TH-PremwadeeNeural";
  config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm;
  sdk.Recognizer.enableTelemetry(false);
  const synth = new sdk.SpeechSynthesizer(config, null);
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = audio => {
      if (done) return;
      done = true;
      signal?.removeEventListener("abort", abort);
      synth.close(() => {}, () => {});
      if (audio && audio.byteLength > 44 && audio.byteLength <= 4 * 1024 * 1024) resolve(new Uint8Array(audio));
      else reject(new Error("VOICE_INPUT_FIXTURE_UNAVAILABLE"));
    };
    const abort = () => finish();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) return abort();
    try { synth.speakTextAsync(text, result => finish(result.reason === sdk.ResultReason.SynthesizingAudioCompleted ? result.audioData : undefined), () => finish()); }
    catch { finish(); }
  });
}
