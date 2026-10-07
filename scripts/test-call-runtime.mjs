// Production runtime smoke only: synthetic configuration, no database or paid provider calls.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { WebSocket } from "ws";

const probe = createServer();
await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["--import", "tsx", "scripts/serve.mjs", "--production"], {
  cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: String(port), AUTH_URL: origin, AUTH_SECRET: "synthetic-runtime-smoke-secret-not-for-deployment",
    AI_PROVIDER: "mock", DATABASE_URL: "", OPENAI_API_KEY: "", GROQ_API_KEY: "", AZURE_SPEECH_KEY: "", AZURE_SPEECH_REGION: "" },
});
let browser;
let serverError = false;
child.stderr.on("data", () => { serverError = true; });
let stage = "startup";
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("startup timeout")), 30_000);
    child.stdout.on("data", data => { if (data.toString().includes("HTTP + Call WebSocket ready")) { clearTimeout(timer); resolve(); } });
    child.once("exit", () => { clearTimeout(timer); reject(new Error("startup exited")); });
    child.once("error", () => { clearTimeout(timer); reject(new Error("startup unavailable")); });
  });
  stage = "anonymous-http";
  assert.equal((await fetch(`${origin}/api/scenarios`)).status, 401);
  assert.equal((await fetch(`${origin}/api/training/test-session/voice`, { method: "POST", headers: { Origin: origin } })).status, 401);
  assert.equal((await fetch(`${origin}/call-recorder.js`)).status, 200);
  stage = "anonymous-websocket";
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(`${origin.replace("http:", "ws:")}/api/call/test-session/socket`, { origin });
    const timer = setTimeout(() => { socket.terminate(); reject(new Error("upgrade timeout")); }, 5000);
    socket.on("error", () => {});
    socket.once("unexpected-response", (_request, response) => {
      clearTimeout(timer); response.resume(); socket.terminate();
      if (response.statusCode === 401) resolve(); else reject(new Error("unexpected upgrade response"));
    });
    socket.once("open", () => { clearTimeout(timer); socket.terminate(); reject(new Error("anonymous upgrade accepted")); });
  });
  stage = "browser";
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let pageErrors = 0, consoleErrors = 0;
  page.on("pageerror", () => { pageErrors++; });
  page.on("console", message => { if (message.type() === "error") consoleErrors++; });
  stage = "home-page";
  await page.goto(origin, { waitUntil: "networkidle" });
  assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1);
  assert.equal(await page.locator("[data-nextjs-dialog], .vite-error-overlay").count(), 0);
  stage = "login-navigation";
  await page.getByRole("link", { name: "มีบัญชีแล้ว? เข้าสู่ระบบ" }).click();
  await page.waitForURL("**/login");
  stage = "login-controls";
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  await page.screenshot({ path: "frontend-artifacts/call-runtime-login.png", fullPage: true });
  stage = "runtime-diagnostics";
  console.info(JSON.stringify({ pageErrors, consoleErrors, serverStderr: serverError }));
  assert.equal(pageErrors, 0); assert.equal(consoleErrors, 0); assert.equal(serverError, false);
  console.info(JSON.stringify({ runtimeSmoke: "PASS", httpAnonymous: 401, socketAnonymous: 401,
    worklet: 200, homeAndLogin: "PASS", pageErrors, consoleErrors, database: "NOT USED", providers: "NOT USED" }));
} catch {
  console.error(JSON.stringify({ runtimeSmoke: "FAIL", stage, rawDiagnostics: "withheld" }));
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (child.exitCode === null) { const stopped = new Promise(resolve => child.once("exit", resolve)); child.kill(); await stopped; }
}
