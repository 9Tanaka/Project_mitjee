import { AzureSpeechProvider } from "../providers/azure-speech.js";
import { SpeechError, type SpeechToTextProvider, type TextToSpeechProvider } from "../speech/contracts.js";
import { VoiceApplicationService } from "../application/voice-service.js";
import type { TrainingApplicationService } from "../application/training-service.js";

export function createSpeechProvider(env: Readonly<Record<string, string | undefined>> = process.env): SpeechToTextProvider & TextToSpeechProvider {
  if (!env.AZURE_SPEECH_KEY && !env.AZURE_SPEECH_REGION) return {
    async transcribe() { throw new SpeechError("SPEECH_UNAVAILABLE"); },
    async synthesize() { throw new SpeechError("SPEECH_UNAVAILABLE"); },
  };
  return new AzureSpeechProvider(env.AZURE_SPEECH_KEY ?? "", env.AZURE_SPEECH_REGION ?? "");
}
const services = new WeakMap<TrainingApplicationService, VoiceApplicationService>();
const host = globalThis as typeof globalThis & { mitjeeVoicePending?: Set<string> };
export function getVoiceApplication(app: TrainingApplicationService) {
  let voice = services.get(app);
  if (!voice) { const provider = createSpeechProvider(); voice = new VoiceApplicationService(app, provider, provider, host.mitjeeVoicePending ??= new Set()); services.set(app, voice); }
  return voice;
}
