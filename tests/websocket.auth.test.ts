import { describe, expect, it } from "vitest";
import { encode } from "next-auth/jwt";
import { SocketCookieAuthenticator } from "../src/auth/socket-authenticator.js";

const secret = "synthetic-auth-test-secret-not-a-live-credential";
const id = "11111111-1111-4111-8111-111111111111";
const cookieName = "authjs.session-token";
const token = (claims: Record<string, unknown> = { trainingUserId: id }, maxAge = 3600, name = cookieName) =>
  encode({ token: claims, secret, salt: name, maxAge });
const request = (cookie: string, extra: Record<string, string> = {}) => new Request("http://localhost/api/call/demo/socket", { headers: { cookie, ...extra } });

describe("WebSocket Auth.js cookie boundary", () => {
  it("accepts an actual Auth.js encrypted session cookie and chunked cookie", async () => {
    const value = await token(); const auth = new SocketCookieAuthenticator(secret, "http://localhost");
    expect(await auth.authenticate(request(`${cookieName}=${value}`))).toEqual({ id });
    expect(await auth.authenticate(request(`${cookieName}.0=${value.slice(0, 100)}; ${cookieName}.1=${value.slice(100)}`))).toEqual({ id });
  });
  it("requires the secure Auth.js cookie name for HTTPS", async () => {
    const name = "__Secure-authjs.session-token";
    const auth = new SocketCookieAuthenticator(secret, "https://localhost");
    expect(await auth.authenticate(request(`${name}=${await token({ trainingUserId: id }, 3600, name)}`))).toEqual({ id });
    expect(await auth.authenticate(request(`${cookieName}=${await token()}`))).toBeNull();
  });
  it("rejects expired, tampered, wrong-secret, and malformed encrypted tokens", async () => {
    const auth = new SocketCookieAuthenticator(secret, "http://localhost");
    const good = await token(); const index = Math.floor(good.length / 2);
    const bad = good.slice(0, index) + (good[index] === "a" ? "b" : "a") + good.slice(index + 1);
    for (const value of [await token({ trainingUserId: id }, -3600), bad, "invalid-token"]) {
      expect(await auth.authenticate(request(`${cookieName}=${value}`))).toBeNull();
    }
    expect(await new SocketCookieAuthenticator("wrong-secret", "http://localhost").authenticate(request(`${cookieName}=${good}`))).toBeNull();
  });
  it("rejects caller identity headers and bearer tokens even when the token itself is valid", async () => {
    const auth = new SocketCookieAuthenticator(secret, "http://localhost");
    expect(await auth.authenticate(request("", { authorization: `Bearer ${await token()}`, "x-user-id": id, "x-owner-id": id }))).toBeNull();
    expect(await new SocketCookieAuthenticator("", "http://localhost").authenticate(request(`${cookieName}=${await token()}`))).toBeNull();
  });
  it("requires a stable training account ID rather than provider subject or email", async () => {
    const auth = new SocketCookieAuthenticator(secret, "http://localhost");
    for (const claims of [{ sub: id }, { email: "synthetic@example.com" }, { trainingUserId: "synthetic@example.com" }, { trainingUserId: 123 }]) {
      expect(await auth.authenticate(request(`${cookieName}=${await token(claims)}`))).toBeNull();
    }
  });
});
