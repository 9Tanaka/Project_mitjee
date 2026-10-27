import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrainingCore } from "../src/core.js";
import { createApplication } from "../src/application/composition.js";
import { VoiceApplicationService } from "../src/application/voice-service.js";
import { MockScenarioModelProvider, normalMockResponse } from "../src/dialogue/mock-provider.js";
import type { TrainingRepository } from "../src/domain/training-repository.js";
import { IDLE_TIMEOUT_MS } from "../src/domain/constants.js";
import { pcmWav } from "./voice.helpers.js";

type Factory = (options?: { beforeCommit?: () => void }) => TrainingRepository;
export function preflightContract(label: string, make: Factory) {
  describe(label, () => {
    afterEach(() => vi.restoreAllMocks());
    async function harness(options?: Parameters<Factory>[0]) {
      let time = Date.now(); const now = () => time, repo = make(options), provider = new MockScenarioModelProvider();
      const app = await createApplication(repo, provider, now);
      const core = await TrainingCore.create([], repo, now), owner = { id: randomUUID() }, id = randomUUID();
      await core.start(id, owner.id, "call-center-scam", 2, "SCAM_CALL");
      const session = await app.resume(id, owner);
      const stt = { transcribe: vi.fn(async () => "ขอตรวจสอบก่อน") }, tts = { synthesize: vi.fn(async () => pcmWav()) };
      const voice = new VoiceApplicationService(app, stt, tts);
      const input = { turnId: randomUUID(), expectedRevision: session.revision, text: "ขอตรวจสอบก่อน" };
      return { repo, provider, app, voice, stt, tts, owner, id, input,
        advance: () => { time += IDLE_TIMEOUT_MS; },
        say: () => app.message(id, owner, input),
        speak: () => voice.send(id, owner, { ...input, audio: pcmWav(), mime: "audio/wav" }) };
    }
    it.each(["text", "voice"])("%s shares one pre-provider read while retaining fresh commit and projection reads", async mode => {
      const h = await harness(), before = await h.repo.get(h.id, h.owner.id), get = vi.spyOn(h.repo, "get"), save = vi.spyOn(h.repo, "save");
      await (mode === "text" ? h.say() : h.speak());
      expect(get).toHaveBeenCalledTimes(mode === "text" ? 3 : 4); expect(save).toHaveBeenCalledOnce();
      expect(get.mock.calls.every(([id, owner]) => id === h.id && owner === h.owner.id)).toBe(true);
      const after = await h.repo.get(h.id, h.owner.id);
      expect(after.revision).toBe(before.revision + 1); expect(after.events).toEqual(before.events);
      expect(after.state).toBe(before.state); expect(after.result).toBeNull();
      expect(after.dialogueTurns.at(-1)).toMatchObject({ attempts: 1, usedFallback: false, failureReason: null });
    });
    it("rejects a different owner before provider work or writes", async () => {
      const h = await harness(), before = await h.repo.get(h.id, h.owner.id);
      await expect(h.app.message(h.id, { id: randomUUID() }, h.input)).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
      expect(h.provider.callCount).toBe(0); expect(await h.repo.get(h.id, h.owner.id)).toEqual(before);
    });
    it("preserves application expiry errors before invalid message parsing and prevents expired replay", async () => {
      const h = await harness(); await h.say(); const calls = h.provider.callCount; h.advance();
      await expect(h.app.message(h.id, h.owner, { ...h.input, text: "" })).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
      await expect(h.say()).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
      expect(h.provider.callCount).toBe(calls); expect((await h.repo.get(h.id, h.owner.id)).status).toBe("EXPIRED");
    });
    it("rechecks expiry after a provider wait and commits no late dialogue", async () => {
      const h = await harness(); let release!: () => void, ready!: () => void;
      const entered = new Promise<void>(r => { ready = r; }), gate = new Promise<void>(r => { release = r; });
      vi.spyOn(h.provider, "generateCharacterResponse").mockImplementationOnce(async context => { ready(); await gate; return normalMockResponse(context); });
      const rejected = expect(h.say()).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
      await entered; h.advance(); release(); await rejected;
      const after = await h.repo.get(h.id, h.owner.id);
      expect(after.status).toBe("EXPIRED"); expect(after.actions).toEqual([]); expect(after.messages).toEqual([]); expect(after.result).toBeNull();
    });
    it("does not reuse the pre-STT snapshot when another text turn wins", async () => {
      const h = await harness(); let release!: (s: string) => void, ready!: () => void;
      const entered = new Promise<void>(r => { ready = r; });
      h.stt.transcribe.mockImplementationOnce(() => { ready(); return new Promise<string>(r => { release = r; }); });
      const rejected = expect(h.speak()).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
      await entered; await h.app.message(h.id, h.owner, { ...h.input, turnId: randomUUID() });
      release("ขอตรวจสอบก่อน"); await rejected;
      expect(h.provider.callCount).toBe(1); expect(h.tts.synthesize).not.toHaveBeenCalled();
      expect((await h.repo.get(h.id, h.owner.id)).dialogueTurns).toHaveLength(1);
    });
    it("rechecks revision after a model wait and rejects stale work without partial writes", async () => {
      const h = await harness(); let release!: () => void, ready!: () => void;
      const entered = new Promise<void>(r => { ready = r; }), gate = new Promise<void>(r => { release = r; });
      vi.spyOn(h.provider, "generateCharacterResponse").mockImplementationOnce(async context => { ready(); await gate; return normalMockResponse(context); });
      const rejected = expect(h.say()).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
      await entered; await h.app.message(h.id, h.owner, { ...h.input, turnId: randomUUID() });
      const winner = await h.repo.get(h.id, h.owner.id); release(); await rejected;
      expect(await h.repo.get(h.id, h.owner.id)).toEqual(winner); expect(winner.dialogueTurns).toHaveLength(1);
    });
    it("replays an identical turn without scoring/writes and rejects a conflicting fingerprint", async () => {
      const h = await harness(); await h.say(); const before = await h.repo.get(h.id, h.owner.id), calls = h.provider.callCount;
      const save = vi.spyOn(h.repo, "save"); expect((await h.say()).duplicate).toBe(true);
      await expect(h.app.message(h.id, h.owner, { ...h.input, text: "ข้อความต่างจากเดิม" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      expect(save).not.toHaveBeenCalled(); expect(h.provider.callCount).toBe(calls); expect(await h.repo.get(h.id, h.owner.id)).toEqual(before);
    });
    it("rolls back header, action, receipt and messages when pre-commit failure is injected", async () => {
      let armed = false; const failure = new Error("INJECTED_PREFLIGHT_CONTRACT_FAILURE");
      const h = await harness({ beforeCommit() { if (armed) throw failure; } }), before = await h.repo.get(h.id, h.owner.id);
      armed = true; await expect(h.say()).rejects.toBe(failure);
      expect(await h.repo.get(h.id, h.owner.id)).toEqual(before);
    });
  });
}
