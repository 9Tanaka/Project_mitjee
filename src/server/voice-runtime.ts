import { AzureSpeechProvider } from "../providers/azure-speech.js";
import { ElevenLabsTextToSpeechProvider } from "../providers/elevenlabs-speech.js";
import { SpeechError, type SpeechToTextProvider, type TextToSpeechProvider } from "../speech/contracts.js";
import { VoiceApplicationService } from "../application/voice-service.js";
import type { TrainingApplicationService } from "../application/training-service.js";

export function createSpeechToTextProvider(env: Readonly<Record<string, string | undefined>> = process.env): SpeechToTextProvider {
  if (!env.AZURE_SPEECH_KEY && !env.AZURE_SPEECH_REGION) return {
    async transcribe() { throw new SpeechError("SPEECH_UNAVAILABLE"); },
  };
  return new AzureSpeechProvider(env.AZURE_SPEECH_KEY ?? "", env.AZURE_SPEECH_REGION ?? "");
}
export function createTextToSpeechProvider(env: Readonly<Record<string, string | undefined>> = process.env): TextToSpeechProvider {
  try {
    return new ElevenLabsTextToSpeechProvider(env.ELEVENLABS_API_KEY ?? "", env.ELEVENLABS_VOICE_ID ?? "", env.ELEVENLABS_MODEL_ID ?? "");
  } catch {
    // Invalid/partial TTS configuration must not prevent STT or a text commit.
    return { async synthesize() { throw new SpeechError("SPEECH_UNAVAILABLE"); } };
  }
}
const services = new WeakMap<TrainingApplicationService, VoiceApplicationService>();
const host = globalThis as typeof globalThis & { mitjeeVoicePending?: Set<string> };
export function getVoiceApplication(app: TrainingApplicationService) {
  let voice = services.get(app);
  if (!voice) { voice = new VoiceApplicationService(app, createSpeechToTextProvider(), createTextToSpeechProvider(), host.mitjeeVoicePending ??= new Set()); services.set(app, voice); }
  return voice;
}
