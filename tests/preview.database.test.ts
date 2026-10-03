import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), read: vi.fn() }));
vi.mock("node:fs", () => ({ readFileSync: mocks.read }));
vi.mock("../src/persistence/prisma-client.js", () => ({ createPrismaClient: mocks.create }));
import { createDatabase } from "../src/server/database.js";
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("DATABASE_URL", "mysql://db.example.test/mitjee");
  vi.stubEnv("DATABASE_TLS_CA", ""); vi.stubEnv("DATABASE_TLS_CA_PATH", "");
  vi.stubEnv("DATABASE_LOOPBACK_RSA_PUBLIC_KEY_PATH", "");
});
afterEach(() => vi.unstubAllEnvs());
it("inline PEM wins over path without reading disk or logging private config", () => {
  const log = vi.spyOn(console, "log"), error = vi.spyOn(console, "error");
  const pem = "-----BEGIN CERTIFICATE-----\nSYNTHETIC\n-----END CERTIFICATE-----";
  vi.stubEnv("DATABASE_TLS_CA", pem); vi.stubEnv("DATABASE_TLS_CA_PATH", "missing-private-file");
  createDatabase(); expect(mocks.create).toHaveBeenCalledWith("mysql://db.example.test/mitjee", { tlsCa: pem });
  expect(mocks.read).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
it("path is used when inline CA is empty", () => {
  vi.stubEnv("DATABASE_TLS_CA_PATH", "private-ca.pem"); mocks.read.mockReturnValue("test-ca");
  createDatabase(); expect(mocks.read).toHaveBeenCalledWith("private-ca.pem", "utf8");
  expect(mocks.create).toHaveBeenCalledWith("mysql://db.example.test/mitjee", { tlsCa: "test-ca" });
});
it("no CA preserves the adapter's fail-closed boundary and never invents insecure TLS options", () => {
  createDatabase(); expect(mocks.create).toHaveBeenCalledWith("mysql://db.example.test/mitjee", {});
});
