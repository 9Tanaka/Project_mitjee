import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { SpeechError, validateWav, type SpeechToTextProvider, type TextToSpeechProvider } from "../speech/contracts.js";

/** Azure SDK owns its fixed regional endpoints; never expose a browser token or custom URL. */
export class AzureSpeechProvider implements SpeechToTextProvider, TextToSpeechProvider {
  constructor(private readonly key: string, private readonly region: string) {
    if (!key.trim() || /\s/.test(key) || !/^[a-z][a-z0-9]{1,39}$/.test(region)) throw new SpeechError("SPEECH_UNAVAILABLE");
    sdk.Recognizer.enableTelemetry(false);
  }
  private config() {
    const config = sdk.SpeechConfig.fromSubscription(this.key, this.region);
    config.speechRecognitionLanguage = "th-TH";
    config.speechSynthesisVoiceName = "th-TH-PremwadeeNeural";
    config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm;
    return config;
  }
  async transcribe(wav: Uint8Array, signal?: AbortSignal): Promise<string> {
    validateWav(wav, "audio/wav");
    if (signal?.aborted) throw new SpeechError("STT_FAILED");
    const stream = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1));
    const recognizer = new sdk.SpeechRecognizer(this.config(), sdk.AudioConfig.fromStreamInput(stream));
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (text?: string) => {
        if (done) return; done = true;
        signal?.removeEventListener("abort", abort);
        recognizer.close(() => {}, () => {}); stream.close();
        if (text !== undefined) resolve(text); else reject(new SpeechError("STT_FAILED"));
      };
      const abort = () => finish();
      signal?.addEventListener("abort", abort, { once: true });
      try {
        stream.write(wav.slice(44).buffer); stream.close();
        recognizer.recognizeOnceAsync(result => finish(result.reason === sdk.ResultReason.RecognizedSpeech ? result.text : undefined), () => finish());
      } catch { finish(); }
    });
  }
  async synthesize(text: string, signal?: AbortSignal): Promise<Uint8Array> {
    if (!text.trim() || text.length > 8000 || signal?.aborted) throw new SpeechError("SPEECH_UNAVAILABLE");
    const synth = new sdk.SpeechSynthesizer(this.config(), null);
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (audio?: ArrayBuffer) => {
        if (done) return; done = true;
        signal?.removeEventListener("abort", abort); synth.close(() => {}, () => {});
        if (audio && audio.byteLength > 44 && audio.byteLength <= 4 * 1024 * 1024) resolve(new Uint8Array(audio));
        else reject(new SpeechError("SPEECH_UNAVAILABLE"));
      };
      const abort = () => finish();
      signal?.addEventListener("abort", abort, { once: true });
      try { synth.speakTextAsync(text, result => finish(result.reason === sdk.ResultReason.SynthesizingAudioCompleted ? result.audioData : undefined), () => finish()); }
      catch { finish(); }
    });
  }
}
