import { SpeechError } from "../speech/contracts.js";

/** Bounded per-process demo limiter shared by HTTP and websocket adapters. */
export class VoiceRateLimiter {
  constructor(private readonly now = Date.now, private readonly windows = new Map<string, { at: number; count: number }>()) {}
  take(owner: string): void {
    const now = this.now();
    for (const [key, item] of this.windows) if (now - item.at >= 60_000) this.windows.delete(key);
    const previous = this.windows.get(owner);
    if ((!previous && this.windows.size >= 200) || (previous && previous.count >= 12)) throw new SpeechError("VOICE_BUSY");
    this.windows.set(owner, { at: previous?.at ?? now, count: (previous?.count ?? 0) + 1 });
  }
}
const host = globalThis as typeof globalThis & { mitjeeVoiceRateWindows?: Map<string, { at: number; count: number }> };
export const voiceRateLimiter = new VoiceRateLimiter(Date.now, host.mitjeeVoiceRateWindows ??= new Map());
