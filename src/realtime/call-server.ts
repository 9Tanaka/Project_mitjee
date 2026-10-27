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
import { captureLatencyFinalizer, identifyLatency, latencyEvent, latencyOperation, latencyOutcome, measureLatency, runLatencyTrace } from "../observability/latency.js";

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
    let finalizeObservation: (status: "cancelled") => void = () => {};
    const deadline = setTimeout(() => { finalizeObservation("cancelled"); release(); socket.destroy(); }, deps.handshakeMs ?? 5000);
    void runLatencyTrace({ transport: "websocket_handshake", operation: "handshake" }, async () => {
      finalizeObservation = captureLatencyFinalizer();
      identifyLatency(match[1]!);
      const authRequest = new Request(deps.origin + url.pathname, { headers: { cookie: request.headers.cookie ?? "" } });
      const user = await measureLatency("auth", async () => {
        const authenticated = await deps.authenticator.authenticate(authRequest);
        if (!authenticated) throw new ApiError("UNAUTHENTICATED");
        return authenticated;
      });
      if ((owners.get(user.id) ?? 0) >= 2) { latencyOutcome("failure"); failUpgrade(socket, 429); return; }
      const app = await deps.application(), voice = deps.voice(app), id = match[1]!;
      const session = await voice.bind(id, user);
      if (socket.destroyed || socket.writableEnded) { latencyOutcome("cancelled"); return; }
      // Recheck after awaits so concurrent handshakes cannot bypass owner limits.
      if ((owners.get(user.id) ?? 0) >= 2) { latencyOutcome("failure"); failUpgrade(socket, 429); return; }
      wss.handleUpgrade(request, socket, head, ws => {
        owners.set(user.id, (owners.get(user.id) ?? 0) + 1); alive.set(ws, true);
        const controller = new AbortController(); let busy = false;
        const lifetime = setTimeout(() => ws.close(1000, "Reconnect to resume"), deps.maxLifetimeMs ?? 10 * 60_000);
        const send = (value: unknown, final = false) => {
          if (ws.readyState !== WebSocket.OPEN) { latencyOutcome("cancelled"); return; }
          const parsed = callServerMessage.safeParse(value);
          if (!parsed.success) { latencyOutcome("failure"); ws.close(1011, "Invalid server response"); return; }
          const payload = JSON.stringify(parsed.data);
          if (ws.bufferedAmount + Buffer.byteLength(payload) > 6 * 1024 * 1024) { latencyOutcome("failure"); ws.terminate(); return; }
          ws.send(payload, error => { if (error) ws.terminate(); });
          if (final) {
            const responseStatus = parsed.data.type === "error" ? "failure" : "success";
            latencyEvent("response_sent", latencyOutcome(responseStatus) ?? responseStatus);
          }
        };
        ws.on("error", () => {});
        ws.on("pong", () => alive.set(ws, true));
        ws.on("close", () => { controller.abort(); clearTimeout(lifetime); alive.delete(ws);
          const count = (owners.get(user.id) ?? 1) - 1; if (count) owners.set(user.id, count); else owners.delete(user.id); });
        send({ type: "ready", session }, true);
        ws.on("message", (data, binary) => {
          void runLatencyTrace({ transport: "websocket", operation: "message" }, async () => {
            identifyLatency(id);
            if (binary || busy || !Buffer.isBuffer(data) || data.byteLength > MAX_VOICE_JSON_BYTES) { latencyOutcome("failure"); ws.close(1008, "Invalid or concurrent message"); return; }
            let input: ReturnType<typeof callClientMessage.parse>;
            try { input = callClientMessage.parse(JSON.parse(data.toString())); }
            catch { latencyOutcome("failure"); ws.close(1008, "Invalid message"); return; }
            latencyOperation(input.type === "text" ? "message" : input.type);
            if (input.type !== "resume") identifyLatency(id, input.input.turnId);
            busy = true;
            try {
              await measureLatency("auth", async () => {
                const currentUser = await deps.authenticator.authenticate(authRequest);
                if (!currentUser || currentUser.id !== user.id) throw new ApiError("UNAUTHENTICATED");
              });
              (deps.limiter ?? voiceRateLimiter).take(user.id);
              const snapshot = await voice.bind(id, user);
              if (controller.signal.aborted) { latencyOutcome("cancelled"); return; }
              if (input.type === "resume") { send({ type: "ready", session: snapshot }, true); return; }
              send({ type: "processing", turnId: input.input.turnId });
              if (input.type === "text") {
                send({ type: "committed", dialogue: await app.message(id, user, input.input) }, true);
              } else {
                const reply = await voice.send(id, user, { ...input.input, audio: Buffer.from(input.input.audioBase64, "base64") }, controller.signal,
                  dialogue => send({ type: "committed", dialogue }));
                send({ type: "voice", reply: voiceProjection(reply) }, true);
              }
            } catch (error) {
              latencyOutcome("failure");
              const mapped = publicError(error); send({ type: "error", ...mapped.body.error }, true);
              if (mapped.status === 401 || mapped.status === 404 || mapped.status === 410) ws.close(1008, "Session unavailable");
            } finally { busy = false; }
          });
        });
      });
    }).catch(error => failUpgrade(socket, publicError(error).status)).finally(() => { clearTimeout(deadline); release(); });
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
