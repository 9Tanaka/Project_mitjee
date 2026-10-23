import { SpeechError } from "./contracts.js";

export const WAV_HEADER_BYTES = 44;
export const MAX_TTS_AUDIO_BYTES = 4 * 1024 * 1024;
export const MAX_TTS_PCM_BYTES = MAX_TTS_AUDIO_BYTES - WAV_HEADER_BYTES;

/** ElevenLabs pcm_16000 is signed PCM16LE, mono. It has no container header. */
export function pcm16000ToWav(pcm: Uint8Array): Uint8Array {
  if (!pcm.byteLength || pcm.byteLength % 2 || pcm.byteLength > MAX_TTS_PCM_BYTES) throw new SpeechError("SPEECH_UNAVAILABLE");
  const starts = (value: string, offset = 0) => [...value].every((char, i) => pcm[offset + i] === char.charCodeAt(0));
  if (starts("RIFF") || starts("RF64") || starts("ID3") || starts("OggS") || starts("fLaC") ||
    pcm[0] === 0xff && (pcm[1]! & 0xe0) === 0xe0) throw new SpeechError("SPEECH_UNAVAILABLE");
  const wav = new Uint8Array(WAV_HEADER_BYTES + pcm.byteLength), view = new DataView(wav.buffer);
  const tag = (offset: number, value: string) => [...value].forEach((char, i) => { wav[offset + i] = char.charCodeAt(0); });
  tag(0, "RIFF"); tag(8, "WAVE"); tag(12, "fmt "); tag(36, "data");
  view.setUint32(4, wav.byteLength - 8, true); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  view.setUint32(40, pcm.byteLength, true); wav.set(pcm, WAV_HEADER_BYTES);
  return wav;
}
