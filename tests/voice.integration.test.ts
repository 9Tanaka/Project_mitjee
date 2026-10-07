import { afterEach, describe, expect, it, vi } from "vitest";
import { SpeechError } from "../src/speech/contracts.js";
import { VoiceApplicationService } from "../src/application/voice-service.js";
import { VoiceRateLimiter } from "../src/server/voice-rate-limit.js";
import { voiceHarness, pcmWav } from "./voice.helpers.js";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("voice application with in-memory domain and fake speech", () => {
  it.each(["NORMAL_CALL", "SCAM_CALL"] as const)("commits sanitized %s dialogue without changing state or assessment", async variant => {
    const h = await voiceHarness(variant);
    h.stt.transcribe.mockResolvedValue("อีเมล demo@example.com OTP 123456 โทร 0812345678");
    const before = await h.repository.get(h.session.sessionId, h.owner.id);
    const reply = await h.voice.send(h.session.sessionId, h.owner, h.input);
    const after = await h.repository.get(h.session.sessionId, h.owner.id);
    expect(reply.audioStatus).toBe("READY");
    expect(reply.audio).toEqual(pcmWav());
    expect(after.revision).toBe(before.revision + 1);
    expect(after.state).toBe(before.state);
    expect(after.status).toBe("ACTIVE");
    expect(after.result).toBeNull();
    expect(after.events).toEqual(before.events);
    expect(after.opportunities).toEqual(before.opportunities);
    const persisted = JSON.stringify(after);
    for (const value of ["demo@example.com", "123456", "0812345678"]) expect(persisted).not.toContain(value);
    expect(persisted).toContain("REDACTED_EMAIL");
    expect(persisted).toContain("REDACTED_SECRET");
    expect(h.stt.transcribe).toHaveBeenCalledOnce();
    expect(h.tts.synthesize).toHaveBeenCalledOnce();
    expect(after.messages).toHaveLength(2);
    expect(after.dialogueTurns).toHaveLength(1);
  });

  it.each(["reject", "empty", "cancel"] as const)("%s STT leaves the entire session unchanged", async mode => {
    const h = await voiceHarness();
    const controller = new AbortController();
    if (mode === "reject") h.stt.transcribe.mockRejectedValue(new Error("private provider diagnostic"));
    if (mode === "empty") h.stt.transcribe.mockResolvedValue(" \u0000 ");
    if (mode === "cancel") controller.abort();
    const before = await h.repository.get(h.session.sessionId, h.owner.id);
    await expect(h.voice.send(h.session.sessionId, h.owner, h.input, controller.signal)).rejects.toMatchObject({ code: mode === "empty" ? "EMPTY_TRANSCRIPT" : "STT_FAILED" });
    expect(await h.repository.get(h.session.sessionId, h.owner.id)).toEqual(before);
    expect(h.provider.callCount).toBe(0);
    expect(h.tts.synthesize).not.toHaveBeenCalled();
  });

  it("aborted STT cannot commit a late transcript", async () => {
    const h = await voiceHarness();
    let release!: (text: string) => void;
    h.stt.transcribe.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const controller = new AbortController();
    const work = h.voice.send(h.session.sessionId, h.owner, h.input, controller.signal);
    const rejection = expect(work).rejects.toMatchObject({ code: "STT_FAILED" });
    await vi.waitFor(() => expect(h.stt.transcribe).toHaveBeenCalledOnce());
    controller.abort();
    await rejection;
    release("OTP 123456");
    await new Promise(resolve => setImmediate(resolve));
    expect((await h.app.resume(h.session.sessionId, h.owner)).revision).toBe(0);
    expect(h.provider.callCount).toBe(0);
  });

  it("publishes the committed transcript before TTS and preserves it when TTS fails", async () => {
    const h = await voiceHarness();
    const onCommitted = vi.fn();
    h.tts.synthesize.mockImplementation(async () => {
      expect(onCommitted).toHaveBeenCalledOnce();
      expect((await h.app.resume(h.session.sessionId, h.owner)).revision).toBe(1);
      throw new Error("private TTS detail");
    });
    const reply = await h.voice.send(h.session.sessionId, h.owner, h.input, undefined, onCommitted);
    expect(reply.audioStatus).toBe("UNAVAILABLE");
    expect(reply.audio).toBeNull();
    expect(reply.dialogue.session.messages).toHaveLength(2);
    expect((await h.repository.get(h.session.sessionId, h.owner.id)).dialogueTurns).toHaveLength(1);
  });

  it("duplicate turn replays without STT, AI, TTS, or a second revision", async () => {
    const h = await voiceHarness();
    await h.voice.send(h.session.sessionId, h.owner, h.input);
    const replay = await h.voice.send(h.session.sessionId, h.owner, { ...h.input, audio: new Uint8Array() });
    expect(replay.audioStatus).toBe("REPLAY");
    expect(replay.dialogue.duplicate).toBe(true);
    expect(replay.dialogue.session.revision).toBe(1);
    expect(h.stt.transcribe).toHaveBeenCalledOnce();
    expect(h.tts.synthesize).toHaveBeenCalledOnce();
    expect(h.provider.callCount).toBe(1);
  });

  it("rejects a stale new turn before spending STT work", async () => {
    const h = await voiceHarness();
    await h.app.message(h.session.sessionId, h.owner, { turnId: "text-first", expectedRevision: 0, text: "สอบถาม" });
    await expect(h.voice.send(h.session.sessionId, h.owner, h.input)).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(h.stt.transcribe).not.toHaveBeenCalled();
  });

  it("concurrent text commit wins CAS while an older STT request leaves no partial write", async () => {
    const h = await voiceHarness();
    let release!: (text: string) => void;
    h.stt.transcribe.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const work = h.voice.send(h.session.sessionId, h.owner, h.input);
    const rejection = expect(work).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await vi.waitFor(() => expect(h.stt.transcribe).toHaveBeenCalledOnce());
    await h.app.message(h.session.sessionId, h.owner, { turnId: "text-wins", expectedRevision: 0, text: "สอบถาม" });
    release("ขอตรวจสอบก่อน");
    await rejection;
    const saved = await h.repository.get(h.session.sessionId, h.owner.id);
    expect(saved.revision).toBe(1);
    expect(saved.dialogueTurns).toHaveLength(1);
    expect(saved.messages.map(message => message.turnId)).toEqual(["text-wins", "text-wins"]);
    expect(h.tts.synthesize).not.toHaveBeenCalled();
  });

  it("enforces ownership, Call Center category, and active status before STT", async () => {
    const h = await voiceHarness();
    await expect(h.voice.send(h.session.sessionId, { id: "other-user" }, h.input)).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
    const sms = await h.app.start("sms-phishing-demo", h.owner, { startId: "sms", expectedRevision: 0 });
    await expect(h.voice.send(sms.session.sessionId, h.owner, h.input)).rejects.toMatchObject({ code: "VOICE_NOT_ALLOWED" });
    await h.app.quit(h.session.sessionId, h.owner, { actionId: "quit", expectedRevision: 0 });
    await expect(h.voice.send(h.session.sessionId, h.owner, h.input)).rejects.toMatchObject({ code: "SESSION_NOT_ACTIVE" });
    expect(h.stt.transcribe).not.toHaveBeenCalled();
  });

  it("rejects invalid audio and bounds in-flight work to one per session", async () => {
    const h = await voiceHarness();
    await expect(h.voice.send(h.session.sessionId, h.owner, { ...h.input, mime: "audio/mp3" })).rejects.toMatchObject({ code: "INVALID_AUDIO" });
    let release!: (text: string) => void;
    h.stt.transcribe.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const first = h.voice.send(h.session.sessionId, h.owner, h.input);
    await vi.waitFor(() => expect(h.stt.transcribe).toHaveBeenCalledOnce());
    await expect(h.voice.send(h.session.sessionId, h.owner, { ...h.input, turnId: "parallel" })).rejects.toMatchObject({ code: "VOICE_BUSY" });
    release("ขอตรวจสอบก่อน");
    await first;
    h.stt.transcribe.mockResolvedValue("ขอตรวจสอบก่อน");
    await expect(h.voice.send(h.session.sessionId, h.owner, { ...h.input, turnId: "next", expectedRevision: 1 })).resolves.toMatchObject({ audioStatus: "READY" });
  });

  it("bounds aggregate speech work to twenty active sessions and releases cancelled work", async () => {
    const h = await voiceHarness();
    h.stt.transcribe.mockImplementation(() => new Promise(() => {}));
    const controllers = Array.from({ length: 20 }, () => new AbortController());
    const sessions = await Promise.all(Array.from({ length: 21 }, async () => ({ session: await h.startCall() })));
    const work = controllers.map((controller, index) => h.voice.send(sessions[index]!.session.sessionId, h.owner,
      { ...h.input, turnId: `parallel-${index}` }, controller.signal).catch(error => error));
    await vi.waitFor(() => expect(h.stt.transcribe).toHaveBeenCalledTimes(20));
    await expect(h.voice.send(sessions[20]!.session.sessionId, h.owner, h.input)).rejects.toMatchObject({ code: "VOICE_BUSY" });
    for (const controller of controllers) controller.abort();
    for (const error of await Promise.all(work)) expect(error).toMatchObject({ code: "STT_FAILED" });
    h.stt.transcribe.mockResolvedValue("ขอตรวจสอบผู้โทรก่อน");
    await expect(h.voice.send(sessions[20]!.session.sessionId, h.owner, h.input)).resolves.toMatchObject({ audioStatus: "READY" });
  });
});

describe("shared voice rate limit", () => {
  it("separate transport instances share a primitive rate window", () => {
    const windows = new Map<string, { at: number; count: number }>();
    const http = new VoiceRateLimiter(() => 0, windows), socket = new VoiceRateLimiter(() => 0, windows);
    for (let i = 0; i < 6; i++) { http.take("owner"); socket.take("owner"); }
    expect(() => http.take("owner")).toThrow(SpeechError);
    expect(() => socket.take("owner")).toThrow(SpeechError);
  });
  it("allows twelve requests per minute and releases old windows", () => {
    let now = 0; const limiter = new VoiceRateLimiter(() => now);
    for (let i = 0; i < 12; i++) limiter.take("owner");
    expect(() => limiter.take("owner")).toThrow(SpeechError);
    limiter.take("another-owner");
    now = 60_000;
    expect(() => limiter.take("owner")).not.toThrow();
  });
  it("bounds the owner map and recovers after expiry", () => {
    let now = 0; const limiter = new VoiceRateLimiter(() => now);
    for (let i = 0; i < 200; i++) limiter.take(`owner-${i}`);
    expect(() => limiter.take("overflow")).toThrow(SpeechError);
    now = 60_000;
    expect(() => limiter.take("overflow")).not.toThrow();
  });
});
it("separate HTTP/socket services share in-flight admission without sharing class instances", async () => {
  const h = await voiceHarness(), pending = new Set<string>();
  const http = new VoiceApplicationService(h.app, h.stt, h.tts, pending);
  const socket = new VoiceApplicationService(h.app, h.stt, h.tts, pending);
  let release!: (text: string) => void;
  h.stt.transcribe.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const work = socket.send(h.session.sessionId, h.owner, h.input);
  await vi.waitFor(() => expect(h.stt.transcribe).toHaveBeenCalledOnce());
  await expect(http.send(h.session.sessionId, h.owner, h.input)).rejects.toMatchObject({ code: "VOICE_BUSY" });
  release("ขอตรวจสอบก่อน"); await work;
  expect(pending.size).toBe(0);
  const replay = await http.send(h.session.sessionId, h.owner, h.input);
  expect(replay.audioStatus).toBe("REPLAY"); expect(h.stt.transcribe).toHaveBeenCalledOnce();
});
