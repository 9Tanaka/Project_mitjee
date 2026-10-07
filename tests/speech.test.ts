import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_AUDIO_BYTES, SPEECH_TIMEOUT_MS, speechDeadline, validateWav } from "../src/speech/contracts.js";
import { pcmWav } from "./voice.helpers.js";

const fake = vi.hoisted(() => ({
  telemetry: vi.fn(), fromSubscription: vi.fn(), write: vi.fn(), streamClose: vi.fn(), recognizeClose: vi.fn(), synthClose: vi.fn(),
  text: "ข้อความสมมติ", reason: 1, ttsReason: 2, hold: false, throwStt: false, throwTts: false,
  config: {} as Record<string, unknown>, audio: new Uint8Array(100).buffer,
  recognitionCallback: null as null | ((value: { reason: number; text: string }) => void),
  synthesisCallback: null as null | ((value: { reason: number; audioData: ArrayBuffer }) => void),
}));
vi.mock("microsoft-cognitiveservices-speech-sdk", () => ({
  Recognizer: { enableTelemetry: fake.telemetry },
  SpeechConfig: { fromSubscription: (...args: unknown[]) => { fake.fromSubscription(...args); return fake.config; } },
  SpeechSynthesisOutputFormat: { Riff16Khz16BitMonoPcm: 11 },
  ResultReason: { RecognizedSpeech: 1, SynthesizingAudioCompleted: 2 },
  AudioStreamFormat: { getWaveFormatPCM: vi.fn() },
  AudioInputStream: { createPushStream: () => ({ write: fake.write, close: fake.streamClose }) },
  AudioConfig: { fromStreamInput: vi.fn() },
  SpeechRecognizer: class {
    recognizeOnceAsync(callback: typeof fake.recognitionCallback) {
      if (fake.throwStt) throw new Error("private sdk STT diagnostic");
      fake.recognitionCallback = callback;
      if (!fake.hold) callback?.({ reason: fake.reason, text: fake.text });
    }
    close() { fake.recognizeClose(); }
  },
  SpeechSynthesizer: class {
    speakTextAsync(_text: string, callback: typeof fake.synthesisCallback) {
      if (fake.throwTts) throw new Error("private sdk TTS diagnostic");
      fake.synthesisCallback = callback;
      if (!fake.hold) callback?.({ reason: fake.ttsReason, audioData: fake.audio });
    }
    close() { fake.synthClose(); }
  },
}));
import { AzureSpeechProvider } from "../src/providers/azure-speech.js";
import { createSpeechProvider } from "../src/server/voice-runtime.js";

afterEach(() => { vi.useRealTimers(); });
beforeEach(() => {
  vi.clearAllMocks(); fake.config = {}; fake.reason = 1; fake.ttsReason = 2; fake.text = "ข้อความสมมติ";
  fake.hold = false; fake.throwStt = false; fake.throwTts = false; fake.audio = pcmWav().buffer as ArrayBuffer;
  fake.recognitionCallback = null; fake.synthesisCallback = null;
});

describe("canonical recording boundary", () => {
  it("accepts at most thirty seconds of mono 16 kHz signed 16-bit WAV", () => {
    expect(() => validateWav(pcmWav(16_000 * 30), "audio/wav")).not.toThrow();
    expect(pcmWav(16_000 * 30).byteLength).toBe(MAX_AUDIO_BYTES);
    expect(() => validateWav(pcmWav(16_000 * 30 + 1), "audio/wav")).toThrow("AUDIO_TOO_LARGE");
  });
  it.each([0, 8, 12, 20, 22, 24, 28, 32, 34, 36, 40])("rejects corrupt format/header at offset %d", offset => {
    const wav = pcmWav(); wav[offset] = wav[offset]! ^ 1;
    expect(() => validateWav(wav, "audio/wav")).toThrow("INVALID_AUDIO");
  });
  it("rejects empty audio, unexpected MIME, odd sample length, and arbitrary binary", () => {
    for (const audio of [new Uint8Array(0), pcmWav(0), new Uint8Array(100), pcmWav().slice(0, -1)]) {
      expect(() => validateWav(audio, "audio/wav")).toThrow("INVALID_AUDIO");
    }
    expect(() => validateWav(pcmWav(), "audio/webm")).toThrow("INVALID_AUDIO");
  });
  it("honors typed-array offsets rather than reading unrelated backing bytes", () => {
    const audio = pcmWav(); const storage = new Uint8Array(audio.length + 24); storage.set(audio, 12);
    expect(() => validateWav(storage.subarray(12, 12 + audio.length), "audio/wav")).not.toThrow();
  });
});

describe("speech deadline", () => {
  it("aborts a provider at its deadline and discards ignored late completion", async () => {
    vi.useFakeTimers(); let signal!: AbortSignal; let release!: (value: string) => void;
    const work = speechDeadline(s => { signal = s; return new Promise(resolve => { release = resolve; }); });
    const rejection = expect(work).rejects.toThrow("SPEECH_UNAVAILABLE");
    await vi.advanceTimersByTimeAsync(SPEECH_TIMEOUT_MS);
    await rejection;
    expect(signal.aborted).toBe(true);
    release("late transcript");
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not invoke an already-cancelled operation", async () => {
    const operation = vi.fn(async () => "unused"); const controller = new AbortController(); controller.abort();
    await expect(speechDeadline(operation, controller.signal)).rejects.toThrow("SPEECH_UNAVAILABLE");
    expect(operation).not.toHaveBeenCalled();
  });
  it("clears deadline after successful completion", async () => {
    vi.useFakeTimers();
    await expect(speechDeadline(async () => "done")).resolves.toBe("done");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Azure speech adapter with local SDK doubles", () => {
  it("uses Thai configuration, disables telemetry, and sends PCM without WAV header", async () => {
    const provider = new AzureSpeechProvider("synthetic-test-key", "southeastasia");
    const wav = pcmWav(); wav[44] = 17;
    await expect(provider.transcribe(wav)).resolves.toBe("ข้อความสมมติ");
    expect(fake.telemetry).toHaveBeenCalledWith(false);
    expect(fake.config).toMatchObject({ speechRecognitionLanguage: "th-TH", speechSynthesisVoiceName: "th-TH-PremwadeeNeural", speechSynthesisOutputFormat: 11 });
    expect(new Uint8Array(fake.write.mock.calls[0]![0] as ArrayBuffer)).toEqual(wav.slice(44));
    expect(fake.recognizeClose).toHaveBeenCalledOnce();
    await expect(provider.synthesize("ข้อความสมมติ")).resolves.toEqual(new Uint8Array(fake.audio));
    expect(fake.synthClose).toHaveBeenCalledOnce();
  });
  it.each(["no-match", "throw"] as const)("maps %s recognition failure without exposing raw diagnostic", async mode => {
    fake.reason = 0; fake.throwStt = mode === "throw";
    await expect(new AzureSpeechProvider("key", "southeastasia").transcribe(pcmWav())).rejects.toMatchObject({ code: "STT_FAILED", message: "STT_FAILED" });
    expect(fake.recognizeClose).toHaveBeenCalledOnce();
  });
  it.each(["cancelled", "throw", "empty", "too-large"] as const)("maps %s synthesis failure and releases SDK resources", async mode => {
    if (mode === "cancelled") fake.ttsReason = 0;
    if (mode === "throw") fake.throwTts = true;
    if (mode === "empty") fake.audio = new ArrayBuffer(0);
    if (mode === "too-large") fake.audio = new ArrayBuffer(4 * 1024 * 1024 + 1);
    await expect(new AzureSpeechProvider("key", "southeastasia").synthesize("ข้อความสมมติ")).rejects.toMatchObject({ code: "SPEECH_UNAVAILABLE", message: "SPEECH_UNAVAILABLE" });
    expect(fake.synthClose).toHaveBeenCalledOnce();
  });
  it.each(["stt", "tts"] as const)("cancels in-flight %s once and ignores a late SDK callback", async mode => {
    fake.hold = true; const controller = new AbortController(); const provider = new AzureSpeechProvider("key", "southeastasia");
    const work = mode === "stt" ? provider.transcribe(pcmWav(), controller.signal) : provider.synthesize("ข้อความสมมติ", controller.signal);
    const rejection = expect(work).rejects.toThrow(mode === "stt" ? "STT_FAILED" : "SPEECH_UNAVAILABLE");
    controller.abort(); await rejection;
    fake.recognitionCallback?.({ reason: 1, text: "late" });
    fake.synthesisCallback?.({ reason: 2, audioData: fake.audio });
    expect(mode === "stt" ? fake.recognizeClose : fake.synthClose).toHaveBeenCalledOnce();
  });
  it("uses unavailable providers for missing configuration and rejects invalid regions", async () => {
    const absent = createSpeechProvider({});
    await expect(absent.transcribe(pcmWav())).rejects.toThrow("SPEECH_UNAVAILABLE");
    await expect(absent.synthesize("ข้อความสมมติ")).rejects.toThrow("SPEECH_UNAVAILABLE");
    expect(() => createSpeechProvider({ AZURE_SPEECH_KEY: "key" })).toThrow("SPEECH_UNAVAILABLE");
    expect(() => new AzureSpeechProvider("key", "https://attacker.invalid")).toThrow("SPEECH_UNAVAILABLE");
    expect(fake.fromSubscription).not.toHaveBeenCalled();
  });
});
