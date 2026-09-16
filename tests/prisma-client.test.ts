import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ adapter: vi.fn(), client: vi.fn() }));
vi.mock("@prisma/adapter-mariadb", () => ({ PrismaMariaDb: class { constructor(options: unknown) { mocks.adapter(options); } } }));
vi.mock("../src/generated/prisma/client.js", () => ({ PrismaClient: class { constructor(options: unknown) { mocks.client(options); } } }));
import { createPrismaClient } from "../src/persistence/prisma-client.js";

beforeEach(() => vi.clearAllMocks());
describe("persistence connection security configuration", () => {
  it.each(["127.0.0.1", "localhost", "[::1]"])("passes a pinned public key only on loopback %s", host => {
    createPrismaClient(`mysql://${host}/mitjee_test`, { loopbackRsaPublicKey: "/trusted/server-public.pem" });
    expect(mocks.adapter).toHaveBeenCalledWith(expect.objectContaining({
      host: host === "[::1]" ? "::1" : host,
      cachingRsaPublicKey: "/trusted/server-public.pem", allowPublicKeyRetrieval: false, connectionLimit: 8, timezone: "Z",
    }));
  });
  it("does not enable automatic key retrieval when the key is absent", () => {
    createPrismaClient("mysql://localhost/mitjee_test");
    expect(mocks.adapter.mock.calls[0]![0]).toMatchObject({ allowPublicKeyRetrieval: false });
    expect(mocks.adapter.mock.calls[0]![0]).not.toHaveProperty("cachingRsaPublicKey");
  });
  it("rejects a remote database without a trusted CA", () => {
    expect(() => createPrismaClient("mysql://db.example.test/mitjee_test")).toThrow("trusted TLS CA");
    expect(mocks.adapter).not.toHaveBeenCalled();
  });
  it("rejects loopback RSA configuration on remote hosts even when a CA is supplied", () => {
    expect(() => createPrismaClient("mysql://db.example.test/mitjee_test", {
      tlsCa: "test-ca", loopbackRsaPublicKey: "/trusted/server-public.pem",
    })).toThrow("restricted to loopback");
    expect(mocks.adapter).not.toHaveBeenCalled();
  });
  it("preserves remote certificate verification", () => {
    createPrismaClient("mysql://db.example.test/mitjee_test", { tlsCa: "test-ca" });
    expect(mocks.adapter).toHaveBeenCalledWith(expect.objectContaining({
      ssl: { ca: "test-ca", rejectUnauthorized: true }, allowPublicKeyRetrieval: false,
    }));
  });
  it.each(["?ssl=false", "#ignored"])("rejects hidden URL configuration %s", suffix => {
    expect(() => createPrismaClient(`mysql://localhost/mitjee_test${suffix}`)).toThrow("URL parameters");
    expect(mocks.adapter).not.toHaveBeenCalled();
  });
});
