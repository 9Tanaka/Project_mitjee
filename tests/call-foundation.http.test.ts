import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
const injected = vi.hoisted(() => ({ runtime: vi.fn() }));
vi.mock("../src/server/runtime.js", () => ({ getRuntime: injected.runtime }));
import { route } from "../src/http/handler.js";
import type { Endpoint } from "../src/http/handler.js";
import { createApplication } from "../src/application/composition.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";

beforeEach(() => vi.clearAllMocks());
async function harness() {
  const repository = new InMemoryTrainingRepository(), provider = new MockScenarioModelProvider();
  const app = await createApplication(repository, provider, () => 1000, undefined, () => "CC-02");
  const user = { id: randomUUID() };
  const s = (await app.start("call-center-scam", user, { startId: randomUUID(), expectedRevision: 0 })).session;
  injected.runtime.mockReturnValue({ authenticator: { authenticate: async () => user }, application: async () => app });
  const request = (endpoint: Endpoint, input?: unknown, origin = "http://localhost", id = s.sessionId) => route(endpoint)(new Request(`http://localhost/api/training/${id}/${endpoint}`, {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(input ?? {}),
  }), { params: Promise.resolve({ sessionId: id }) });
  return { repository, provider, app, user, s, request };
}
it("protected Answer returns connected/PENDING without invoking the provider; protected opening commits caller first", async () => {
  const h = await harness();
  const response = await h.request("action", { actionId: "answer", expectedRevision: 0, actionDefinitionId: h.s.availableActions[0]!.id, payload: {} });
  expect(response.status).toBe(200);
  const { data } = await response.json();
  expect(data.session.phone).toMatchObject({ state: "CALL_CONNECTED", openingStatus: "PENDING" });
  expect(data.session.messages).toEqual([]); expect(h.provider.callCount).toBe(0);
  const opening = await h.request("opening", { expectedRevision: data.session.revision });
  expect(opening.status).toBe(200);
  const ready = (await opening.json()).data;
  expect(ready.session.phone.openingStatus).toBe("READY");
  expect(ready.session.messages.map((m: { role: string }) => m.role)).toEqual(["character"]);
  expect(JSON.stringify(data)).not.toMatch(/CC-02|SCAM_CALL|NORMAL_CALL|storyId|templateVersion|call-center-bank/);
});
it("opening is protected by auth and origin checks before provider work", async () => {
  const h = await harness();
  expect((await h.request("opening", { expectedRevision: 0 }, "http://evil.test")).status).toBe(403);
  injected.runtime.mockReturnValue({ authenticator: { authenticate: async () => null } });
  expect((await h.request("opening", { expectedRevision: 0 })).status).toBe(401);
  expect(h.provider.callCount).toBe(0);
});
it("foreign ownership and missing session are indistinguishable for opening", async () => {
  const h = await harness(), foreign = (await h.app.start("call-center-scam", { id: "other" }, { startId: randomUUID(), expectedRevision: 0 })).session;
  const a = await h.request("opening", { expectedRevision: 0 }, "http://localhost", foreign.sessionId), b = await h.request("opening", { expectedRevision: 0 }, "http://localhost", "missing");
  expect(a.status).toBe(404); expect(await a.json()).toEqual(await b.json()); expect(h.provider.callCount).toBe(0);
});
it.each(["storyId", "variant", "model", "text", "turnId", "ownerId"])("opening rejects client-controlled %s before provider work", async field => {
  const h = await harness();
  expect((await h.request("opening", { expectedRevision: 0, [field]: "untrusted" })).status).toBe(400); expect(h.provider.callCount).toBe(0);
});
it("before-answer dialogue is rejected as state-invalid without any partial receipt", async () => {
  const h = await harness();
  expect((await h.request("message", { expectedRevision: 0, turnId: "early", text: "เริ่มเลย" })).status).toBe(422);
  const raw = await h.repository.get(h.s.sessionId, h.user.id);
  expect(raw.revision).toBe(0); expect(raw.messages).toEqual([]); expect(raw.dialogueTurns).toEqual([]);
});
