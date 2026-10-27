import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ adapter: vi.fn(), client: vi.fn() }));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class { constructor(...options: unknown[]) { mocks.adapter(...options); } } }));
vi.mock("../src/generated/prisma/client.js", () => ({ PrismaClient: class { constructor(options: unknown) { mocks.client(options); } } }));
import { createPrismaClient, postgresPoolConfig, DATABASE_CONNECTION_TIMEOUT_MS, DATABASE_IDLE_TIMEOUT_MS, DATABASE_POOL_LIMIT } from "../src/persistence/prisma-client.js";

beforeEach(() => vi.clearAllMocks());
describe("PostgreSQL runtime connection security", () => {
  it("uses bounded pg-supported waits, UTC and verified remote TLS", () => {
    createPrismaClient("postgresql://app:secret@db.example.test/training", { tlsCa: "test-ca" });
    expect(mocks.adapter).toHaveBeenCalledWith(expect.objectContaining({
      host: "db.example.test", port: 5432, user: "app", password: "secret", database: "training",
      max: DATABASE_POOL_LIMIT, connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
      idleTimeoutMillis: DATABASE_IDLE_TIMEOUT_MS, options: "-c timezone=UTC",
      ssl: { ca: "test-ca", rejectUnauthorized: true },
    }), { schema: "public" });
    expect(mocks.client).toHaveBeenCalledOnce();
  });
  it.each(["127.0.0.1", "localhost", "[::1]"])("allows explicit local plaintext for %s", host => {
    expect(postgresPoolConfig(`postgres://app:secret@${host}/mitjee_test`)).toMatchObject({
      host: host === "[::1]" ? "::1" : host, ssl: false, max: 8,
    });
  });
  it("keeps verified TLS when a local CA is provided", () => {
    expect(postgresPoolConfig("postgres://app@localhost/mitjee_test", { tlsCa: "trusted" }).ssl)
      .toEqual({ ca: "trusted", rejectUnauthorized: true });
  });
  it("requires a trusted CA for every remote connection", () => {
    expect(() => createPrismaClient("postgres://app@db.example.test/training")).toThrow("trusted TLS CA");
    expect(mocks.adapter).not.toHaveBeenCalled();
  });
  it.each(["?sslmode=disable", "?sslmode=require", "?sslrootcert=other", "?options=-c%20search_path=other", "?schema=other", "#ignored"])
    ("rejects URL overrides %s", suffix => {
      expect(() => createPrismaClient("postgres://app@localhost/mitjee_test" + suffix)).toThrow("URL parameters");
      expect(mocks.adapter).not.toHaveBeenCalled();
    });
  it.each(["mysql://app@localhost/test", "invalid", "postgres://localhost/test", "postgres://app@localhost/", "postgres://app@localhost/bad%2Fname"])
    ("rejects malformed or incomplete connection identity", value => {
      expect(() => createPrismaClient(value)).toThrow();
      expect(mocks.adapter).not.toHaveBeenCalled();
    });
  it("rejects unknown runtime options and redacts configuration errors", () => {
    expect(() => postgresPoolConfig("postgres://app:PRIVATE@localhost/test", { ssl: false } as never)).toThrow("Unsupported");
    try { postgresPoolConfig("postgres://app:PRIVATE@remote.example/test"); } catch (error) {
      expect(String(error)).not.toContain("PRIVATE"); expect(String(error)).not.toContain("remote.example");
    }
  });
  it("decodes escaped credentials without forwarding a connection string", () => {
    const config = postgresPoolConfig("postgresql://app%40service:p%40ss%3Aword@localhost/mitjee_test");
    expect(config.user).toBe("app@service"); expect(config.password).toBe("p@ss:word");
    expect(config).not.toHaveProperty("connectionString");
  });
});
