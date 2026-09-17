import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ disconnect: vi.fn(), create: vi.fn(), assemble: vi.fn() }));
vi.mock("../src/persistence/prisma-client.js", () => ({ createPrismaClient: mocks.create }));
vi.mock("../src/application/composition.js", () => ({ createApplication: mocks.assemble }));
import { getRuntime } from "../src/application/runtime.js";
import { UnconfiguredAuthenticator } from "../src/http/auth.js";

beforeEach(() => {
  delete (globalThis as { mitjeeHttpRuntime?: unknown }).mitjeeHttpRuntime;
  vi.clearAllMocks();
  mocks.disconnect.mockResolvedValue(undefined);
  mocks.create.mockReturnValue({ $disconnect: mocks.disconnect });
  mocks.assemble.mockResolvedValue({ marker: "application" });
  vi.stubEnv("DATABASE_URL", "mysql://localhost/mitjee_test");
  vi.stubEnv("DATABASE_TLS_CA_PATH", ""); vi.stubEnv("DATABASE_LOOPBACK_RSA_PUBLIC_KEY_PATH", "");
});
afterEach(() => { vi.unstubAllEnvs(); delete (globalThis as { mitjeeHttpRuntime?: unknown }).mitjeeHttpRuntime; });

it("default authenticator refuses client-provided identity and does not initialize the DB", async () => {
  const runtime = getRuntime();
  const request = new Request("http://localhost/api/scenarios", { headers: { "x-owner-id": "user-a", authorization: "Bearer test-only", cookie: "session=test-only" } });
  expect(await runtime.authenticator.authenticate(request)).toBeNull();
  expect(await new UnconfiguredAuthenticator().authenticate(request)).toBeNull();
  expect(mocks.create).not.toHaveBeenCalled();
});
it("composition root reuses one initialization/pool across concurrent requests", async () => {
  const runtime = getRuntime(); expect(getRuntime()).toBe(runtime);
  const apps = await Promise.all([runtime.application(), runtime.application()]);
  expect(apps[0]).toBe(apps[1]); expect(mocks.create).toHaveBeenCalledTimes(1); expect(mocks.assemble).toHaveBeenCalledTimes(1);
  await runtime.close(); expect(mocks.disconnect).toHaveBeenCalledTimes(1);
});
it("failed initialization disposes its pool and permits a later retry", async () => {
  mocks.assemble.mockRejectedValueOnce(new Error("startup failed"));
  const runtime = getRuntime(); await expect(runtime.application()).rejects.toThrow("startup failed");
  expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  await runtime.application(); expect(mocks.create).toHaveBeenCalledTimes(2); await runtime.close();
});
it("missing DB configuration does not allocate a pool", async () => {
  vi.stubEnv("DATABASE_URL", "");
  await expect(getRuntime().application()).rejects.toThrow("Database configuration is required");
  expect(mocks.create).not.toHaveBeenCalled();
});
it("loopback RSA path remains an explicit composition-root option", async () => {
  vi.stubEnv("DATABASE_LOOPBACK_RSA_PUBLIC_KEY_PATH", "/trusted/local-public.pem");
  const runtime = getRuntime(); await runtime.application();
  expect(mocks.create).toHaveBeenCalledWith("mysql://localhost/mitjee_test", { loopbackRsaPublicKey: "/trusted/local-public.pem" });
  await runtime.close();
});
