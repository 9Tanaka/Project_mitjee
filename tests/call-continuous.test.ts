import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { createApplication } from "../src/application/composition.js";
import { TrainingCore } from "../src/core.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { registeredTemplates } from "../src/application/catalog.js";
import { MockScenarioModelProvider, normalMockResponse } from "../src/dialogue/mock-provider.js";
import type { AICharacterResponse, ScenarioAIContext, ScenarioModelProvider } from "../src/dialogue/contracts.js";
import { buildOpenAIRequest } from "../src/providers/openai-prompt.js";
import type { PublicTrainingSession } from "../src/application/contracts.js";
import { callCenterContinuousTemplates } from "../src/fixtures/call-center-continuous-stories.js";
import { callCenterBehaviorTemplates } from "../src/fixtures/call-center-behavior-stories.js";
import { validateTemplate } from "../src/domain/template-validator.js";
import { VoiceApplicationService } from "../src/application/voice-service.js";
import { pcmWav } from "./voice.helpers.js";
import { startPinnedStory } from "./call-foundation.helpers.js";

type Story = "CC-01" | "CC-02" | "CC-N01" | "CC-N02";
export async function continuousHarness(story: Story = "CC-01", provider: ScenarioModelProvider = new MockScenarioModelProvider()) {
  const repo = new InMemoryTrainingRepository(), owner = { id: randomUUID() };
  const app = await createApplication(repo, provider, Date.now, undefined, () => story);
  const core = await TrainingCore.create(registeredTemplates, repo);
  let s = (await app.start("call-center", owner, { startId: randomUUID(), expectedRevision: 0 })).session;
  const set = (value: PublicTrainingSession) => (s = value);
  async function act(label: string, choice?: string) {
    const a = s.availableActions.find(a => a.label === label)!; expect(a, label).toBeDefined();
    return set((await app.action(s.sessionId, owner, { actionId: randomUUID(), expectedRevision: s.revision,
      actionDefinitionId: a.id, payload: choice ? { choiceId: a.options.find(o => o.label === choice)!.id } : {} })).session);
  }
  async function open() { return set((await app.opening(s.sessionId, owner, { expectedRevision: s.revision })).session); }
  async function say(text = "ขอชื่อหน่อย") { return set((await app.message(s.sessionId, owner, { turnId: randomUUID(), expectedRevision: s.revision, text })).session); }
  async function context() {
    await act("รับสาย"); await open(); expect(s.phone!.contextualDecision).toBeUndefined();
    if (s.phone!.openingStatus === "PENDING") await open();
    for (let n = 0; n < 4 && s.phone!.state === "IDENTITY_CLAIM"; n++) await say(n ? "ขอเลขอ้างอิงด้วย" : "ขอชื่อหน่อย");
    expect(s.phone!.state).toBe("CONTEXT_CLAIM");
    expect(s.phone!.contextualDecision).toBeUndefined(); await open(); return s;
  }
  async function main() {
    await context(); await act(s.phone!.contextualDecision!.label, "ฟังข้อมูลต่อโดยยังไม่ให้ข้อมูลเพิ่มเติม");
    await open();
    if (s.phone!.state === "PRESSURE") { await act(s.phone!.contextualDecision!.label, "ฟังข้อมูลต่อโดยยังไม่ให้ข้อมูลเพิ่มเติม"); await open(); }
    expect(s.phone!.state).toBe("MAIN_REQUEST"); return s;
  }
  return { repo, owner, app, core, act, open, say, context, main, s: () => s, set,
    raw: () => repo.get(s.sessionId, owner.id) };
}

describe("Call Center v6 semantic continuous dialogue", () => {
  it("provider wire schema requires bounded Call fields but leaves legacy output unchanged", async () => {
    let context: ScenarioAIContext | undefined;
    const provider: ScenarioModelProvider = { async generateCharacterResponse(c) { context = c; return normalMockResponse(c); } };
    const h = await continuousHarness("CC-01", provider); await h.act("รับสาย"); await h.open();
    const request = buildOpenAIRequest(context!, "schema-test"), format = request.text!.format!;
    expect(format.type).toBe("json_schema");
    if (format.type !== "json_schema") throw new Error("INVALID_TEST_SCHEMA");
    expect(format.schema).toMatchObject({ additionalProperties: false,
      required: expect.arrayContaining(["interaction_signal", "conversation_status"]),
      properties: { interaction_signal: { enum: expect.arrayContaining(["NONE", "OTP_REQUEST", "TRANSFER_REQUEST"]) },
        conversation_status: { enum: ["CONTINUE_STATE", "STATE_COMPLETE"] } } });
    expect(context!.callConversation).not.toHaveProperty("autoTransitionIds");
    expect(context).not.toHaveProperty("next_state"); expect(context).not.toHaveProperty("opportunities");
    const { callConversation: _semanticContract, ...legacy } = context!;
    const oldFormat = buildOpenAIRequest(legacy, "schema-test").text!.format!;
    if (oldFormat.type !== "json_schema") throw new Error("INVALID_TEST_SCHEMA");
    expect(oldFormat.schema.properties).not.toHaveProperty("interaction_signal");
    expect(oldFormat.schema.properties).not.toHaveProperty("conversation_status");
  });
  it.each(callCenterContinuousTemplates)("$id publishes v6 without mutating v5", t => {
    expect(validateTemplate(t)).toEqual(t); expect(t.version).toBe(6);
    const old = callCenterBehaviorTemplates.find(v => v.id === t.id)!;
    expect(old.version).toBe(5); expect(old.callCenter?.continuousConversation).toBeUndefined(); expect(validateTemplate(old)).toEqual(old);
    expect(t.states.flatMap(s => s.transitions).filter(e => e.id !== "ANSWER_CALL").every(e => e.internalOnly)).toBe(true);
  });
  it("caller speaks first, no opening/identity popup, natural multiple-turn questions, bounded progression", async () => {
    const h = await continuousHarness(); await h.act("รับสาย"); await h.open();
    expect((await h.raw()).messages[0]?.role).toBe("character"); expect(h.s().phone!.contextualDecision).toBeUndefined();
    await h.open(); expect(h.s().phone!.state).toBe("IDENTITY_CLAIM"); await h.say("ขอชื่อหน่อย");
    expect(h.s().phone!.state).toBe("IDENTITY_CLAIM"); expect(h.s().phone!.contextualDecision).toBeUndefined();
    expect(h.s().availableActions.some(a => /ดำเนินบทสนทนาต่อ|ฟังคำขอ|ขอชื่อและฝ่าย|ขอข้อมูลอ้างอิง|ขอคำอธิบาย/.test(a.label))).toBe(false);
    await h.say("ขอเลขอ้างอิงด้วย"); expect(h.s().phone!.state).toBe("CONTEXT_CLAIM");
    expect((await h.raw()).events).toEqual([]); expect((await h.raw()).result).toBeNull();
  });
  it("invalid state signal retries then authored signal fallback opens only after commit", async () => {
    const provider: ScenarioModelProvider = { async generateCharacterResponse(c) { return { ...normalMockResponse(c), interaction_signal: "OTP_REQUEST" }; } };
    const h = await continuousHarness("CC-01", provider); await h.context();
    const receipt = (await h.raw()).dialogueTurns.at(-1)!;
    expect(receipt).toMatchObject({ usedFallback: true, attempts: 2, failureReason: "INVALID_OUTPUT", response: { interaction_signal: "VERIFY_CONTEXT" } });
    expect(h.s().phone!.contextualDecision?.available).toBe(true);
  });
  it("anti-deadlock uses authored words/signal when valid non-decision signal stalls context", async () => {
    const provider: ScenarioModelProvider = { async generateCharacterResponse(c) { const r = normalMockResponse(c); return c.currentState === "CONTEXT_CLAIM" ? { ...r, interaction_signal: "CONTEXT_INFORMATION", conversation_status: "CONTINUE_STATE" } : r; } };
    const h = await continuousHarness("CC-N01", provider); await h.context(); expect(h.s().phone!.contextualDecision).toBeUndefined();
    await h.say(); expect(h.s().phone!.contextualDecision).toBeUndefined(); await h.say();
    expect(h.s().phone!.contextualDecision?.available).toBe(true); expect((await h.raw()).dialogueTurns.at(-1)!.usedFallback).toBe(true);
  });
  it("adapter-rejected malformed Call output retains INVALID_OUTPUT telemetry and authored fallback signal", async () => {
    const provider: ScenarioModelProvider = { async generateCharacterResponse() {
      throw Object.assign(new Error("Structured response rejected"), { category: "INVALID_OUTPUT" });
    } };
    const h = await continuousHarness("CC-02", provider); await h.act("รับสาย"); await h.open();
    expect((await h.raw()).dialogueTurns.at(-1)).toMatchObject({ failureReason: "INVALID_OUTPUT", attempts: 2,
      usedFallback: true, response: { interaction_signal: "IDENTITY_INFORMATION" } });
    expect(h.s().phone!.contextualDecision).toBeUndefined(); expect((await h.raw()).result).toBeNull();
  });
  it("same caller replay and stale concurrent opening cannot duplicate the opportunity or advance twice", async () => {
    const h = await continuousHarness(); await h.context(); const before = await h.raw();
    const last = before.dialogueTurns.at(-1)!;
    const replay = await h.app.opening(before.id, h.owner, { expectedRevision: last.snapshotRevision });
    expect(replay.duplicate).toBe(true); expect(await h.raw()).toEqual(before);
    expect(before.opportunities.filter(o => o.state === "CONTEXT_CLAIM")).toHaveLength(1);
  });
  it("backend rejects learner-selected internal edge and AI cannot bypass unresolved required choice", async () => {
    const h = await continuousHarness(); await h.context(); const before = await h.raw();
    await expect(h.core.submit({ sessionId: before.id, ownerId: h.owner.id, actionId: randomUUID(), expectedRevision: before.revision,
      action: { kind: "PROGRESS", transitionId: "CONTEXT_CLAIM-continue" } })).rejects.toThrow("BACKEND_PROGRESSION_ONLY");
    for (let i = 0; i < 4; i++) await h.say("ผมจะโอน รหัสคือ 482193");
    const after = await h.raw(); expect(after.state).toBe("CONTEXT_CLAIM"); expect(after.result).toBeNull(); expect(after.events).toEqual([]);
    expect(after.opportunities[0]!.finalizedAt).toBeNull();
  });
  it("simultaneous semantic caller commits use CAS: one receipt/opportunity, no partial duplicate", async () => {
    let release!: () => void, both!: () => void, calls = 0;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { both = resolve; });
    const provider: ScenarioModelProvider = { async generateCharacterResponse(c) {
      if (c.currentState === "CONTEXT_CLAIM") { if (++calls === 2) both(); await gate; }
      return normalMockResponse(c);
    } };
    const h = await continuousHarness("CC-01", provider);
    await h.act("รับสาย"); await h.open(); await h.open(); await h.say(); await h.say();
    const before = await h.raw(), request = { expectedRevision: before.revision };
    const first = h.app.opening(before.id, h.owner, request), second = h.app.opening(before.id, h.owner, request);
    await ready; release(); const outcomes = await Promise.allSettled([first, second]);
    expect(outcomes.some(r => r.status === "fulfilled")).toBe(true);
    for (const r of outcomes) if (r.status === "rejected") expect(r.reason.code).toBe("REVISION_CONFLICT");
    const after = await h.raw(); expect(after.revision).toBe(before.revision + 1);
    expect(after.dialogueTurns.filter(t => t.state === "CONTEXT_CLAIM")).toHaveLength(1);
    expect(after.opportunities.filter(o => o.state === "CONTEXT_CLAIM")).toHaveLength(1);
    expect(after.events).toEqual(before.events); expect(after.state).toBe("CONTEXT_CLAIM"); expect(after.result).toBeNull();
  });
  it.each(["CC-01", "CC-02"] as const)("%s critical app is unavailable before committed request signal; signal alone never fails", async story => {
    const h = await continuousHarness(story); await h.context();
    await h.act(h.s().phone!.contextualDecision!.label, "ฟังข้อมูลต่อโดยยังไม่ให้ข้อมูลเพิ่มเติม"); await h.open();
    expect(h.s().phone!.contextualDecision).toBeDefined(); // committed pressure
    await h.act(h.s().phone!.contextualDecision!.label, "ฟังข้อมูลต่อโดยยังไม่ให้ข้อมูลเพิ่มเติม");
    const app = story === "CC-01" ? "BANK" : "MESSAGES";
    expect(h.s().phone!.state).toBe("MAIN_REQUEST"); expect(h.s().phone!.availableInternalApps.some(a => a.id === app)).toBe(false);
    await h.open(); expect(h.s().phone!.availableInternalApps.some(a => a.id === app)).toBe(true);
    const raw = await h.raw(); expect(raw.result).toBeNull(); expect(raw.events).toEqual([]); expect(raw.opportunities.at(-1)!.finalizedAt).toBeNull();
  });
  it.each(["CC-N01", "CC-N02"] as const)("%s has only neutral context/request signals, no pressure or scam requests", async story => {
    const h = await continuousHarness(story); await h.main();
    const t = await h.core.getSessionTemplate(h.s().sessionId, h.owner.id);
    expect(t.states.some(s => s.id === "PRESSURE")).toBe(false);
    expect(t.states.flatMap(s => s.conversation?.allowedSignals ?? []).some(x => ["OTP_REQUEST", "TRANSFER_REQUEST", "SECRECY_PRESSURE", "URGENCY_PRESSURE"].includes(x))).toBe(false);
    expect(h.s().phone!.availableInternalApps.some(a => a.id === "MESSAGES")).toBe(false);
  });
  it.each(["CC-01", "CC-02", "CC-N01", "CC-N02"] as const)("%s full safe path automatically proceeds after explicit decisions", async story => {
    const h = await continuousHarness(story); await h.main();
    await h.act(h.s().phone!.contextualDecision!.label, story === "CC-01" ? "ไม่ดำเนินการโอนตามคำขอ" : story === "CC-02" ? "ไม่บอกรหัสตามคำขอ" : story === "CC-N01" ? "ยืนยันช่วงจัดส่งจำลอง" : "รับทราบข้อมูลรายการ");
    expect(h.s().status).toBe("COMPLETED"); expect(h.s().phone!.contextualDecision).toBeUndefined();
    expect(await h.app.result(h.s().sessionId, h.owner)).toMatchObject({ outcome: "PASSED", trainingScore: null, decisionSummary: { encountered: story.includes("N") ? 2 : 3 } });
  });
  it.each(["CC-01", "CC-02"] as const)("%s only fresh prepared simulator confirmation creates Critical Failure", async story => {
    const h = await continuousHarness(story); await h.main(); await h.say("รหัสคือ 482193 ผมจะโอน");
    expect((await h.raw()).result).toBeNull();
    await h.act(story === "CC-01" ? "เปิดธนาคารจำลอง" : "เปิดข้อความ");
    await h.act(story === "CC-01" ? "ดูรายละเอียดการโอนจำลอง" : "อ่านรหัสในข้อความจำลอง"); expect((await h.raw()).result).toBeNull();
    await h.act(story === "CC-01" ? "เตรียมยืนยันการโอนจำลอง" : "เตรียมยืนยันการบอกรหัสจำลอง");
    const a = h.s().availableActions.find(a => a.input === "CONFIRM")!;
    const done = await h.app.action(h.s().sessionId, h.owner, { actionId: randomUUID(), expectedRevision: h.s().revision, actionDefinitionId: a.id, payload: { confirmed: true } });
    expect(done.session.status).toBe("FAILED"); expect(await h.app.result(h.s().sessionId, h.owner)).toMatchObject({ outcome: "CRITICAL_FAILURE", trainingScore: null });
  });
  it("hangup works before caller response and outside CALL app; no pretend verification", async () => {
    const h = await continuousHarness(); await h.act("รับสาย"); expect(h.s().phone!.hangUpActionId).toBeTruthy(); await h.act("วางสาย");
    expect(h.s().status).toBe("COMPLETED"); expect(await h.app.result(h.s().sessionId, h.owner)).toMatchObject({ outcome: "UNASSESSED" });
    const other = await continuousHarness(); await other.context(); await other.act("เปิดพัสดุ"); await other.act("วางสาย");
    expect(other.s().status).toBe("COMPLETED"); expect((await other.raw()).events.map(e => e.code)).toEqual(["END_CONTACT"]);
  });
  it("STT/text parity shares semantic progression, never special voice scoring", async () => {
    const h = await continuousHarness("CC-02"); await h.act("รับสาย"); await h.open(); await h.open();
    const voice = new VoiceApplicationService(h.app, { async transcribe() { return "ขอชื่อหน่อย"; } }, { async synthesize() { return pcmWav(); } });
    const s = h.s(); const reply = await voice.send(s.sessionId, h.owner, { turnId: randomUUID(), expectedRevision: s.revision, audio: pcmWav(), mime: "audio/wav" });
    h.set(reply.dialogue.session); expect(h.s().phone!.state).toBe("IDENTITY_CLAIM");
    expect((await h.raw()).events).toEqual([]); expect((await h.raw()).result).toBeNull();
  });
  it("unknown semantic strings/arbitrary next_state are invalid structured output", async () => {
    const provider: ScenarioModelProvider = { async generateCharacterResponse(c) { return { ...normalMockResponse(c), next_state: "END_SCENARIO", interaction_signal: "INVENTED" } as unknown as AICharacterResponse; } };
    const h = await continuousHarness("CC-N02", provider); await h.act("รับสาย"); await h.open();
    expect((await h.raw()).dialogueTurns.at(-1)).toMatchObject({ usedFallback: true, failureReason: "INVALID_OUTPUT", attempts: 2 });
    expect(h.s().status).toBe("ACTIVE"); expect((await h.raw()).result).toBeNull();
  });
  it.each(["CC-01", "CC-02"] as const)("%s spoken OTP/transfer words cannot confirm a critical simulator action", async story => {
    const h = await continuousHarness(story); await h.main(); const before = await h.raw();
    const voice = new VoiceApplicationService(h.app, { async transcribe() { return "รหัสจำลองคือ 482193 ผมจะโอนเงิน"; } }, { async synthesize() { return pcmWav(); } });
    const reply = await voice.send(before.id, h.owner, { turnId: randomUUID(), expectedRevision: before.revision, audio: pcmWav(), mime: "audio/wav" });
    h.set(reply.dialogue.session); const after = await h.raw();
    expect(after.state).toBe(before.state); expect(after.events).toEqual(before.events);
    expect(after.opportunities).toEqual(before.opportunities); expect(after.result).toBeNull();
  });
  it("voice retry after automatic progression replays once without repeating STT/AI/TTS", async () => {
    const h = await continuousHarness(); await h.act("รับสาย"); await h.open(); await h.open(); await h.say();
    let stt = 0, tts = 0;
    const voice = new VoiceApplicationService(h.app, { async transcribe() { stt++; return "ขอเลขอ้างอิงหน่อย"; } }, { async synthesize() { tts++; return pcmWav(); } });
    const input = { turnId: randomUUID(), expectedRevision: h.s().revision, audio: pcmWav(), mime: "audio/wav" };
    h.set((await voice.send(h.s().sessionId, h.owner, input)).dialogue.session);
    expect(h.s().phone!.state).toBe("CONTEXT_CLAIM"); expect(h.s().phone!.openingStatus).toBe("PENDING");
    const before = await h.raw(), replay = await voice.send(before.id, h.owner, input);
    expect(replay.audioStatus).toBe("REPLAY"); expect(replay.dialogue.duplicate).toBe(true);
    expect(stt).toBe(1); expect(tts).toBe(1); expect(await h.raw()).toEqual(before);
  });
  it("v6 semantic policy cannot be republished with changed configuration", async () => {
    const h = await continuousHarness(), t = structuredClone(callCenterContinuousTemplates[0]!);
    t.states.find(s => s.id === "IDENTITY_CLAIM")!.conversation!.maxConversationalTurns = 2;
    await expect(TrainingCore.create([t], h.repo)).rejects.toThrow("PUBLISHED_TEMPLATE_IMMUTABLE");
  });
  it.each([3, 4, 5])("historical v%s sessions remain pinned/loadable with legacy output shape", async version => {
    const h = await continuousHarness(); const old = await startPinnedStory(h.repo, h.app, h.owner, "CC-01", version);
    expect(old.phone!.continuousConversation).toBeUndefined();
    const t = await h.core.getSessionTemplate(old.sessionId, h.owner.id); expect(t.version).toBe(version);
  });
});
