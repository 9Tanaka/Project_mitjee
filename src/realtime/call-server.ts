import type { Server, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { RequestAuthenticator } from "../http/auth.js";
import type { TrainingApplicationService } from "../application/training-service.js";
import type { VoiceApplicationService } from "../application/voice-service.js";
import { callClientMessage, callServerMessage, MAX_VOICE_JSON_BYTES } from "../public-api/voice.js";
import { ApiError, publicError } from "../http/errors.js";
import { voiceProjection } from "../http/voice-handler.js";
import { voiceRateLimiter, type VoiceRateLimiter } from "../server/voice-rate-limit.js";

export interface CallServerDependencies {
  origin: string; authenticator: RequestAuthenticator;
  application(): Promise<TrainingApplicationService>;
  voice(app: TrainingApplicationService): VoiceApplicationService;
  limiter?: VoiceRateLimiter; heartbeatMs?: number; handshakeMs?: number; maxLifetimeMs?: number;
}
export function attachCallWebSocket(server: Server, deps: CallServerDependencies) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_VOICE_JSON_BYTES, perMessageDeflate: false, clientTracking: true });
  const owners = new Map<string, number>();
  const alive = new Map<WebSocket, boolean>();
  let handshakes = 0;
  const failUpgrade = (socket: Duplex, status = 404) => {
    if (!socket.destroyed) { socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); }
  };
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    let url: URL;
    try { url = new URL(request.url ?? "/", deps.origin); }
    catch { socket.destroy(); return; }
    if (!url.pathname.startsWith("/api/call/")) return;
    socket.on("error", () => {});
    if (wss.clients.size + handshakes >= 20) { failUpgrade(socket, 429); return; }
    const match = /^\/api\/call\/([a-zA-Z0-9_-]{1,100})\/socket$/.exec(url.pathname);
    if (!match || url.search || request.headers.origin !== deps.origin || request.headers.host !== new URL(deps.origin).host) { failUpgrade(socket, 403); return; }
    handshakes++;
    let released = false;
    const release = () => { if (!released) { released = true; handshakes--; } };
    const deadline = setTimeout(() => { release(); socket.destroy(); }, deps.handshakeMs ?? 5000);
    void (async () => {
      const authRequest = new Request(deps.origin + url.pathname, { headers: { cookie: request.headers.cookie ?? "" } });
      const user = await deps.authenticator.authenticate(authRequest);
      if (!user) { failUpgrade(socket, 401); return; }
      if ((owners.get(user.id) ?? 0) >= 2) { failUpgrade(socket, 429); return; }
      const app = await deps.application(), voice = deps.voice(app), id = match[1]!;
      const session = await voice.bind(id, user);
      if (socket.destroyed || socket.writableEnded) return;
      // Recheck after awaits so concurrent handshakes cannot bypass owner limits.
      if ((owners.get(user.id) ?? 0) >= 2) { failUpgrade(socket, 429); return; }
      wss.handleUpgrade(request, socket, head, ws => {
        owners.set(user.id, (owners.get(user.id) ?? 0) + 1); alive.set(ws, true);
        const controller = new AbortController(); let busy = false;
        const lifetime = setTimeout(() => ws.close(1000, "Reconnect to resume"), deps.maxLifetimeMs ?? 10 * 60_000);
        const send = (value: unknown) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const parsed = callServerMessage.safeParse(value);
          if (!parsed.success) { ws.close(1011, "Invalid server response"); return; }
          const payload = JSON.stringify(parsed.data);
          if (ws.bufferedAmount + Buffer.byteLength(payload) > 6 * 1024 * 1024) { ws.terminate(); return; }
          ws.send(payload, error => { if (error) ws.terminate(); });
        };
        ws.on("error", () => {});
        ws.on("pong", () => alive.set(ws, true));
        ws.on("close", () => { controller.abort(); clearTimeout(lifetime); alive.delete(ws);
          const count = (owners.get(user.id) ?? 1) - 1; if (count) owners.set(user.id, count); else owners.delete(user.id); });
        send({ type: "ready", session });
        ws.on("message", (data, binary) => {
          if (binary || busy || !Buffer.isBuffer(data) || data.byteLength > MAX_VOICE_JSON_BYTES) { ws.close(1008, "Invalid or concurrent message"); return; }
          let input: ReturnType<typeof callClientMessage.parse>;
          try { input = callClientMessage.parse(JSON.parse(data.toString())); }
          catch { ws.close(1008, "Invalid message"); return; }
          busy = true;
          void (async () => {
            const currentUser = await deps.authenticator.authenticate(authRequest);
            if (!currentUser || currentUser.id !== user.id) throw new ApiError("UNAUTHENTICATED");
            (deps.limiter ?? voiceRateLimiter).take(user.id);
            const snapshot = await voice.bind(id, user);
            if (controller.signal.aborted) return;
            if (input.type === "resume") { send({ type: "ready", session: snapshot }); return; }
            send({ type: "processing", turnId: input.input.turnId });
            if (input.type === "text") {
              send({ type: "committed", dialogue: await app.message(id, user, input.input) });
            } else {
              const reply = await voice.send(id, user, { ...input.input, audio: Buffer.from(input.input.audioBase64, "base64") }, controller.signal,
                dialogue => send({ type: "committed", dialogue }));
              send({ type: "voice", reply: voiceProjection(reply) });
            }
          })().catch(error => {
            const mapped = publicError(error); send({ type: "error", ...mapped.body.error });
            if (mapped.status === 401 || mapped.status === 404 || mapped.status === 410) ws.close(1008, "Session unavailable");
          }).finally(() => { busy = false; });
        });
      });
    })().catch(error => failUpgrade(socket, publicError(error).status)).finally(() => { clearTimeout(deadline); release(); });
  };
  server.on("upgrade", upgrade);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) { ws.terminate(); continue; }
      alive.set(ws, false); ws.ping();
    }
  }, deps.heartbeatMs ?? 15_000);
  heartbeat.unref();
  return { wss, close() { clearInterval(heartbeat); server.off("upgrade", upgrade); for (const ws of wss.clients) ws.terminate(); wss.close(); } };
}
