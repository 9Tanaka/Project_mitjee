import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
const injected = vi.hoisted(() => ({ runtime: vi.fn(), voice: vi.fn() }));
vi.mock("../src/server/runtime.js", () => ({ getRuntime: injected.runtime }));
vi.mock("../src/server/voice-runtime.js", () => ({ getVoiceApplication: injected.voice }));
import { POST } from "../src/app/api/training/[sessionId]/voice/route.js";
import { createApplication } from "../src/application/composition.js";
import { VoiceApplicationService } from "../src/application/voice-service.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";
import { encodePcmWav } from "../src/frontend/microphone.js";

beforeEach(() => vi.clearAllMocks());
async function harness(category = "call-center-scam") {
  const repository = new InMemoryTrainingRepository(), app = await createApplication(repository, new MockScenarioModelProvider(), Date.now, () => "NORMAL_CALL");
  const user = { id: randomUUID() }, session = (await app.start(category, user, { startId: randomUUID(), expectedRevision: 0 })).session;
  const stt = { transcribe: vi.fn().mockResolvedValue("ขอชี้แจงบริบทสมมติครับ") }, tts = { synthesize: vi.fn().mockRejectedValue(new Error("raw")) };
  injected.runtime.mockReturnValue({ authenticator: { authenticate: async () => user }, application: async () => app });
  injected.voice.mockReturnValue(new VoiceApplicationService(app, stt, tts));
  const input = { turnId: "voice-test", expectedRevision: 0, mime: "audio/wav", audioBase64: Buffer.from(encodePcmWav([new Float32Array(16000)], 16000)).toString("base64") };
  const request = (body: unknown = input, origin = "http://localhost", id = session.sessionId) => POST(new Request(`http://localhost/api/training/${id}/voice`, {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ sessionId: id }) });
  return { repository, app, user, session, stt, input, request };
}
it("HTTP fallback commits sanitized text and returns committed response when TTS fails", async () => {
  const h = await harness(), response = await h.request(); expect(response.status).toBe(200);
  const { data } = await response.json(); expect(data.audioStatus).toBe("UNAVAILABLE"); expect(data.dialogue.session.revision).toBe(1);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const stored = JSON.stringify(await h.repository.get(h.session.sessionId, h.user.id));
  expect(stored).not.toContain("audioBase64"); expect(stored).not.toContain(h.input.audioBase64);
  expect((await (await h.request()).json()).data.dialogue.duplicate).toBe(true); expect(h.stt.transcribe).toHaveBeenCalledOnce();
});
it("rejects unauthenticated and foreign-origin audio before STT", async () => {
  const h = await harness(); expect((await h.request(h.input, "http://evil.test")).status).toBe(403);
  injected.runtime.mockReturnValue({ authenticator: { authenticate: async () => null } });
  expect((await h.request()).status).toBe(401); expect(h.stt.transcribe).not.toHaveBeenCalled();
});
it.each(["ownerId", "variant", "score", "state", "model", "provider", "callType", "seed"])("rejects forbidden client field %s", async key => {
  const h = await harness(); expect((await h.request({ ...h.input, [key]: "untrusted" })).status).toBe(400); expect(h.stt.transcribe).not.toHaveBeenCalled();
});
it("foreign session is indistinguishable from missing session", async () => {
  const h = await harness(); const other = (await h.app.start("call-center-scam", { id: randomUUID() }, { startId: randomUUID(), expectedRevision: 0 })).session;
  const foreign = await h.request(h.input, "http://localhost", other.sessionId), missing = await h.request(h.input, "http://localhost", "missing");
  expect(foreign.status).toBe(404); expect(await foreign.json()).toEqual(await missing.json()); expect(h.stt.transcribe).not.toHaveBeenCalled();
});
it("non-call audio request is rejected", async () => { const h = await harness("sms-phishing-demo"); expect((await h.request()).status).toBe(422); expect(h.stt.transcribe).not.toHaveBeenCalled(); });
it("malformed audio and oversized payload never reach STT", async () => {
  const h = await harness(); expect((await h.request({ ...h.input, audioBase64: "A".repeat(100) })).status).toBe(400);
  expect((await h.request({ ...h.input, audioBase64: "A".repeat(1_300_100) })).status).toBe(413); expect(h.stt.transcribe).not.toHaveBeenCalled();
});
