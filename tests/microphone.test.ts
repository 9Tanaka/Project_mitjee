// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { encodePcmWav, startMicrophone } from "../src/frontend/microphone.js";
import { validateWav } from "../src/speech/contracts.js";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("encodes bounded mono PCM at 16 kHz, including resampling", () => {
  const wav = encodePcmWav([new Float32Array(48000).fill(0.5)], 48000);
  expect(wav.byteLength).toBe(32044); expect(() => validateWav(wav, "audio/wav")).not.toThrow();
  expect(new DataView(wav.buffer).getInt16(44, true)).toBe(16384);
  expect(encodePcmWav([new Float32Array(16000 * 32)], 16000).byteLength).toBe(960044);
});
it("stops all tracks when permission arrives after cancellation", async () => {
  const stop = vi.fn(), abort = new AbortController(); abort.abort();
  const media = { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }, { stop }] }) };
  vi.stubGlobal("navigator", { mediaDevices: media });
  await expect(startMicrophone(() => {}, abort.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(stop).toHaveBeenCalledTimes(2);
});
it("closes tracks and audio context if audio worklet setup fails", async () => {
  const stop = vi.fn(), close = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) } });
  vi.stubGlobal("AudioContext", class { sampleRate = 16000; close = close; audioWorklet = { addModule: vi.fn().mockRejectedValue(new Error("unsupported")) }; });
  await expect(startMicrophone(() => {}, new AbortController().signal)).rejects.toThrow("unsupported");
  expect(stop).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
});
it("stop and cancel disconnect every track without retaining recording chunks", async () => {
  const trackStop = vi.fn(), close = vi.fn().mockResolvedValue(undefined), disconnect = vi.fn();
  const port = { onmessage: null as ((e: MessageEvent<Float32Array>) => void) | null, close: vi.fn() };
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] }) } });
  vi.stubGlobal("AudioContext", class { sampleRate = 16000; destination = {}; close = close; resume = vi.fn().mockResolvedValue(undefined);
    audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) }; createMediaStreamSource() { return { connect: vi.fn(), disconnect }; } });
  vi.stubGlobal("AudioWorkletNode", class { port = port; connect = vi.fn(); disconnect = disconnect; });
  const recorder = await startMicrophone(() => {}, new AbortController().signal);
  port.onmessage?.({ data: new Float32Array(16000).fill(0.2) } as MessageEvent<Float32Array>);
  expect((await recorder.stop()).byteLength).toBe(32044); recorder.cancel();
  expect(trackStop).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce(); expect(port.onmessage).toBeNull();
  expect((await recorder.stop()).byteLength).toBe(44);
});
it("cancellation during AudioContext resume cannot return a live recording or arm a late timer", async () => {
  vi.useFakeTimers();
  try {
    const controller = new AbortController(), stop = vi.fn(), close = vi.fn().mockResolvedValue(undefined), onLimit = vi.fn();
    let release!: () => void;
    const resume = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) } });
    vi.stubGlobal("AudioContext", class {
      sampleRate = 16000; destination = {}; close = close; resume = resume;
      audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
      createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
    });
    vi.stubGlobal("AudioWorkletNode", class { port = { onmessage: null, close: vi.fn() }; connect = vi.fn(); disconnect = vi.fn(); });
    const work = startMicrophone(onLimit, controller.signal);
    const rejection = expect(work).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(resume).toHaveBeenCalledOnce());
    controller.abort(); release(); await rejection;
    await vi.advanceTimersByTimeAsync(31000);
    expect(stop).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce(); expect(onLimit).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});
