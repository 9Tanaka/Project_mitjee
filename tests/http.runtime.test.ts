import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ disconnect: vi.fn(), create: vi.fn(), assemble: vi.fn() }));
vi.mock("../src/persistence/prisma-client.js", () => ({ createPrismaClient: mocks.create }));
vi.mock("../src/application/composition.js", () => ({ createApplication: mocks.assemble }));
import { getRuntime } from "../src/server/runtime.js";
import { createCallRuntime } from "../src/server/call-runtime.js";


beforeEach(() => {
  delete (globalThis as { mitjeeHttpRuntime?: unknown }).mitjeeHttpRuntime;
  delete (globalThis as { mitjeeDatabase?: unknown }).mitjeeDatabase;
  vi.clearAllMocks();
  mocks.disconnect.mockResolvedValue(undefined);
  mocks.create.mockReturnValue({ $disconnect: mocks.disconnect });
  mocks.assemble.mockResolvedValue({ marker: "application" });
  vi.stubEnv("AUTH_SECRET", "");
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("CALL_CENTER_DEMO_VARIANT", ""); vi.stubEnv("CALL_CENTER_DEMO_STORY", ""); vi.stubEnv("DATABASE_TLS_CA", "");
  vi.stubEnv("DATABASE_URL", "mysql://localhost/mitjee_test");
  vi.stubEnv("DATABASE_TLS_CA_PATH", ""); vi.stubEnv("DATABASE_LOOPBACK_RSA_PUBLIC_KEY_PATH", "");
});
afterEach(() => { vi.unstubAllEnvs(); delete (globalThis as { mitjeeHttpRuntime?: unknown }).mitjeeHttpRuntime;
  delete (globalThis as { mitjeeDatabase?: unknown }).mitjeeDatabase; });

it("default authenticator refuses client-provided identity and does not initialize the DB", async () => {
  const runtime = getRuntime();
  const request = new Request("http://localhost/api/scenarios", { headers: { "x-owner-id": "user-a", authorization: "Bearer test-only", cookie: "session=test-only" } });
  expect(await runtime.authenticator.authenticate(request)).toBeNull();
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
it.each(["", "invalid", "openai"])("invalid provider configuration (%s) fails before DB allocation", async provider => {
  vi.stubEnv("AI_PROVIDER", provider); vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("OPENAI_MODEL", "");
  await expect(getRuntime().application()).rejects.toThrow(/AI_PROVIDER|OPENAI_API_KEY/);
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.assemble).not.toHaveBeenCalled();
});
it("loopback RSA path remains an explicit composition-root option", async () => {
  vi.stubEnv("DATABASE_LOOPBACK_RSA_PUBLIC_KEY_PATH", "/trusted/local-public.pem");
  const runtime = getRuntime(); await runtime.application();
  expect(mocks.create).toHaveBeenCalledWith("mysql://localhost/mitjee_test", { loopbackRsaPublicKey: "/trusted/local-public.pem" });
  await runtime.close();
});
it("HTTP and custom-server composition use the same private demo variant selector", async () => {
  vi.stubEnv("CALL_CENTER_DEMO_VARIANT", "SCAM_CALL");
  const http = getRuntime(), call = createCallRuntime();
  await http.application(); await call.application();
  expect(mocks.assemble.mock.calls.every(args => ["CC-01", "CC-02"].includes(args[4]()))).toBe(true);
  await call.close(); await http.close();
});
it("custom-server runtime owns an isolated lazy pool while reusing its own concurrent initialization", async () => {
  const http = getRuntime(), call = createCallRuntime();
  expect(mocks.create).not.toHaveBeenCalled();
  await http.application();
  const [first, second] = await Promise.all([call.application(), call.application()]);
  expect(first).toBe(second); expect(mocks.create).toHaveBeenCalledTimes(2);
  await call.close(); await http.close(); expect(mocks.disconnect).toHaveBeenCalledTimes(2);
});
it("custom-server failed initialization closes its pool and can retry", async () => {
  mocks.assemble.mockRejectedValueOnce(new Error("call startup failed"));
  const call = createCallRuntime();
  await expect(call.application()).rejects.toThrow("call startup failed");
  expect(mocks.disconnect).toHaveBeenCalledOnce();
  await call.application(); expect(mocks.create).toHaveBeenCalledTimes(2);
  await call.close(); expect(mocks.disconnect).toHaveBeenCalledTimes(2);
});
