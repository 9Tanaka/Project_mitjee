import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import mariadb from "mariadb";

// Dedicated, loopback-only smoke. No credentials, cookies, request bodies or child
// process logs are printed, including on failure. All account secrets are ephemeral.
async function smoke() {
  const rawUrl = process.env.MYSQL_TEST_DATABASE_URL;
  assert.ok(rawUrl, "Dedicated test database environment is required");
  const db = new URL(rawUrl);
  assert.ok(db.protocol === "mysql:" && ["127.0.0.1", "localhost", "[::1]"].includes(db.hostname)
    && /^mitjee_test(?:_[a-z0-9_]+)?$/.test(db.pathname.slice(1)) && !db.search && !db.hash,
    "Smoke requires a loopback dedicated test database");
  const listener = createServer(); listener.listen(0, "127.0.0.1"); await once(listener, "listening");
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  // NextURL canonicalizes loopback IPs to localhost. Use one exact browser origin;
  // do not weaken origin checks or treat different origins as interchangeable.
  const origin = `http://localhost:${port}`;
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    windowsHide: true, stdio: "ignore",
    env: { ...process.env, AI_PROVIDER: "mock", NODE_ENV: "production", AUTH_SECRET: randomBytes(48).toString("base64url"),
      AUTH_URL: origin, AUTH_TRUST_HOST: "", DATABASE_URL: rawUrl,
      DATABASE_LOOPBACK_RSA_PUBLIC_KEY_PATH: process.env.MYSQL_TEST_RSA_PUBLIC_KEY_PATH ?? "" },
  });
  let connection;
  const exited = new Promise(resolve => { server.once("exit", resolve); server.once("error", resolve); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      try { if ((await fetch(origin + "/api/scenarios", { signal: AbortSignal.timeout(1000) })).status === 401) { ready = true; break; } } catch {}
      if (server.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(ready, "Next server startup failed");
    function browser() {
      const cookies = new Map();
      return {
        async request(path, body, options = {}) {
          const headers = { ...(body === undefined ? {} : { "content-type": "application/json", origin }), ...options.headers };
          if (cookies.size) headers.cookie = [...cookies].map(([k,v]) => k + "=" + v).join("; ");
          const response = await fetch(origin + path, {
            method: body === undefined ? "GET" : "POST", redirect: "manual",
            headers, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
            signal: AbortSignal.timeout(15000),
          });
          for (const cookie of response.headers.getSetCookie()) {
            const pair = cookie.split(";")[0]; const index = pair.indexOf("=");
            const key = pair.slice(0, index), value = pair.slice(index + 1);
            if (!value || /max-age=0(?:;|$)/i.test(cookie)) cookies.delete(key); else cookies.set(key, value);
          }
          return response;
        },
      };
    }
    async function data(response, expected) {
      assert.equal(response.status, expected, "Unexpected HTTP status at " + new URL(response.url).pathname + ": expected " + expected + ", got " + response.status);
      return response.json();
    }
    async function csrf(client) { return (await data(await client.request("/api/auth/csrf"), 200)).csrfToken; }
    async function login(client, email, password) {
      const token = await csrf(client);
      const response = await client.request("/api/auth/callback/credentials",
        new URLSearchParams({ csrfToken: token, email, password, callbackUrl: origin }).toString(),
        { headers: { "content-type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" } });
      const result = await data(response, 200);
      return new URL(result.url).searchParams.get("error");
    }
    const a = browser(), b = browser(), anonymous = browser();
    const emailA = randomUUID() + "@example.test", emailB = randomUUID() + "@example.test";
    const passwordA = randomBytes(24).toString("base64url"), passwordB = randomBytes(24).toString("base64url");
    const registeredA = await data(await a.request("/api/auth/register", { email: emailA, password: passwordA }), 201);
    const registeredB = await data(await b.request("/api/auth/register", { email: emailB, password: passwordB }), 201);
    const idA = registeredA.data.user.id, idB = registeredB.data.user.id;
    assert.ok(/^[0-9a-f-]{36}$/.test(idA) && idA !== idB, "Invalid generated account identity");
    assert.deepEqual(Object.keys(registeredA.data.user), ["id"], "Registration leaked private fields");
    assert.equal((await a.request("/api/scenarios")).status, 401, "Registration must not auto-login");
    await csrf(anonymous);
    const rejectedCsrf = await data(await anonymous.request("/api/auth/callback/credentials",
      new URLSearchParams({ csrfToken: randomUUID(), email: emailA, password: passwordA, callbackUrl: origin }).toString(),
      { headers: { "content-type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" } }), 200);
    assert.equal(new URL(rejectedCsrf.url).searchParams.get("error"), "MissingCSRF", "Invalid CSRF was not rejected");
    assert.equal((await anonymous.request("/api/scenarios")).status, 401, "Invalid CSRF created a session");
    const wrong = await login(anonymous, emailA, passwordB);
    const missing = await login(anonymous, randomUUID() + "@example.test", passwordB);
    assert.ok(wrong === "CredentialsSignin" && missing === wrong, "Login failures must be indistinguishable");
    assert.equal(await login(a, emailA.toUpperCase(), passwordA), null, "A sign-in failed");
    assert.equal(await login(b, emailB, passwordB), null, "B sign-in failed");
    for (const [client, id] of [[a, idA], [b, idB]]) {
      const session = await data(await client.request("/api/auth/session"), 200);
      assert.deepEqual(session.user, { id }, "Session identity must be minimal");
      assert.deepEqual(Object.keys(session).sort(), ["expires", "user"], "Unexpected session fields");
    }
    const updated = await data(await a.request("/api/auth/session", { csrfToken: await csrf(a), data: { user: { id: idB }, trainingUserId: idB } }), 200);
    assert.deepEqual(updated.user, { id: idA }, "Client update replaced identity");
    const fake = await anonymous.request("/api/scenarios", undefined, { headers: { "x-owner-id": idA, authorization: "Bearer " + randomUUID(), cookie: "authjs.session-token=" + randomUUID() } });
    assert.equal(fake.status, 401, "Unsigned cookie/header bypass");
    await data(await a.request("/api/scenarios"), 200);
    const start = await data(await a.request("/api/scenarios/sms-phishing-demo/start", { startId: randomUUID(), expectedRevision: 0 }), 201);
    let session = start.data.session;
    await data(await a.request("/api/training/" + session.sessionId), 200);

    connection = await mariadb.createConnection({
      host: db.hostname === "[::1]" ? "::1" : db.hostname, port: Number(db.port || 3306),
      user: decodeURIComponent(db.username), password: decodeURIComponent(db.password), database: db.pathname.slice(1),
      allowPublicKeyRetrieval: false,
      ...(process.env.MYSQL_TEST_RSA_PUBLIC_KEY_PATH ? { cachingRsaPublicKey: process.env.MYSQL_TEST_RSA_PUBLIC_KEY_PATH } : {}),
    });
    const rows = await connection.query("SELECT ownerId FROM TrainingSession WHERE id = ?", [session.sessionId]);
    assert.ok(rows[0]?.ownerId === idA, "Persisted owner does not match account UUID");

    const requests = [
      ["", undefined], ["/message", { turnId: randomUUID(), expectedRevision: 0, text: "ขอตรวจสอบก่อน" }],
      ["/action", { actionId: randomUUID(), expectedRevision: 0, actionDefinitionId: "a01", payload: { choiceId: "o1" } }],
      ["/quit", { actionId: randomUUID(), expectedRevision: 0 }], ["/result", undefined],
    ];
    for (const [suffix, body] of requests) {
      const foreign = await data(await b.request("/api/training/" + session.sessionId + suffix, body), 404);
      const absent = await data(await b.request("/api/training/" + randomUUID() + suffix, body), 404);
      assert.deepEqual(foreign, absent, "Foreign/missing sessions differ");
      assert.equal(foreign.error.code, "SESSION_NOT_FOUND", "Isolation error changed");
    }
    session = (await data(await a.request("/api/training/" + session.sessionId + "/message", {
      turnId: randomUUID(), expectedRevision: session.revision, text: "ขอตรวจสอบแหล่งที่มาก่อน",
    }), 200)).data.session;
    const steps = [
      ["a01", { choiceId: "o1" }], ["a02", {}], ["a03", { selectedEvidenceIds: ["o1", "o2", "o3"] }],
      ["a04", {}], ["a05", { choiceId: "o1" }], ["a06", {}], ["a07", { choiceId: "o1" }],
      ["a08", { choiceId: "o1" }], ["a09", {}],
    ];
    for (const [actionDefinitionId, payload] of steps) {
      session = (await data(await a.request("/api/training/" + session.sessionId + "/action", {
        actionId: randomUUID(), expectedRevision: session.revision, actionDefinitionId, payload,
      }), 200)).data.session;
    }
    const result = (await data(await a.request("/api/training/" + session.sessionId + "/result"), 200)).data;
    assert.equal(result.outcome, "PASSED", "Safe path result failed");
    assert.ok(result.D === 100 && result.W === 100 && result.S === 100, "Safe score changed");
    await data(await b.request("/api/training/" + session.sessionId + "/result"), 404);

    const logout = new URLSearchParams({ csrfToken: await csrf(a), callbackUrl: origin }).toString();
    await data(await a.request("/api/auth/signout", logout,
      { headers: { "content-type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" } }), 200);
    assert.equal((await a.request("/api/scenarios")).status, 401, "Logout did not remove authenticated cookie");
    assert.equal(await login(a, emailA, passwordA), null, "Second login failed");
    assert.deepEqual((await data(await a.request("/api/auth/session"), 200)).user, { id: idA }, "ID changed across login");
    console.log("PASS live Auth.js: register, CSRF Credentials login, minimal session, stable ID, spoof rejection, five-endpoint owner isolation, persisted UUID, safe D/W/S path, logout -> 401.");
  } finally {
    await connection?.end();
    if (server.exitCode === null) server.kill();
    await exited;
  }
}
smoke().catch(error => {
  // Assertion messages are fixed labels only; never print actual/expected or raw DB errors.
  console.error(error?.name === "AssertionError" ? "FAIL live auth smoke: " + error.message.split("\n")[0] : "FAIL live auth smoke: environment/server operation failed (details suppressed).");
  process.exitCode = 1;
});
