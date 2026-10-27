import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
const injected = vi.hoisted(() => ({ runtime: vi.fn(), voice: vi.fn() }));
vi.mock("../src/server/runtime.js", () => ({ getRuntime: injected.runtime }));
vi.mock("../src/server/voice-runtime.js", () => ({ getVoiceApplication: injected.voice }));
import { speechRoute } from "../src/http/speech-handler.js";
import { createApplication } from "../src/application/composition.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";
import { VoiceApplicationService } from "../src/application/voice-service.js";
import { pcmWav } from "./voice.helpers.js";
beforeEach(() => vi.clearAllMocks());
async function setup() {
  const repo = new InMemoryTrainingRepository(), provider = new MockScenarioModelProvider(), user = { id: randomUUID() };
  const app = await createApplication(repo, provider);
  let s = (await app.start("call-center", user, { startId: randomUUID(), expectedRevision: 0 })).session;
  s = (await app.action(s.sessionId, user, { actionId: randomUUID(), expectedRevision: s.revision,
    actionDefinitionId: s.availableActions.find(a => a.label === "รับสาย")!.id, payload: {} })).session;
  s = (await app.opening(s.sessionId, user, { expectedRevision: s.revision })).session;
  const tts = { synthesize: vi.fn().mockResolvedValue(pcmWav()) }, stt = { transcribe: vi.fn() };
  injected.runtime.mockReturnValue({ authenticator: { authenticate: async () => user }, application: async () => app });
  injected.voice.mockReturnValue(new VoiceApplicationService(app, stt, tts));
  const request = (body: unknown = { turnId: "caller-opening" }, origin = "http://localhost", id = s.sessionId) => speechRoute(new Request(`http://localhost/api/training/${id}/speech`,
    { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ sessionId: id }) });
  return { request, s, repo, user, tts, stt, provider };
}
it("HTTP caller opening replay is presentation-only and does not generate AI", async () => {
  const h = await setup(), before = await h.repo.get(h.s.sessionId, h.user.id), calls = h.provider.callCount;
  const first = await h.request(); expect(first.status).toBe(200); expect((await first.json()).data.audioStatus).toBe("READY");
  expect((await h.request()).status).toBe(200); expect(await h.repo.get(h.s.sessionId, h.user.id)).toEqual(before);
  expect(h.provider.callCount).toBe(calls); expect(h.stt.transcribe).not.toHaveBeenCalled();
});
it("TTS failure is a nonfatal unavailable presentation, while arbitrary text and foreign origin are rejected", async () => {
  const h = await setup(); h.tts.synthesize.mockRejectedValue(new Error("PRIVATE_PROVIDER_BODY"));
  expect((await (await h.request()).json()).data).toMatchObject({ audioStatus: "UNAVAILABLE", audioBase64: null });
  expect((await h.request({ turnId: "caller-opening", text: "untrusted" })).status).toBe(400);
  expect((await h.request(undefined, "http://foreign.test")).status).toBe(403);
  expect((await h.request({ turnId: "missing-turn" })).status).toBe(400);
  injected.runtime.mockReturnValue({ authenticator: { authenticate: async () => null } });
  expect((await h.request()).status).toBe(401);
});
it("foreign owned session remains indistinguishable from missing", async () => {
  const h = await setup();
  injected.runtime.mockReturnValue({ authenticator: { authenticate: async () => ({ id: "other" }) }, application: injected.runtime().application });
  const foreign = await h.request(), missing = await h.request(undefined, "http://localhost", "missing-session");
  expect(foreign.status).toBe(404); expect(await foreign.json()).toEqual(await missing.json());
  expect(h.tts.synthesize).not.toHaveBeenCalled();
});
