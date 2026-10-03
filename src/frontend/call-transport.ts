import { callServerMessage, voiceReply, type voiceRequest } from "../public-api/voice.js";
import type { messageDto } from "../public-api/contracts.js";
import type { z } from "zod";
import { ApiFailure } from "./api.js";

export type VoiceRequest = z.infer<typeof voiceRequest>;
export type VoiceResponse = z.infer<typeof voiceReply>;
/** One bounded recording per connection. Reconnect always resumes the persisted session. */
export async function socketVoice(sessionId: string, input: VoiceRequest, signal: AbortSignal,
  committed: (reply: z.infer<typeof messageDto>) => void): Promise<VoiceResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(`/api/call/${encodeURIComponent(sessionId)}/socket`, window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url); let done = false, sent = false;
    const timer = setTimeout(() => finish(new ApiFailure("NETWORK_ERROR", 0)), 70_000);
    const handshake = setTimeout(() => finish(new ApiFailure("NETWORK_ERROR", 0)), 6000);
    const finish = (error?: Error, reply?: VoiceResponse) => {
      if (done) return; done = true; clearTimeout(timer); clearTimeout(handshake);
      signal.removeEventListener("abort", abort); socket.close();
      if (reply) resolve(reply); else reject(error ?? new ApiFailure("NETWORK_ERROR", 0));
    };
    const abort = () => finish(new DOMException("Cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
    socket.onerror = () => finish(new ApiFailure("NETWORK_ERROR", 0));
    socket.onclose = () => finish(new ApiFailure("NETWORK_ERROR", 0));
    socket.onmessage = event => {
      if (done || typeof event.data !== "string" || event.data.length > 6_000_000) { finish(new ApiFailure("INVALID_RESPONSE", 0)); return; }
      try {
        const message = callServerMessage.parse(JSON.parse(event.data));
        if (message.type === "ready" && !sent) { clearTimeout(handshake); sent = true; socket.send(JSON.stringify({ type: "voice", input })); }
        else if (message.type === "committed") committed(message.dialogue);
        else if (message.type === "voice") finish(undefined, message.reply);
        else if (message.type === "error") finish(new ApiFailure(message.code, message.code === "REVISION_CONFLICT" ? 409 : 422));
      } catch { finish(new ApiFailure("INVALID_RESPONSE", 0)); }
    };
  });
}
export async function httpVoice(sessionId: string, input: VoiceRequest, signal: AbortSignal): Promise<VoiceResponse> {
  try {
    const response = await fetch(`/api/training/${encodeURIComponent(sessionId)}/voice`, { method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.any([signal, AbortSignal.timeout(70_000)]) });
    const value: unknown = await response.json();
    if (!response.ok) {
      const error = value as { error?: { code?: string } };
      throw new ApiFailure(error.error?.code ?? "INTERNAL_ERROR", response.status);
    }
    return voiceReply.parse((value as { data: unknown }).data);
  } catch (error) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure("NETWORK_ERROR", 0);
  }
}
export function encodeAudio(bytes: Uint8Array): string {
  let value = ""; for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}
