// Opt-in synthetic speech round trip, excluded from the default *.test.ts suite.
// No microphone capture, files, database, LLM provider, or raw-content logging.
import { it } from "vitest";
import { AzureSpeechProvider } from "../src/providers/azure-speech.js";
import { SpeechError, speechDeadline, validateWav } from "../src/speech/contracts.js";

it("Azure synthesizes a Thai synthetic phrase and recognizes its generated audio", async () => {
  if (!process.env.AZURE_SPEECH_KEY || !process.env.AZURE_SPEECH_REGION) {
    throw new Error("Azure speech verification NOT RUN: missing private configuration");
  }
  const started = Date.now();
  let phase: "configuration" | "tts" | "wav-validation" | "stt" = "configuration";
  try {
    const provider = new AzureSpeechProvider(process.env.AZURE_SPEECH_KEY, process.env.AZURE_SPEECH_REGION);
    phase = "tts";
    const audio = await speechDeadline(signal => provider.synthesize("สวัสดี นี่คือการทดสอบสถานการณ์จำลอง กรุณาตรวจสอบข้อมูลก่อนตัดสินใจ", signal));
    phase = "wav-validation";
    validateWav(audio, "audio/wav");
    phase = "stt";
    let transcript = await speechDeadline(signal => provider.transcribe(audio, signal));
    const valid = transcript.trim().length > 0 && /[\u0e00-\u0e7f]/u.test(transcript);
    transcript = "";
    audio.fill(0);
    if (!valid) throw new SpeechError("EMPTY_TRANSCRIPT");
    console.info(JSON.stringify({ azureSyntheticSpeech: "PASS", tts: "PASS", stt: "PASS", thaiTranscript: "PASS", latencyMs: Date.now() - started }));
  } catch (error) {
    const category = error instanceof SpeechError ? error.code : "SPEECH_UNAVAILABLE";
    console.info(JSON.stringify({ azureSyntheticSpeech: "FAIL", phase, category, latencyMs: Date.now() - started }));
    throw new Error(`Azure speech verification failed: ${phase}/${category}; raw provider details withheld`);
  }
});
