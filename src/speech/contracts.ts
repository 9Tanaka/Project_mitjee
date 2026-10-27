export const MAX_AUDIO_BYTES = 960_044; // 30 seconds, 16 kHz, mono signed 16-bit PCM + canonical WAV header.
export const MAX_AUDIO_SECONDS = 30;
export const SPEECH_TIMEOUT_MS = 10_000;
export interface SpeechToTextProvider { transcribe(wav: Uint8Array, signal?: AbortSignal): Promise<string> }
export interface TextToSpeechProvider { synthesize(text: string, signal?: AbortSignal): Promise<Uint8Array> }
export type SpeechErrorCode = "SPEECH_UNAVAILABLE" | "STT_FAILED" | "EMPTY_TRANSCRIPT" | "INVALID_AUDIO" | "AUDIO_TOO_LARGE" | "VOICE_NOT_ALLOWED" | "VOICE_BUSY";
export class SpeechError extends Error {
  constructor(readonly code: SpeechErrorCode) { super(code); this.name = "SpeechError"; }
}

/** Intentionally accepts one canonical PCM WAV format, not arbitrary file uploads. */
export function validateWav(bytes: Uint8Array, mime: string): void {
  if (bytes.byteLength > MAX_AUDIO_BYTES) throw new SpeechError("AUDIO_TOO_LARGE");
  if (mime !== "audio/wav" || bytes.byteLength <= 44) throw new SpeechError("INVALID_AUDIO");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number, text: string) => [...text].every((char, i) => bytes[offset + i] === char.charCodeAt(0));
  if (!tag(0, "RIFF") || !tag(8, "WAVE") || !tag(12, "fmt ") || !tag(36, "data") ||
    view.getUint32(4, true) !== bytes.length - 8 || view.getUint32(16, true) !== 16 ||
    view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 || view.getUint32(24, true) !== 16000 ||
    view.getUint32(28, true) !== 32000 || view.getUint16(32, true) !== 2 || view.getUint16(34, true) !== 16 ||
    view.getUint32(40, true) !== bytes.length - 44 || (bytes.length - 44) % 2 !== 0) throw new SpeechError("INVALID_AUDIO");
}

/** Deadline owns cancellation even if a fake/third-party implementation ignores it. */
export async function speechDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent?.addEventListener("abort", abort, { once: true });
  if (parent?.aborted) controller.abort();
  let rejectAbort!: (error: Error) => void;
  const cancelled = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort(new SpeechError("SPEECH_UNAVAILABLE"));
  controller.signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(abort, SPEECH_TIMEOUT_MS);
  try {
    if (controller.signal.aborted) throw new SpeechError("SPEECH_UNAVAILABLE");
    return await Promise.race([operation(controller.signal), cancelled]);
  } finally { clearTimeout(timer); parent?.removeEventListener("abort", abort); controller.signal.removeEventListener("abort", onAbort); }
}
