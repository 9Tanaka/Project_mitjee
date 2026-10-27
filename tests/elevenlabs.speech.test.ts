import { afterEach, describe, expect, it, vi } from "vitest";
import { ElevenLabsTextToSpeechProvider } from "../src/providers/elevenlabs-speech.js";
import { MAX_TTS_AUDIO_BYTES, MAX_TTS_PCM_BYTES, pcm16000ToWav } from "../src/speech/pcm-wav.js";
import { SPEECH_TIMEOUT_MS, speechDeadline } from "../src/speech/contracts.js";
import { VoiceApplicationService } from "../src/application/voice-service.js";
import { createTextToSpeechProvider } from "../src/server/voice-runtime.js";
import { voiceHarness } from "./voice.helpers.js";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const pcm = () => new Uint8Array([0, 0, 255, 127, 0, 128, 1, 0]);
function harness(response: () => Response | Promise<Response> = () => new Response(pcm(), { headers: { "content-type": "audio/pcm" } })) {
  const request = vi.fn<typeof fetch>(async () => response());
  return { request, provider: new ElevenLabsTextToSpeechProvider("synthetic-private-key", "synthetic_voice", "explicit_model", request) };
}
function streamResponse(chunks: Uint8Array[], headers: Record<string, string> = {}) {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); },
  }), { headers });
}
function assertWav(wav: Uint8Array, bytes: Uint8Array) {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe("RIFF");
  expect(new TextDecoder().decode(wav.subarray(8, 16))).toBe("WAVEfmt ");
  expect(new TextDecoder().decode(wav.subarray(36, 40))).toBe("data");
  expect(view.getUint32(4, true)).toBe(wav.length - 8);
  expect(view.getUint32(16, true)).toBe(16); expect(view.getUint16(20, true)).toBe(1);
  expect(view.getUint16(22, true)).toBe(1); expect(view.getUint32(24, true)).toBe(16_000);
  expect(view.getUint32(28, true)).toBe(32_000); expect(view.getUint16(32, true)).toBe(2);
  expect(view.getUint16(34, true)).toBe(16); expect(view.getUint32(40, true)).toBe(bytes.length);
  expect(Buffer.compare(Buffer.from(wav.buffer, wav.byteOffset + 44, wav.byteLength - 44),
    Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))).toBe(0);
}

describe("ElevenLabs nonstreaming PCM adapter with local HTTP doubles", () => {
  it("sends the exact fixed endpoint, explicit model and server-only authentication", async () => {
    const h = harness(), controller = new AbortController(), log = vi.spyOn(console, "log"), error = vi.spyOn(console, "error");
    const audio = await h.provider.synthesize("ข้อความสมมติ", controller.signal);
    assertWav(audio, pcm());
    expect(h.request).toHaveBeenCalledOnce();
    expect(h.request).toHaveBeenCalledWith("https://api.elevenlabs.io/v1/text-to-speech/synthetic_voice?output_format=pcm_16000", {
      method: "POST", headers: { "xi-api-key": "synthetic-private-key", "content-type": "application/json", accept: "application/octet-stream" },
      body: JSON.stringify({ text: "ข้อความสมมติ", model_id: "explicit_model" }), signal: controller.signal,
      redirect: "error", credentials: "omit", cache: "no-store",
    });
    expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
  it("coalesces tiny chunks into the same PCM without assuming chunk alignment", async () => {
    const bytes = pcm(), h = harness(() => streamResponse([...bytes].map(b => new Uint8Array([b]))));
    assertWav(await h.provider.synthesize("ทดสอบ"), bytes);
  });
  it("allows the full TTS cap independently of the 30-second STT recording limit", async () => {
    const payload = new Uint8Array(MAX_TTS_PCM_BYTES), h = harness(() => new Response(payload));
    const audio = await h.provider.synthesize("ทดสอบ");
    expect(audio.byteLength).toBe(MAX_TTS_AUDIO_BYTES); assertWav(audio, payload);
  });
  it.each([undefined, "2"])("enforces the streaming cap despite absent or false content-length %s", async length => {
    const cancelled = vi.fn();
    const h = harness(() => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(MAX_TTS_PCM_BYTES)); controller.enqueue(new Uint8Array(2)); },
      cancel: cancelled,
    }), { headers: length ? { "content-length": length } : {} }));
    await expect(h.provider.synthesize("ทดสอบ")).rejects.toMatchObject({ code: "SPEECH_UNAVAILABLE", message: "SPEECH_UNAVAILABLE" });
    expect(cancelled).toHaveBeenCalledOnce();
  });
  it("rejects declared oversize before reading or allocating a response buffer", async () => {
    const cancelled = vi.fn(), h = harness(() => new Response(new ReadableStream({ cancel: cancelled }), { headers: { "content-length": String(MAX_TTS_PCM_BYTES + 1) } }));
    await expect(h.provider.synthesize("ทดสอบ")).rejects.toThrow("SPEECH_UNAVAILABLE"); expect(cancelled).toHaveBeenCalledOnce();
  });
  it.each([new Uint8Array(), new Uint8Array(3), new TextEncoder().encode("RIFF0000WAVE"), new TextEncoder().encode("ID3-test"),
    new TextEncoder().encode("RF64xxxx"), new TextEncoder().encode("OggStest"), new TextEncoder().encode("fLaCtest"), new Uint8Array([0xff, 0xfb, 0x90, 0])])
    ("rejects empty, misaligned and known container bytes", async bytes => {
      await expect(harness(() => new Response(bytes)).provider.synthesize("ทดสอบ")).rejects.toThrow("SPEECH_UNAVAILABLE");
    });
  it.each(["audio/mpeg", "audio/wav", "application/json", "text/plain"])("does not relabel %s as PCM", async contentType => {
    await expect(harness(() => new Response(pcm(), { headers: { "content-type": contentType } })).provider.synthesize("ทดสอบ")).rejects.toThrow("SPEECH_UNAVAILABLE");
  });
  it.each([302, 401, 429, 500, 503])("withholds %s provider error bodies and does not retry", async status => {
    const h = harness(() => new Response("PRIVATE provider details", { status }));
    const log = vi.spyOn(console, "log"), info = vi.spyOn(console, "info"), warn = vi.spyOn(console, "warn"), error = vi.spyOn(console, "error");
    await expect(h.provider.synthesize("ทดสอบ")).rejects.toMatchObject({ code: "SPEECH_UNAVAILABLE", message: "SPEECH_UNAVAILABLE" });
    expect(h.request).toHaveBeenCalledOnce();
    for (const spy of [log, info, warn, error]) expect(spy).not.toHaveBeenCalled();
  });
  it("maps request/body failures without exposing provider diagnostics", async () => {
    const failedRequest = harness(() => { throw new Error("PRIVATE request/key"); });
    await expect(failedRequest.provider.synthesize("ทดสอบ")).rejects.toThrow(/^SPEECH_UNAVAILABLE$/);
    const failedBody = harness(() => new Response(new ReadableStream({ start(controller) { controller.error(new Error("PRIVATE body/key")); } })));
    await expect(failedBody.provider.synthesize("ทดสอบ")).rejects.toThrow(/^SPEECH_UNAVAILABLE$/);
  });
  it("aborts a pending body read, cancels the stream and rejects late success", async () => {
    const cancelled = vi.fn(), controller = new AbortController();
    const h = harness(() => new Response(new ReadableStream({ start(stream) { stream.enqueue(pcm()); }, cancel: cancelled })));
    const work = h.provider.synthesize("ทดสอบ", controller.signal), rejection = expect(work).rejects.toThrow("SPEECH_UNAVAILABLE");
    await vi.waitFor(() => expect(h.request).toHaveBeenCalledOnce());
    controller.abort(); await rejection; expect(cancelled).toHaveBeenCalledOnce();
  });
  it("applies the existing deadline during a body stall after empty chunks", async () => {
    vi.useFakeTimers();
    const cancelled = vi.fn(), h = harness(() => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array()); controller.enqueue(pcm()); }, cancel: cancelled })));
    const work = speechDeadline(signal => h.provider.synthesize("ทดสอบ", signal)), rejection = expect(work).rejects.toThrow("SPEECH_UNAVAILABLE");
    await vi.advanceTimersByTimeAsync(SPEECH_TIMEOUT_MS); await rejection;
    expect(cancelled).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("does not send blank, oversized or already cancelled requests", async () => {
    const h = harness(), controller = new AbortController(); controller.abort();
    for (const text of ["", "  ", "x".repeat(8001)]) await expect(h.provider.synthesize(text)).rejects.toThrow("SPEECH_UNAVAILABLE");
    await expect(h.provider.synthesize("ทดสอบ", controller.signal)).rejects.toThrow("SPEECH_UNAVAILABLE");
    expect(h.request).not.toHaveBeenCalled();
  });
  it("preserves typed-array offsets when wrapping PCM", () => {
    const storage = new Uint8Array(16); storage.set(pcm(), 4);
    assertWav(pcm16000ToWav(storage.subarray(4, 12)), pcm());
  });
  it.each([
    {}, { ELEVENLABS_API_KEY: "key" }, { ELEVENLABS_VOICE_ID: "voice" }, { ELEVENLABS_MODEL_ID: "model" },
    { ELEVENLABS_API_KEY: "key", ELEVENLABS_VOICE_ID: "voice" },
    { ELEVENLABS_API_KEY: "key", ELEVENLABS_MODEL_ID: "model" },
    { ELEVENLABS_VOICE_ID: "voice", ELEVENLABS_MODEL_ID: "model" },
    { ELEVENLABS_API_KEY: "key", ELEVENLABS_VOICE_ID: "voice", ELEVENLABS_MODEL_ID: " " },
    { ELEVENLABS_API_KEY: "private\nkey", ELEVENLABS_VOICE_ID: "voice", ELEVENLABS_MODEL_ID: "model" },
    { ELEVENLABS_API_KEY: "key", ELEVENLABS_VOICE_ID: "../other", ELEVENLABS_MODEL_ID: "model" },
  ])("returns unavailable TTS without contacting a vendor for incomplete/invalid configuration %#", async env => {
    const request = vi.spyOn(globalThis, "fetch");
    const provider = createTextToSpeechProvider(env);
    await expect(provider.synthesize("ทดสอบ")).rejects.toMatchObject({ code: "SPEECH_UNAVAILABLE", message: "SPEECH_UNAVAILABLE" });
    expect(request).not.toHaveBeenCalled();
  });
  it("preserves transcription and text commit when TTS configuration is partial", async () => {
    const h = await voiceHarness(), request = vi.spyOn(globalThis, "fetch");
    const voice = new VoiceApplicationService(h.app, h.stt, createTextToSpeechProvider({ ELEVENLABS_API_KEY: "key" }));
    const reply = await voice.send(h.session.sessionId, h.owner, h.input);
    expect(reply.audioStatus).toBe("UNAVAILABLE"); expect(reply.audio).toBeNull();
    expect(reply.dialogue.session.revision).toBe(1);
    expect((await h.repository.get(h.session.sessionId, h.owner.id)).dialogueTurns).toHaveLength(1);
    expect(h.stt.transcribe).toHaveBeenCalledOnce(); expect(h.provider.callCount).toBe(1);
    expect(request).not.toHaveBeenCalled();
  });
  it("commits and replays the same turn when the ElevenLabs response fails", async () => {
    const h = await voiceHarness(), tts = harness(() => new Response("PRIVATE", { status: 429 }));
    const voice = new VoiceApplicationService(h.app, h.stt, tts.provider);
    const reply = await voice.send(h.session.sessionId, h.owner, h.input);
    expect(reply.audioStatus).toBe("UNAVAILABLE"); expect(reply.audio).toBeNull();
    const committed = await h.repository.get(h.session.sessionId, h.owner.id);
    expect(committed.revision).toBe(1); expect(committed.dialogueTurns).toHaveLength(1);
    const replay = await voice.send(h.session.sessionId, h.owner, { ...h.input, audio: new Uint8Array() });
    expect(replay.audioStatus).toBe("REPLAY"); expect(replay.dialogue.duplicate).toBe(true);
    expect(await h.repository.get(h.session.sessionId, h.owner.id)).toEqual(committed);
    expect(tts.request).toHaveBeenCalledOnce(); expect(h.stt.transcribe).toHaveBeenCalledOnce(); expect(h.provider.callCount).toBe(1);
  });
});
