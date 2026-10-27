import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { WebSocket } from "ws";
import { encode } from "next-auth/jwt";
import { SocketCookieAuthenticator } from "../src/auth/socket-authenticator.js";
import { attachCallWebSocket } from "../src/realtime/call-server.js";
import { VoiceRateLimiter } from "../src/server/voice-rate-limit.js";

/** Benchmark-only loopback host. Uses the unchanged production WS handler and
 * Auth.js cookie verifier. Its random signing key and fixture cookies never leave
 * this process/loopback connection; no account is created or production key used. */
export async function createSocketBenchmark(app, voice) {
  const server = createServer((_request, response) => response.writeHead(404).end());
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const secret = randomBytes(48).toString("base64url");
  const calls = attachCallWebSocket(server, { origin, authenticator: new SocketCookieAuthenticator(secret, origin),
    application: async () => app, voice: () => voice, limiter: new VoiceRateLimiter() });
  const previousLogging = process.env.LATENCY_OBSERVABILITY;
  const previousInfo = console.info;
  let acceptTrace = null;
  process.env.LATENCY_OBSERVABILITY = "1";
  // Capture the logger's allowlisted summary only. Protocol frames, cookies,
  // transcript/audio, and provider diagnostics are never written as samples.
  console.info = value => {
    if (typeof value !== "string") return;
    try {
      const summary = JSON.parse(value);
      if (summary.event === "latency_summary" && summary.transport === "websocket") acceptTrace?.(summary);
    } catch {}
  };
  return {
    async sample(cohort, prepared, text, audio) {
      const cookieName = "authjs.session-token";
      const token = await encode({ secret, salt: cookieName, token: { trainingUserId: prepared.user.id }, maxAge: 300 });
      const socket = new WebSocket(`${origin.replace("http:", "ws:")}/api/call/${prepared.sessionId}/socket`, {
        origin, headers: { cookie: `${cookieName}=${token}` },
      });
      const closed = new Promise(resolve => socket.once("close", resolve));
      let timer;
      try {
        return await new Promise((resolve, reject) => {
          let trace = null, result = null, sentAt = null, roundTripMs = null;
          const complete = () => {
            if (trace && result) resolve({ trace, result, clientRoundTripMs: roundTripMs });
          };
          acceptTrace = summary => { trace = summary; complete(); };
          timer = setTimeout(() => reject(new Error("BENCHMARK_SOCKET_TIMEOUT")), 90_000);
          socket.once("error", () => reject(new Error("BENCHMARK_SOCKET_FAILED")));
          socket.once("unexpected-response", (_request, response) => { response.resume(); reject(new Error("BENCHMARK_SOCKET_REJECTED")); });
          socket.once("close", () => { if (!result) reject(new Error("BENCHMARK_SOCKET_CLOSED")); });
          socket.on("message", bytes => {
            try {
              const frame = JSON.parse(bytes.toString());
              if (frame.type === "ready") {
                if (sentAt !== null) return;
                const turnId = randomUUID();
                const input = { turnId, expectedRevision: prepared.revision };
                sentAt = performance.now();
                socket.send(JSON.stringify(cohort === "text"
                  ? { type: "text", input: { ...input, text } }
                  : { type: "voice", input: { ...input, mime: "audio/wav", audioBase64: Buffer.from(audio).toString("base64") } }));
              } else if (frame.type === "error") reject(new Error("BENCHMARK_SOCKET_OPERATION_FAILED"));
              else if (cohort === "text" && frame.type === "committed") {
                result = frame.dialogue; roundTripMs = performance.now() - sentAt; complete();
              } else if (cohort === "voice" && frame.type === "voice") {
                result = { audioStatus: frame.reply.audioStatus }; roundTripMs = performance.now() - sentAt; complete();
              }
            } catch { reject(new Error("BENCHMARK_SOCKET_INVALID_FRAME")); }
          });
        });
      } finally {
        clearTimeout(timer); acceptTrace = null;
        socket.terminate(); await closed;
      }
    },
    async close() {
      acceptTrace = null;
      try { calls.close(); await new Promise(resolve => server.close(resolve)); }
      finally {
        console.info = previousInfo;
        if (previousLogging === undefined) delete process.env.LATENCY_OBSERVABILITY;
        else process.env.LATENCY_OBSERVABILITY = previousLogging;
      }
    },
  };
}
