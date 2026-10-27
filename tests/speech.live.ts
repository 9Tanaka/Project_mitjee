// Opt-in synthetic speech round trip, excluded from the default *.test.ts suite.
// No microphone capture, files, database, LLM provider, or raw-content logging.
import { it } from "vitest";
import { createSpeechToTextProvider, createTextToSpeechProvider } from "../src/server/voice-runtime.js";
import { SpeechError, speechDeadline, validateWav } from "../src/speech/contracts.js";

it("ElevenLabs synthesizes a Thai synthetic phrase for Azure transcription", async () => {
  if (!["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "ELEVENLABS_MODEL_ID"].every(name => process.env[name]?.trim())) {
    throw new Error("Azure STT / ElevenLabs TTS verification NOT RUN: missing private configuration");
  }
  const started = Date.now();
  let phase: "configuration" | "tts" | "wav-validation" | "stt" = "configuration";
  try {
    const stt = createSpeechToTextProvider(), tts = createTextToSpeechProvider();
    phase = "tts";
    const audio = await speechDeadline(signal => tts.synthesize("สวัสดี นี่คือการทดสอบสถานการณ์จำลอง กรุณาตรวจสอบข้อมูลก่อนตัดสินใจ", signal));
    phase = "wav-validation";
    validateWav(audio, "audio/wav");
    phase = "stt";
    let transcript = await speechDeadline(signal => stt.transcribe(audio, signal));
    const valid = transcript.trim().length > 0 && /[\u0e00-\u0e7f]/u.test(transcript);
    transcript = "";
    audio.fill(0);
    if (!valid) throw new SpeechError("EMPTY_TRANSCRIPT");
    console.info(JSON.stringify({ splitSyntheticSpeech: "PASS", ttsProvider: "elevenlabs", sttProvider: "azure", thaiScriptDetected: true, languageQuality: "NOT_REVIEWED", latencyMs: Date.now() - started }));
  } catch (error) {
    const category = error instanceof SpeechError ? error.code : "SPEECH_UNAVAILABLE";
    console.info(JSON.stringify({ splitSyntheticSpeech: "FAIL", phase, category, latencyMs: Date.now() - started }));
    throw new Error(`Azure STT / ElevenLabs TTS verification failed: ${phase}/${category}; raw provider details withheld`);
  }
});
