import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
const injected = vi.hoisted(() => ({ runtime: vi.fn() }));
vi.mock("../src/server/runtime.js", () => ({ getRuntime: injected.runtime }));
import { route } from "../src/http/handler.js";
import type { Endpoint } from "../src/http/handler.js";
import { AuthJsRequestAuthenticator } from "../src/auth/request-authenticator.js";
import { createApplication } from "../src/application/composition.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { TrainingCore } from "../src/core.js";
import { ApplicationError } from "../src/application/errors.js";
import { publicError } from "../src/http/errors.js";

const userA = "d2f0ea70-0000-4000-8000-000000000001";
const userB = "d2f0ea70-0000-4000-8000-000000000002";
const verified = (id = userA) => ({ user: { id }, expires: new Date(60_000).toISOString() });
afterEach(() => vi.restoreAllMocks());
async function harness() {
  const repository = new InMemoryTrainingRepository();
  const app = await createApplication(repository, new MockScenarioModelProvider(), () => 1000);
  const resolver = vi.fn<() => Promise<unknown>>();
  const authenticator = new AuthJsRequestAuthenticator(resolver, () => 1000);
  const application = vi.fn(async () => app);
  injected.runtime.mockReturnValue({ authenticator, application, close: async () => {} });
  async function request(endpoint: Endpoint, session: unknown, id = "sms-phishing-demo", body?: unknown, headers: Record<string, string> = {}, query = "") {
    resolver.mockResolvedValue(session);
    const post = ["start", "message", "action", "quit"].includes(endpoint);
    const req = new Request(`http://localhost/api/test${query}`, { method: post ? "POST" : "GET", headers: { "content-type": "application/json", ...headers }, ...(post ? { body: JSON.stringify(body ?? {}) } : {}) });
    const params = ["scenario", "start"].includes(endpoint) ? { scenarioId: id } : { sessionId: id };
    return route(endpoint)(req, { params: Promise.resolve(params as Record<string, string>) });
  }
  return { repository, app, resolver, authenticator, application, request };
}
describe("verified Auth.js session boundary → application → Core", () => {
  it.each([
    null, undefined, {}, [], "invalid", { user: null }, { user: {}, expires: new Date(60_000).toISOString() },
    { user: { id: "learner@example.test" }, expires: new Date(60_000).toISOString() },
    { user: { id: "mutable-username" }, expires: new Date(60_000).toISOString() },
    { user: { id: userA } }, { ...verified(), expires: "invalid" }, { ...verified(), expires: new Date(1000).toISOString() },
  ])("missing/malformed/expired session %# returns 401 without initializing application/DB", async session => {
    const h = await harness(); const response = await h.request("scenarios", session);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: "Authentication required." } });
    expect(h.application).not.toHaveBeenCalled();
  });
  it("verified session yields only a detached stable principal", async () => {
    const h = await harness(); const session = { ...verified(), user: { id: userA, email: "fictional@example.test", name: "Fictional" }, access_token: randomUUID(), refresh_token: randomUUID() };
    h.resolver.mockResolvedValue(session);
    const principal = await h.authenticator.authenticate(new Request("http://localhost"));
    expect(principal).toEqual({ id: userA }); expect(principal).not.toBe(session.user);
  });
  it.each([
    { "x-owner-id": userA }, { "x-user-id": userA }, { authorization: `Bearer ${userA}` },
    { cookie: `authjs.session-token=${encodeURIComponent(JSON.stringify(verified()))}` },
    { cookie: `__Secure-authjs.session-token=${userA}; ownerId=${userA}` },
  ])("client headers/cookies %# have no authority without verified session", async headers => {
    const h = await harness(); const response = await h.request("scenarios", null, "", undefined, headers);
    expect(response.status).toBe(401); expect(h.application).not.toHaveBeenCalled();
  });
  it("body/query ownerId are rejected, not identity overrides", async () => {
    const h = await harness(); const input = { startId: randomUUID(), expectedRevision: 0 };
    expect((await h.request("start", verified(), "sms-phishing-demo", { ...input, ownerId: userB })).status).toBe(400);
    expect((await h.request("start", verified(), "sms-phishing-demo", input, {}, `?ownerId=${userB}`)).status).toBe(400);
    expect(h.application).not.toHaveBeenCalled();
  });
  it("spoofed headers do not override verified identity; tokens never enter Application/Core/public output", async () => {
    const h = await harness(); const access = randomUUID(), refresh = randomUUID();
    const session = { ...verified(), user: { id: userA, email: "fictional@example.test" }, access_token: access, refresh_token: refresh, sessionToken: randomUUID(), provider: "not-a-configured-provider" };
    const appStart = vi.spyOn(h.app, "start"); const coreStart = vi.spyOn(TrainingCore.prototype, "start");
    const response = await h.request("start", session, "sms-phishing-demo", { startId: randomUUID(), expectedRevision: 0 }, { "x-owner-id": userB, authorization: `Bearer ${refresh}`, cookie: `ownerId=${userB}` });
    expect(response.status).toBe(201); const body = await response.json();
    expect(appStart.mock.calls[0]![1]).toEqual({ id: userA }); expect(coreStart.mock.calls[0]![1]).toBe(userA);
    const stored = await h.repository.get(body.data.session.sessionId, userA);
    for (const value of [JSON.stringify(appStart.mock.calls), JSON.stringify(coreStart.mock.calls), JSON.stringify(stored), JSON.stringify(body)]) {
      for (const secret of [access, refresh, session.sessionToken, "fictional@example.test", session.provider]) expect(value).not.toContain(secret);
    }
    expect(JSON.stringify(body)).not.toContain(userA);
  });
  it.each(["resume", "message", "action", "quit", "result"] as const)("verified User A cannot %s User B session; foreign/missing are identical 404", async endpoint => {
    const h = await harness();
    const start = await h.request("start", verified(userB), "sms-phishing-demo", { startId: randomUUID(), expectedRevision: 0 });
    const id = (await start.json()).data.session.sessionId as string;
    const before = await h.repository.get(id, userB);
    const bodies = { resume: undefined, result: undefined, message: { turnId: "turn", expectedRevision: 0, text: "ทดสอบ" },
      action: { actionId: "act", expectedRevision: 0, actionDefinitionId: "a01", payload: { choiceId: "o1" } }, quit: { actionId: "quit", expectedRevision: 0 } };
    const foreign = await h.request(endpoint, verified(), id, bodies[endpoint]);
    const missing = await h.request(endpoint, verified(), "missing", bodies[endpoint]);
    expect(foreign.status).toBe(404); expect(missing.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json()); expect(await h.repository.get(id, userB)).toEqual(before);
  });
  it("Auth.js resolver errors fail closed without logging/leaking or initializing DB", async () => {
    const h = await harness(); const marker = randomUUID(); const log = vi.spyOn(console, "error");
    h.resolver.mockRejectedValueOnce(new Error(marker));
    const response = await route("scenarios")(new Request("http://localhost/api/scenarios"), { params: Promise.resolve({}) });
    expect(response.status).toBe(401); expect(await response.text()).not.toContain(marker);
    expect(h.application).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled();
  });
  it.each(["SCENARIO_NOT_FOUND", "RESULT_NOT_FOUND", "SESSION_EXPIRED", "INVALID_ACTION", "INVALID_REQUEST"] as const)("HTTP maps application-owned %s without exposing details", code => {
    const error = new ApplicationError(code); error.message = randomUUID();
    const mapped = publicError(error); expect(mapped.body.error.code).toBe(code);
    expect(mapped.status).toBe({ SCENARIO_NOT_FOUND: 404, RESULT_NOT_FOUND: 404, SESSION_EXPIRED: 410, INVALID_ACTION: 422, INVALID_REQUEST: 400 }[code]);
    expect(JSON.stringify(mapped)).not.toContain(error.message);
  });
});
