import { SpeechError, type TextToSpeechProvider } from "../speech/contracts.js";
import { MAX_TTS_PCM_BYTES, pcm16000ToWav } from "../speech/pcm-wav.js";

/** Server-only, one nonstreaming request; the application owns its deadline. */
export class ElevenLabsTextToSpeechProvider implements TextToSpeechProvider {
  constructor(private readonly key: string, private readonly voiceId: string, private readonly modelId: string,
    private readonly request: typeof fetch = fetch) {
    if (!/^[\x21-\x7e]{1,4096}$/.test(key) || !/^[a-zA-Z0-9_-]{1,120}$/.test(voiceId) || !/^[a-zA-Z0-9_-]{1,120}$/.test(modelId)) {
      throw new SpeechError("SPEECH_UNAVAILABLE");
    }
  }
  async synthesize(text: string, signal?: AbortSignal): Promise<Uint8Array> {
    if (!text.trim() || text.length > 8000 || signal?.aborted) throw new SpeechError("SPEECH_UNAVAILABLE");
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const cancel = () => { void reader?.cancel().catch(() => {}); };
    try {
      const response = await this.request(`https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}?output_format=pcm_16000`, {
        method: "POST", headers: { "xi-api-key": this.key, "content-type": "application/json", accept: "application/octet-stream" },
        body: JSON.stringify({ text, model_id: this.modelId }), redirect: "error", credentials: "omit", cache: "no-store",
        ...(signal ? { signal } : {}),
      });
      if (!response.ok || !response.body || signal?.aborted) {
        void response.body?.cancel().catch(() => {});
        throw new SpeechError("SPEECH_UNAVAILABLE");
      }
      const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
      const length = response.headers.get("content-length");
      if (contentType && !["audio/pcm", "audio/x-pcm", "application/octet-stream"].includes(contentType) ||
        length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_TTS_PCM_BYTES)) {
        void response.body.cancel().catch(() => {});
        throw new SpeechError("SPEECH_UNAVAILABLE");
      }
      reader = response.body.getReader();
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) throw new SpeechError("SPEECH_UNAVAILABLE");
      // A fixed byte buffer also bounds metadata when a server sends tiny chunks.
      const pcm = new Uint8Array(MAX_TTS_PCM_BYTES);
      let total = 0;
      while (true) {
        const chunk = await reader.read();
        if (signal?.aborted) throw new SpeechError("SPEECH_UNAVAILABLE");
        if (chunk.done) break;
        if (chunk.value.byteLength > MAX_TTS_PCM_BYTES - total) throw new SpeechError("SPEECH_UNAVAILABLE");
        pcm.set(chunk.value, total); total += chunk.value.byteLength;
      }
      return pcm16000ToWav(pcm.subarray(0, total));
    } catch {
      cancel();
      // Provider errors/body/keys/text are never returned or logged.
      throw new SpeechError("SPEECH_UNAVAILABLE");
    } finally {
      signal?.removeEventListener("abort", cancel);
      try { reader?.releaseLock(); } catch { /* Cleanup cannot expose provider errors. */ }
    }
  }
}
