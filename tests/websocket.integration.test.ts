import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket, type ClientOptions } from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import { attachCallWebSocket } from "../src/realtime/call-server.js";
import { callServerMessage, MAX_VOICE_JSON_BYTES } from "../src/public-api/voice.js";
import { VoiceRateLimiter } from "../src/server/voice-rate-limit.js";
import { voiceHarness } from "./voice.helpers.js";
import type { z } from "zod";

type Frame = z.infer<typeof callServerMessage>;
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.restoreAllMocks(); });

function observe(client: WebSocket) {
  const queued: Frame[] = [];
  const waiters: { type: Frame["type"]; resolve: (frame: Frame) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }[] = [];
  const errors: unknown[] = [];
  const closed = new Promise<number>(resolve => { client.once("close", code => resolve(code)); });
  client.on("error", error => errors.push(error));
  client.on("message", data => {
    try {
      const frame = callServerMessage.parse(JSON.parse(data.toString()));
      const index = waiters.findIndex(waiter => waiter.type === frame.type);
      if (index >= 0) { const waiter = waiters.splice(index, 1)[0]!; clearTimeout(waiter.timer); waiter.resolve(frame); }
      else queued.push(frame);
    } catch (error) { errors.push(error); }
  });
  client.on("close", () => {
    for (const waiter of waiters.splice(0)) { clearTimeout(waiter.timer); waiter.reject(new Error("Connection closed before expected frame")); }
  });
  return {
    client, errors, closed,
    send(value: unknown) { client.send(JSON.stringify(value)); },
    next<T extends Frame["type"]>(type: T): Promise<Extract<Frame, { type: T }>> {
      const index = queued.findIndex(frame => frame.type === type);
      if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0] as Extract<Frame, { type: T }>);
      return new Promise<Frame>((resolve, reject) => {
        const waiter = { type, resolve, reject, timer: setTimeout(() => {
          const index = waiters.indexOf(waiter); if (index >= 0) waiters.splice(index, 1);
          reject(new Error(`Expected ${type} frame was not received`));
        }, 3000) };
        waiters.push(waiter);
      }) as Promise<Extract<Frame, { type: T }>>;
    },
  };
}

async function socketHarness(options: { heartbeatMs?: number; maxLifetimeMs?: number; handshakeMs?: number } = {}) {
  const h = await voiceHarness();
  const server = createServer((_request, response) => { response.writeHead(404).end(); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let authenticated = true;
  const authenticator = { authenticate: vi.fn(async (request: Request) => {
    if (!authenticated) return null;
    return request.headers.get("cookie") === "test-session=owner" ? h.owner : request.headers.get("cookie") === "test-session=other" ? { id: "other-user" } : null;
  }) };
  const calls = attachCallWebSocket(server, { origin, authenticator, application: async () => h.app, voice: () => h.voice,
    limiter: new VoiceRateLimiter(), ...options });
  cleanup.push(async () => { calls.close(); await new Promise<void>(resolve => server.close(() => resolve())); });
  function connect(id = h.session.sessionId, cookie = "test-session=owner", config: ClientOptions = {}, query = "") {
    const client = new WebSocket(`${origin.replace("http:", "ws:")}/api/call/${id}/socket${query}`, {
      origin, headers: { cookie }, ...config,
    });
    return observe(client);
  }
  async function rejected(id = h.session.sessionId, cookie = "test-session=owner", config: ClientOptions = {}, query = "") {
    const socket = connect(id, cookie, config, query);
    return new Promise<number>((resolve, reject) => {
      socket.client.once("unexpected-response", (_request, response) => { response.resume(); socket.client.terminate(); resolve(response.statusCode!); });
      socket.client.once("open", () => { socket.client.terminate(); reject(new Error("Upgrade unexpectedly accepted")); });
    });
  }
  return { ...h, origin, calls, connect, rejected, authenticator, revoke: () => { authenticated = false; } };
}

describe("actual loopback WebSocket with in-memory training and fake speech", () => {
  it("rejects anonymous, wrong-owner, non-Call-Center and terminal sessions at upgrade", async () => {
    const h = await socketHarness();
    expect(await h.rejected(h.session.sessionId, "")).toBe(401);
    expect(await h.rejected(h.session.sessionId, "test-session=other")).toBe(404);
    expect(await h.rejected("unknown-session")).toBe(404);
    const sms = await h.app.start("sms-phishing-demo", h.owner, { startId: "sms", expectedRevision: 0 });
    expect(await h.rejected(sms.session.sessionId)).toBe(422);
    await h.app.quit(h.session.sessionId, h.owner, { actionId: "quit", expectedRevision: 0 });
    expect(await h.rejected()).toBe(422);
    expect(h.stt.transcribe).not.toHaveBeenCalled();
  });

  it("enforces origin, host, and query-free endpoint without initializing dialogue", async () => {
    const h = await socketHarness();
    expect(await h.rejected(h.session.sessionId, "test-session=owner", { origin: "https://untrusted.invalid" })).toBe(403);
    expect(await h.rejected(h.session.sessionId, "test-session=owner", { headers: { cookie: "test-session=owner", host: "untrusted.invalid" } })).toBe(403);
    expect(await h.rejected(h.session.sessionId, "test-session=owner", {}, "?ownerId=other")).toBe(403);
    expect(h.provider.callCount).toBe(0);
  });

  it("sends ready, committed transcript, and audio frames, then resumes and deduplicates after reconnect", async () => {
    const h = await socketHarness();
    const socket = h.connect();
    expect((await socket.next("ready")).session.revision).toBe(0);
    socket.send({ type: "voice", input: { turnId: "voice-one", expectedRevision: 0, mime: "audio/wav", audioBase64: Buffer.from(h.input.audio).toString("base64") } });
    expect((await socket.next("processing")).turnId).toBe("voice-one");
    const commit = await socket.next("committed");
    expect(commit.dialogue.session.revision).toBe(1);
    expect(commit.dialogue.session.messages).toHaveLength(2);
    expect((await socket.next("voice")).reply.audioStatus).toBe("READY");
    socket.client.close(); await socket.closed;
    const reconnect = h.connect();
    expect((await reconnect.next("ready")).session.messages).toEqual(commit.dialogue.session.messages);
    reconnect.send({ type: "voice", input: { turnId: "voice-one", expectedRevision: 0, mime: "audio/wav", audioBase64: Buffer.from(h.input.audio).toString("base64") } });
    expect((await reconnect.next("committed")).dialogue.duplicate).toBe(true);
    expect((await reconnect.next("voice")).reply.audioStatus).toBe("REPLAY");
    expect(h.stt.transcribe).toHaveBeenCalledOnce();
    expect(h.tts.synthesize).toHaveBeenCalledOnce();
    expect(h.provider.callCount).toBe(1);
  });

  it("returns public STT error and keeps text fallback playable on the same socket", async () => {
    const h = await socketHarness(); h.stt.transcribe.mockRejectedValue(new Error("raw-private-provider-data"));
    const socket = h.connect(); await socket.next("ready");
    socket.send({ type: "voice", input: { turnId: "bad-voice", expectedRevision: 0, mime: "audio/wav", audioBase64: Buffer.from(h.input.audio).toString("base64") } });
    const error = await socket.next("error");
    expect(error.code).toBe("STT_FAILED"); expect(JSON.stringify(error)).not.toContain("raw-private");
    socket.send({ type: "text", input: { turnId: "fallback-text", expectedRevision: 0, text: "ขอตรวจสอบผู้โทร" } });
    expect((await socket.next("committed")).dialogue.session.revision).toBe(1);
    expect(h.tts.synthesize).not.toHaveBeenCalled();
    const saved = await h.repository.get(h.session.sessionId, h.owner.id);
    expect(saved.state).toBe("contact"); expect(saved.result).toBeNull(); expect(saved.dialogueTurns).toHaveLength(1);
  });

  it("rejects stale revision and allows an explicit resume on the connection", async () => {
    const h = await socketHarness(); const socket = h.connect(); await socket.next("ready");
    socket.send({ type: "text", input: { turnId: "first", expectedRevision: 0, text: "ขอข้อมูล" } });
    await socket.next("committed");
    socket.send({ type: "text", input: { turnId: "stale", expectedRevision: 0, text: "ข้อมูลเพิ่มเติม" } });
    expect((await socket.next("error")).code).toBe("REVISION_CONFLICT");
    socket.send({ type: "resume" });
    expect((await socket.next("ready")).session.revision).toBe(1);
    expect((await h.repository.get(h.session.sessionId, h.owner.id)).dialogueTurns).toHaveLength(1);
  });

  it("rechecks cookie authentication for every incoming frame", async () => {
    const h = await socketHarness(); const socket = h.connect(); await socket.next("ready"); h.revoke();
    socket.send({ type: "text", input: { turnId: "revoked", expectedRevision: 0, text: "ข้อความ" } });
    expect((await socket.next("error")).code).toBe("UNAUTHENTICATED");
    expect(await socket.closed).toBe(1008);
    expect(h.provider.callCount).toBe(0);
  });

  it.each(["malformed", "extra-key", "binary"] as const)("closes %s frames before mutation", async kind => {
    const h = await socketHarness(); const socket = h.connect(); await socket.next("ready");
    if (kind === "malformed") socket.client.send("{invalid-json");
    if (kind === "extra-key") socket.send({ type: "resume", ownerId: "other" });
    if (kind === "binary") socket.client.send(Buffer.from("audio"));
    expect(await socket.closed).toBe(1008);
    expect((await h.app.resume(h.session.sessionId, h.owner)).revision).toBe(0);
    expect(h.provider.callCount).toBe(0);
  });

  it("bounds incoming frames and outgoing buffered audio", async () => {
    const h = await socketHarness(); const oversized = h.connect(); await oversized.next("ready");
    oversized.client.send("x".repeat(MAX_VOICE_JSON_BYTES + 1));
    expect(await oversized.closed).toBe(1009);
    const blocked = h.connect(); await blocked.next("ready");
    const serverSocket = [...h.calls.wss.clients][0]!;
    Object.defineProperty(serverSocket, "bufferedAmount", { get: () => 6 * 1024 * 1024 + 1, configurable: true });
    blocked.send({ type: "resume" });
    expect(await blocked.closed).toBe(1006);
    expect((await h.app.resume(h.session.sessionId, h.owner)).revision).toBe(0);
  });

  it("limits each authenticated owner to two sockets and releases closed slots", async () => {
    const h = await socketHarness(); const first = h.connect(), second = h.connect();
    await Promise.all([first.next("ready"), second.next("ready")]);
    expect(await h.rejected()).toBe(429);
    first.client.close(); await first.closed;
    const third = h.connect(); expect((await third.next("ready")).session.sessionId).toBe(h.session.sessionId);
  });

  it("releases timed-out handshake capacity even if authentication never settles", async () => {
    const h = await socketHarness({ handshakeMs: 20 });
    h.authenticator.authenticate.mockImplementation(() => new Promise(() => {}));
    for (let i = 0; i < 20; i++) {
      const abandoned = h.connect();
      expect(await abandoned.closed).toBe(1006);
    }
    h.authenticator.authenticate.mockImplementation(async () => h.owner);
    const recovered = h.connect();
    expect((await recovered.next("ready")).session.revision).toBe(0);
  });

  it("terminates a client that does not pong and accepts reconnect with unchanged session", async () => {
    const h = await socketHarness({ heartbeatMs: 30 }); const socket = h.connect(h.session.sessionId, "test-session=owner", { autoPong: false });
    await socket.next("ready");
    expect(await socket.closed).toBe(1006);
    const reconnect = h.connect(); expect((await reconnect.next("ready")).session.revision).toBe(0);
  });

  it("closes at the session socket lifetime so reconnect reauthenticates", async () => {
    const h = await socketHarness({ maxLifetimeMs: 50 }); const socket = h.connect(); await socket.next("ready");
    expect(await socket.closed).toBe(1000);
    const before = h.authenticator.authenticate.mock.calls.length;
    const next = h.connect(); await next.next("ready");
    expect(h.authenticator.authenticate.mock.calls.length).toBeGreaterThan(before);
  });

  it("disconnect aborts pending speech and rejects concurrent turn frames", async () => {
    const h = await socketHarness(); let release!: (text: string) => void; let speechSignal!: AbortSignal;
    h.stt.transcribe.mockImplementation((_audio, signal) => { speechSignal = signal!; return new Promise(resolve => { release = resolve; }); });
    const socket = h.connect(); await socket.next("ready");
    const input = { turnId: "held", expectedRevision: 0, mime: "audio/wav", audioBase64: Buffer.from(h.input.audio).toString("base64") };
    socket.send({ type: "voice", input });
    await socket.next("processing");
    await vi.waitFor(() => expect(h.stt.transcribe).toHaveBeenCalledOnce());
    socket.send({ type: "resume" });
    expect(await socket.closed).toBe(1008);
    await vi.waitFor(() => expect(speechSignal.aborted).toBe(true));
    release("late transcript");
    await new Promise(resolve => setImmediate(resolve));
    expect((await h.app.resume(h.session.sessionId, h.owner)).revision).toBe(0);
    expect(h.provider.callCount).toBe(0);
  });
});
