import { vi } from "vitest";
import { createApplication } from "../src/application/composition.js";
import { VoiceApplicationService } from "../src/application/voice-service.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";
import { startHistoricalCall } from "./call-foundation.helpers.js";

export function pcmWav(samples = 160): Uint8Array {
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const tag = (offset: number, value: string) => [...value].forEach((char, i) => { bytes[offset + i] = char.charCodeAt(0); });
  tag(0, "RIFF"); tag(8, "WAVE"); tag(12, "fmt "); tag(36, "data");
  view.setUint32(4, bytes.length - 8, true); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  view.setUint32(40, samples * 2, true);
  return bytes;
}

export async function voiceHarness(variant: "NORMAL_CALL" | "SCAM_CALL" = "SCAM_CALL") {
  const repository = new InMemoryTrainingRepository();
  const provider = new MockScenarioModelProvider();
  const app = await createApplication(repository, provider, () => 1000, () => variant);
  const stt = { transcribe: vi.fn(async (_wav: Uint8Array, _signal?: AbortSignal) => "ขอตรวจสอบผู้โทรก่อน") };
  const tts = { synthesize: vi.fn(async (_text: string, _signal?: AbortSignal) => pcmWav()) };
  const voice = new VoiceApplicationService(app, stt, tts);
  const owner = { id: "11111111-1111-4111-8111-111111111111" };
  const startCall = () => startHistoricalCall(repository, app, owner, variant, () => 1000);
  const session = await startCall();
  const input = { turnId: "voice-turn", expectedRevision: session.revision, audio: pcmWav(), mime: "audio/wav" };
  return { repository, provider, app, stt, tts, voice, owner, session, input, startCall };
}
