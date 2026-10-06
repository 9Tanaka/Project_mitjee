import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createApplication } from "../src/application/composition.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";
import { VoiceApplicationService } from "../src/application/voice-service.js";
import { pcmWav } from "./voice.helpers.js";
async function harness(story: "CC-01" | "CC-02" = "CC-02") {
  const repo = new InMemoryTrainingRepository(), provider = new MockScenarioModelProvider(), user = { id: randomUUID() };
  const app = await createApplication(repo, provider, Date.now, undefined, () => story);
  let session = (await app.start("call-center", user, { startId: randomUUID(), expectedRevision: 0 })).session;
  async function act(label: string) {
    session = (await app.action(session.sessionId, user, { actionId: randomUUID(), expectedRevision: session.revision,
      actionDefinitionId: session.availableActions.find(a => a.label === label)!.id, payload: {} })).session;
  }
  await act("รับสาย"); session = (await app.opening(session.sessionId, user, { expectedRevision: session.revision })).session;
  const stt = { transcribe: vi.fn().mockResolvedValue("รหัสคือ 482193") }, tts = { synthesize: vi.fn().mockResolvedValue(pcmWav()) };
  return { repo, provider, app, user, stt, tts, act, session: () => session, voice: new VoiceApplicationService(app, stt, tts) };
}
it("opening and state beat are eligible for TTS; replay never generates AI or mutates session", async () => {
  const h = await harness(), id = h.session().sessionId;
  const before = await h.repo.get(id, h.user.id), calls = h.provider.callCount;
  await h.voice.speak(id, h.user, "caller-opening"); await h.voice.speak(id, h.user, "caller-opening");
  expect(h.provider.callCount).toBe(calls); expect(await h.repo.get(id, h.user.id)).toEqual(before);
  await h.act("ดำเนินบทสนทนาต่อ");
  const s = h.session(); await h.app.opening(id, h.user, { expectedRevision: s.revision });
  const stateBefore = await h.repo.get(id, h.user.id);
  expect((await h.voice.speak(id, h.user, "caller-state-IDENTITY_CLAIM")).audioStatus).toBe("READY");
  expect(await h.repo.get(id, h.user.id)).toEqual(stateBefore);
  expect(h.tts.synthesize).toHaveBeenCalledTimes(3);
});
it("TTS failure preserves committed caller dialogue and retry uses the same stored text", async () => {
  const h = await harness(), id = h.session().sessionId, before = await h.repo.get(id, h.user.id);
  h.tts.synthesize.mockRejectedValueOnce(new Error("PRIVATE_SPEECH_ERROR"));
  expect((await h.voice.speak(id, h.user, "caller-opening")).audioStatus).toBe("UNAVAILABLE");
  expect((await h.voice.speak(id, h.user, "caller-opening")).audioStatus).toBe("READY");
  expect(await h.repo.get(id, h.user.id)).toEqual(before);
  expect(h.tts.synthesize.mock.calls[0]![0]).toBe(h.tts.synthesize.mock.calls[1]![0]);
  await expect(h.voice.speak(id, { id: "foreign" }, "caller-opening")).rejects.toThrow("SESSION_NOT_FOUND");
  await expect(h.voice.speak(id, h.user, "invented-text")).rejects.toThrow("INVALID_TURN_ID");
});
it("presentation speech shares bounded admission with voice; overlapping replay cannot fan out", async () => {
  const h = await harness(), id = h.session().sessionId;
  let release!: (audio: Uint8Array) => void;
  h.tts.synthesize.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const first = h.voice.speak(id, h.user, "caller-opening");
  await vi.waitFor(() => expect(h.tts.synthesize).toHaveBeenCalledOnce());
  await expect(h.voice.speak(id, h.user, "caller-opening")).rejects.toThrow("VOICE_BUSY");
  release(pcmWav()); await first;
  expect((await h.voice.speak(id, h.user, "caller-opening")).audioStatus).toBe("READY");
  const saturated = new VoiceApplicationService(h.app, h.stt, h.tts, new Set(Array.from({ length: 20 }, (_, i) => `pending-${i}`)));
  await expect(saturated.speak(id, h.user, "caller-opening")).rejects.toThrow("VOICE_BUSY");
});
it.each(["CC-01", "CC-02"] as const)("%s voice OTP/transfer agreement is sanitized free text and cannot score or fail", async story => {
  const h = await harness(story), s = h.session(), before = await h.repo.get(s.sessionId, h.user.id);
  h.stt.transcribe.mockResolvedValue(story === "CC-02" ? "รหัสคือ 482193" : "ตกลง ผมจะโอน");
  const input = { turnId: randomUUID(), expectedRevision: s.revision, audio: pcmWav(), mime: "audio/wav" };
  const reply = await h.voice.send(s.sessionId, h.user, input);
  const after = await h.repo.get(s.sessionId, h.user.id);
  expect(after.state).toBe(before.state); expect(after.status).toBe("ACTIVE"); expect(after.result).toBeNull();
  expect(after.events).toEqual(before.events); expect(after.opportunities).toEqual(before.opportunities);
  expect(JSON.stringify(after)).not.toContain("482193");
  expect((await h.voice.send(s.sessionId, h.user, input)).dialogue.duplicate).toBe(true);
  expect(h.stt.transcribe).toHaveBeenCalledOnce(); expect(reply.audioStatus).toBe("READY");
});
