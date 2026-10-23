import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { SpeechError, validateWav, type SpeechToTextProvider } from "../speech/contracts.js";

/** Azure SDK owns its fixed regional endpoints; never expose a browser token or custom URL. */
export class AzureSpeechProvider implements SpeechToTextProvider {
  constructor(private readonly key: string, private readonly region: string) {
    if (!key.trim() || /\s/.test(key) || !/^[a-z][a-z0-9]{1,39}$/.test(region)) throw new SpeechError("SPEECH_UNAVAILABLE");
    sdk.Recognizer.enableTelemetry(false);
  }
  private config() {
    const config = sdk.SpeechConfig.fromSubscription(this.key, this.region);
    config.speechRecognitionLanguage = "th-TH";
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
}
