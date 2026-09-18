import { beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
const mock = vi.hoisted(() => ({ accounts: vi.fn() }));
vi.mock("../src/server/account-runtime.js", () => ({ getAccountService: mock.accounts }));
import { POST } from "../src/app/api/auth/register/route.js";
import { AccountService } from "../src/application/account-service.js";
import { freshPassword, MemoryAccounts, TestHasher } from "./accounts.helpers.js";

beforeEach(async () => {
  mock.accounts.mockReset().mockResolvedValue(await AccountService.create(new MemoryAccounts(), new TestHasher()));
});
const valid = () => ({ email: "user@example.test", password: freshPassword() });
function request(input: unknown, headers: Record<string, string> = {}, raw?: string, query = "") {
  return POST(new Request("http://localhost/api/auth/register" + query, {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw ?? JSON.stringify(input),
  }));
}
it("201 exposes only user.id and never auto-signs in", async () => {
  const input = valid(); const response = await request(input);
  expect(response.status).toBe(201); expect(response.headers.has("set-cookie")).toBe(false);
  const body = await response.json();
  expect(body).toEqual({ data: { user: { id: expect.stringMatching(/^[0-9a-f-]{36}$/) } } });
  expect(JSON.stringify(body).includes(input.password)).toBe(false);
  expect(JSON.stringify(body).includes("passwordHash")).toBe(false);
});
it("normalized duplicate returns deterministic 409", async () => {
  const input = valid(); await request(input);
  const response = await request({ ...input, email: " USER@EXAMPLE.test " });
  expect(response.status).toBe(409); expect((await response.json()).error.code).toBe("ACCOUNT_ALREADY_EXISTS");
});
it.each(["id", "userId", "ownerId", "passwordHash", "role", "createdAt", "verified", "provider", "extra"])("rejects client field %s before initialization", async key => {
  const response = await request({ ...valid(), [key]: randomUUID() });
  expect(response.status).toBe(400); expect(mock.accounts).not.toHaveBeenCalled();
});
it.each(["", "a".repeat(11), "a".repeat(73), "ก".repeat(25)])("invalid password case %# → 400", async password => {
  const response = await request({ ...valid(), password });
  expect(response.status).toBe(400); expect((await response.json()).error.code).toBe("INVALID_REQUEST");
});
it("malformed email/JSON/transport and unexpected query are rejected", async () => {
  for (const response of [
    await request({ ...valid(), email: "bad" }), await request({}, {}, "{"),
    await request(valid(), { "content-type": "text/plain" }), await request(valid(), { "content-encoding": "gzip" }),
    await request(valid(), {}, undefined, "?ownerId=spoof"),
  ]) expect(response.status).toBe(400);
  expect(mock.accounts).not.toHaveBeenCalled();
});
it.each([{}, { "content-length": "3000" }])("oversized body rejected before account work %#", async headers => {
  const response = await request({ email: "u@example.test", password: "a".repeat(3000) }, headers);
  expect(response.status).toBe(413); expect(mock.accounts).not.toHaveBeenCalled();
});
it("cross-origin registration is blocked", async () => {
  expect((await request(valid(), { origin: "https://untrusted.example" })).status).toBe(403);
});
it("database/hasher errors are fixed 500 without details", async () => {
  mock.accounts.mockRejectedValue(new Error("internal private data"));
  const response = await request(valid()); expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: { code: "INTERNAL_ERROR", message: "Unable to process the request." } });
});
