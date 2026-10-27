import { afterEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { dedicatedPostgresTestUrl, directMigrationUrl } from "../scripts/postgres-config.mjs";
import { postgresPoolConfig } from "../src/persistence/prisma-client.js";
vi.mock("node:fs", () => ({ readFileSync: vi.fn((path: string) => {
  if (path === "trusted.pem") return "synthetic-ca";
  if (path === "empty.pem") return "";
  throw new Error("PRIVATE_PATH");
}) }));
afterEach(() => vi.restoreAllMocks());

describe("PostgreSQL migration and disposable-test guards", () => {
  it("requires DIRECT_URL instead of substituting runtime credentials", () => {
    expect(() => directMigrationUrl(undefined)).toThrow("DIRECT_URL is required");
    expect(() => directMigrationUrl("mysql://app:PRIVATE@localhost/database")).toThrow("PostgreSQL");
    expect(() => directMigrationUrl("postgres://invalid:invalid@127.0.0.1:1/invalid")).toThrow("placeholder");
  });
  it("accepts Prisma native CLI verified TLS and an explicitly local plaintext database", () => {
    const remote = "postgres://migration@db.example.test/postgres?sslmode=require&sslaccept=strict&sslcert=trusted.pem&schema=public&connect_timeout=10";
    expect(directMigrationUrl(remote)).toBe(remote);
    expect(directMigrationUrl("postgres://migration@127.0.0.1/mitjee_test")).toBe("postgres://migration@127.0.0.1/mitjee_test");
    expect(directMigrationUrl("postgres://migration@localhost/mitjee_test?sslmode=disable")).toContain("sslmode=disable");
  });
  it.each(["", "?sslmode=disable", "?sslmode=require", "?sslmode=require&sslaccept=accept_invalid_certs&sslcert=trusted.pem",
    "?sslmode=verify-full&sslrootcert=trusted.pem", "?sslmode=require&sslaccept=strict&sslcert=empty.pem",
    "?sslmode=require&sslaccept=strict&sslcert=missing.pem", "?sslmode=require&sslaccept=strict&sslcert=trusted.pem&sslmode=disable",
    "?sslmode=require&sslaccept=strict&sslcert=trusted.pem&host=localhost", "?schema=other", "?connect_timeout=0", "#private"])
    ("rejects unsafe, unsupported, repeated or unreadable migration configuration", suffix => {
      expect(() => directMigrationUrl("postgres://migration:PRIVATE@db.example.test/postgres" + suffix)).toThrow();
    });
  it.each(["postgres://app@db.example.test:6543/postgres", "postgres://app@db.example.test:6432/postgres", "postgres://app@region.pooler.supabase.com/postgres"])
    ("rejects pooler migrations", value => { expect(() => directMigrationUrl(value)).toThrow("pooler"); });
  it("rejects conflicting local plaintext TLS flags", () => {
    expect(() => directMigrationUrl("postgres://app@localhost/test?sslmode=disable&sslcert=trusted.pem")).toThrow("conflicting");
  });
  it("requires dedicated named test database and rejects runtime aliases", () => {
    const dedicated = "postgres://tester@localhost/mitjee_test_example";
    expect(dedicatedPostgresTestUrl(dedicated, "mysql://old@localhost/runtime")).toBe(dedicated);
    for (const raw of [undefined, "postgres://app@localhost/postgres", "postgres://app@localhost/production",
      dedicated + "?schema=isolated", "mysql://app@localhost/mitjee_test", dedicated + "#fragment"]) {
      expect(() => dedicatedPostgresTestUrl(raw, undefined)).toThrow();
    }
    expect(() => dedicatedPostgresTestUrl(dedicated, "postgres://runtime@remote-alias/mitjee_test_example")).toThrow("runtime");
    expect(() => dedicatedPostgresTestUrl(dedicated, "malformed")).toThrow("identity");
  });
  it("does not expose connection identity in rejected migration errors", () => {
    try { directMigrationUrl("postgres://app:PRIVATE@db.example.test/postgres"); } catch (error) {
      expect(String(error)).not.toMatch(/PRIVATE|db\.example\.test/);
    }
  });
  it("the installed adapter closes its internally owned lazy pg pool without opening a socket", async () => {
    const end = vi.spyOn(pg.Pool.prototype, "end");
    const factory = new PrismaPg(postgresPoolConfig("postgres://tester@localhost/mitjee_test"));
    const adapter = await factory.connect(); // Creates an empty lazy pool; no query/connect is issued.
    await adapter.dispose();
    expect(end).toHaveBeenCalledOnce();
  });
});
