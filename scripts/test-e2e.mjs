import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";

async function run() {
  const raw = process.env.MYSQL_TEST_DATABASE_URL;
  assert.ok(raw, "Dedicated test database environment is required");
  const db = new URL(raw);
  assert.ok(db.protocol === "mysql:" && ["localhost", "127.0.0.1", "[::1]"].includes(db.hostname)
    && /^mitjee_test(?:_[a-z0-9_]+)?$/.test(db.pathname.slice(1)) && !db.search && !db.hash,
    "E2E requires a loopback dedicated test database");
  const listener = createServer(); listener.listen(0, "127.0.0.1"); await once(listener, "listening");
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const origin = "http://localhost:" + port;
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    windowsHide: true, stdio: "ignore",
    env: { ...process.env, AI_PROVIDER: "mock", NODE_ENV: "production", AUTH_SECRET: randomBytes(48).toString("base64url"), AUTH_URL: origin,
      AUTH_TRUST_HOST: "", DATABASE_URL: raw, DATABASE_LOOPBACK_RSA_PUBLIC_KEY_PATH: process.env.MYSQL_TEST_RSA_PUBLIC_KEY_PATH ?? "" },
  });
  const exited = new Promise(resolve => { server.once("exit", resolve); server.once("error", resolve); });
  try {
    let ready = false;
    for (let i = 0; i < 150; i++) {
      try { if ((await fetch(origin + "/api/scenarios", { signal: AbortSignal.timeout(1000) })).status === 401) { ready = true; break; } } catch {}
      if (server.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(ready, "Next server startup failed");
    const runner = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test"], {
      windowsHide: true, stdio: "inherit", env: { ...process.env, E2E_BASE_URL: origin },
    });
    const code = await new Promise(resolve => { runner.once("exit", resolve); runner.once("error", () => resolve(1)); });
    process.exitCode = code === 0 ? 0 : 1;
  } finally { server.kill(); await exited; }
}
run().catch(() => { console.error("Browser E2E failed. Verify private test configuration and production build; no server logs or credentials are printed."); process.exitCode = 1; });
