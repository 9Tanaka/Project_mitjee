import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
const injected = vi.hoisted(() => ({ runtime: vi.fn() }));
vi.mock("../src/server/runtime.js", () => ({ getRuntime: injected.runtime }));
import { POST as message } from "../src/app/api/training/[sessionId]/message/route.js";
import { createApplication } from "../src/application/composition.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { OpenAIScenarioModelProvider } from "../src/providers/openai-scenario-provider.js";
import { ScenarioProviderConfigurationError, createScenarioProvider } from "../src/server/scenario-provider.js";
import type { ScenarioModelProvider } from "../src/dialogue/contracts.js";
import { messageDto } from "../src/http/dto.js";
import { fakeClient, deferred, envelope } from "./openai.fixtures.js";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function harness(provider?: ScenarioModelProvider) {
  const client = fakeClient(), repository = new InMemoryTrainingRepository();
  const app = await createApplication(repository, provider ?? new OpenAIScenarioModelProvider(client, "test-model"));
  const principal = { id: "synthetic-owner" };
  const s = (await app.start("sms-phishing-demo", principal, { startId: randomUUID(), expectedRevision: 0 })).session;
  const application = vi.fn(async () => app);
  injected.runtime.mockReturnValue({ authenticator: { authenticate: async () => principal }, application });
  const send = (body: unknown) => message(new Request(`http://localhost/api/training/${s.sessionId}/message`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ sessionId: s.sessionId }) });
  const input = { turnId: "same-turn", expectedRevision: s.revision, text: "ขอตรวจสอบข้อความสมมติ" };
  return { client, repository, app, principal, s, application, send, input };
}
it("explicit server openai selection reaches Responses SDK via HTTP without altering public contract", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(envelope())); vi.stubGlobal("fetch", fetcher);
  const h = await harness(createScenarioProvider({ AI_PROVIDER: "openai", OPENAI_API_KEY: randomUUID(), OPENAI_MODEL: "test-model" }));
  const r = await h.send(h.input); expect(r.status).toBe(200); messageDto.parse((await r.json()).data);
  expect(fetcher).toHaveBeenCalledTimes(1); expect(String(fetcher.mock.calls[0]![0])).toBe("https://api.openai.com/v1/responses");
});
it("real adapter HTTP route returns strict public DTO; duplicate request avoids provider", async () => {
  const h = await harness();
  const first = await h.send(h.input); expect(first.status).toBe(200);
  const body = await first.json(); messageDto.parse(body.data);
  expect(JSON.stringify(body)).not.toMatch(/test-model|usage|resp_synthetic|candidate_event|confidence|OPENAI|instructions|allowedBehaviors/);
  const second = await h.send(h.input); expect(second.status).toBe(200);
  expect((await second.json()).data.duplicate).toBe(true);
  expect(h.client.create).toHaveBeenCalledTimes(1);
});
it.each(["provider", "model", "AI_PROVIDER", "OPENAI_MODEL"])("browser cannot choose %s", async field => {
  const h = await harness(); expect((await h.send({ ...h.input, [field]: "override" })).status).toBe(400);
  expect(h.client.create).not.toHaveBeenCalled();
});
it("provider failure returns committed fallback without raw SDK error", async () => {
  const h = await harness(); h.client.create.mockRejectedValue(new Error("RAW_SDK_PRIVATE_BODY"));
  const r = await h.send(h.input); expect(r.status).toBe(200);
  const body = await r.json(); messageDto.parse(body.data);
  expect(JSON.stringify(body)).not.toContain("RAW_SDK_PRIVATE_BODY"); expect(h.client.create).toHaveBeenCalledTimes(2);
});
it("configuration failure returns generic public 500", async () => {
  const h = await harness(); h.application.mockRejectedValue(new ScenarioProviderConfigurationError("OPENAI_API_KEY is required"));
  const r = await h.send(h.input); expect(r.status).toBe(500);
  expect(JSON.stringify(await r.json())).not.toMatch(/OPENAI|configuration|API_KEY/); expect(h.client.create).not.toHaveBeenCalled();
});
it("late response after concurrent HTTP/application action returns 409 with no partial turn", async () => {
  const h = await harness(); const gate = deferred<unknown>(), started = deferred<void>();
  h.client.create.mockImplementation(() => { started.resolve(); return gate.promise; });
  const pending = h.send(h.input); await started.promise;
  await h.app.action(h.s.sessionId, h.principal, {
    actionId: "explicit-first", expectedRevision: 0, actionDefinitionId: "a01", payload: { choiceId: "o1" },
  });
  const before = await h.repository.get(h.s.sessionId, h.principal.id); gate.resolve(envelope());
  expect((await pending).status).toBe(409);
  expect(await h.repository.get(h.s.sessionId, h.principal.id)).toEqual(before);
});
