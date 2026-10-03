import { createServer } from "node:http";
import next from "next";
import { attachCallWebSocket } from "../realtime/call-server.js";
import { SocketCookieAuthenticator } from "../auth/socket-authenticator.js";
import { createCallRuntime } from "./call-runtime.js";
import { getVoiceApplication } from "./voice-runtime.js";

export async function serve(dev: boolean) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  const origin = new URL(process.env.AUTH_URL ?? `http://127.0.0.1:${port}`).origin;
  const app = next({ dev, hostname: "127.0.0.1", port, webpack: true });
  await app.prepare();
  const handle = app.getRequestHandler();
  const server = createServer((req, res) => { void handle(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); }); });
  server.requestTimeout = 75_000; server.headersTimeout = 10_000;
  const runtime = createCallRuntime();
  const calls = attachCallWebSocket(server, { origin, authenticator: new SocketCookieAuthenticator(process.env.AUTH_SECRET ?? "", origin),
    application: () => runtime.application(), voice: getVoiceApplication });
  server.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/api/call/")) return;
    if (dev && req.url?.startsWith("/_next/")) void app.getUpgradeHandler()(req, socket, head);
    else socket.destroy();
  });
  server.listen(port, "127.0.0.1", () => console.info(`MITJEE HTTP + Call WebSocket ready on port ${port}`));
  const close = () => { calls.close(); server.close(); void Promise.allSettled([runtime.close(), app.close()]).finally(() => process.exit(0)); };
  process.once("SIGINT", close); process.once("SIGTERM", close);
}
