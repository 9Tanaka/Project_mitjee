import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApplication } from "../src/application/composition.js";
import { actionBindings, registeredTemplates } from "../src/application/catalog.js";
import type { PublicActionPayload, PublicTrainingSession } from "../src/application/contracts.js";
import { TrainingCore } from "../src/core.js";
import { CALL_STORIES } from "../src/domain/constants.js";
import { callerOpening } from "../src/domain/call-center.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { validateTemplate } from "../src/domain/template-validator.js";
import { ScenarioDialogueOrchestrator } from "../src/dialogue/orchestrator.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";
import { VoiceApplicationService } from "../src/application/voice-service.js";
import type { ScenarioModelProvider } from "../src/dialogue/contracts.js";
import { callCenterFoundationTemplates, callStoryRegistry, type CallStoryId } from "../src/fixtures/call-center-foundation.js";
import { GroqScenarioModelProvider } from "../src/providers/groq-scenario-provider.js";
import { demoCallStory } from "../src/server/call-story.js";
import { sessionDto, startRequest, openingRequest } from "../src/public-api/contracts.js";
import { answer, deferred, fakeClient } from "./openai.fixtures.js";

const user = { id: "phone-learner" };
const now = () => 1000;
type App = Awaited<ReturnType<typeof createApplication>>;
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
async function harness(story: CallStoryId = "CC-01", provider: ScenarioModelProvider = new MockScenarioModelProvider()) {
  const repository = new InMemoryTrainingRepository();
  const selector = vi.fn(() => story);
  const app = await createApplication(repository, provider, now, undefined, selector);
  const input = { startId: randomUUID(), expectedRevision: 0 as const };
  const session = (await app.start("call-center-scam", user, input)).session;
  return { app, repository, session, input, selector, provider };
}
async function act(app: App, session: PublicTrainingSession, label: string, payload: PublicActionPayload = {}) {
  const action = session.availableActions.find(a => a.label === label);
  expect(action, label).toBeDefined();
  return (await app.action(session.sessionId, user, { actionId: randomUUID(), expectedRevision: session.revision, actionDefinitionId: action!.id, payload })).session;
}
async function finish(app: App, session: PublicTrainingSession, choiceId = "o1") {
  session = await act(app, session, "รับสาย");
  session = await act(app, session, "พิจารณาข้อมูลผู้โทร");
  session = await act(app, session, "เลือกวิธีตรวจสอบผู้โทร", { choiceId });
  session = await act(app, session, "ไปขั้นตอนตรวจสอบ");
  session = await act(app, session, "เลือกวิธีจัดการสาย", { choiceId: "o1" });
  session = await act(app, session, "วางสาย");
  return act(app, session, "ดูสรุปการฝึก");
}

describe("Call Center story selection and version boundary", () => {
  it("keeps exactly one neutral public entry among nine playable categories", async () => {
    const h = await harness();
    const catalog = h.app.listScenarios();
    expect(catalog).toHaveLength(9);
    expect(catalog.filter(s => s.category === "CALL_CENTER")).toHaveLength(1);
    expect(catalog.find(s => s.category === "CALL_CENTER")?.id).toBe("call-center-scam");
    expect(JSON.stringify(catalog)).not.toMatch(/CC-0|CC-N0|SCAM_CALL|NORMAL_CALL|storyId|call-center-parcel|call-center-bank/);
    expect(catalog.filter(s => s.category !== "CALL_CENTER").every(s => s.communicationMode === "TEXT")).toBe(true);
  });
  it.each(CALL_STORIES)("%s has a stable backend-pinned identity and no public answer key", async story => {
    const h = await harness(story);
    const raw = await h.repository.get(h.session.sessionId, user.id);
    expect(raw).toMatchObject({ templateId: callStoryRegistry[story].templateId, templateVersion: 3, variant: callStoryRegistry[story].variant });
    const template = await h.repository.getTemplate(raw.templateId, raw.templateVersion, raw.variant);
    expect(template.callCenter?.storyId).toBe(story);
    expect(sessionDto.parse(h.session)).toEqual(h.session);
    expect(JSON.stringify(h.session)).not.toMatch(/storyId|CC-0|CC-N0|SCAM_CALL|NORMAL_CALL|assessment|call-center-parcel|call-center-bank/);
    expect(await h.app.start("call-center-scam", user, h.input)).toEqual({ session: h.session, duplicate: true });
    const restarted = await createApplication(h.repository, new MockScenarioModelProvider(), now, undefined, () => { throw new Error("MUST_NOT_REROLL"); });
    expect(await restarted.resume(raw.id, user)).toEqual(h.session);
    expect((await restarted.start("call-center-scam", user, h.input)).duplicate).toBe(true);
    expect(h.selector).toHaveBeenCalledOnce();
  });
  it.each(CALL_STORIES)("accepts private exact-story override %s", story => {
    expect(demoCallStory({ CALL_CENTER_DEMO_STORY: story })!()).toBe(story);
  });
  it("exact story wins over the older valid variant override", () => {
    expect(demoCallStory({ CALL_CENTER_DEMO_STORY: "CC-N01", CALL_CENTER_DEMO_VARIANT: "SCAM_CALL" })!()).toBe("CC-N01");
  });
  it.each(["SCAM_CALL", "NORMAL_CALL"] as const)("variant compatibility limits secure random topics to %s", variant => {
    const selector = demoCallStory({ CALL_CENTER_DEMO_VARIANT: variant })!;
    for (let n = 0; n < 20; n++) expect(callStoryRegistry[selector()].variant).toBe(variant);
  });
  it("unset override preserves application-owned secure randomness", () => {
    expect(demoCallStory({})).toBeUndefined();
    expect(demoCallStory({ CALL_CENTER_DEMO_STORY: "" })).toBeUndefined();
  });
  it("invalid private story fails closed without echoing the value", () => {
    expect(() => demoCallStory({ CALL_CENTER_DEMO_STORY: "PRIVATE_INVALID_VALUE" })).toThrow("Invalid CALL_CENTER_DEMO_STORY configuration");
    try { demoCallStory({ CALL_CENTER_DEMO_STORY: "PRIVATE_INVALID_VALUE" }); } catch (error) { expect(String(error)).not.toContain("PRIVATE_INVALID_VALUE"); }
  });
  it.each(["story", "storyId", "variant", "topic", "CALL_CENTER_DEMO_STORY", "templateId", "templateVersion"])("browser cannot choose %s", field => {
    expect(startRequest.safeParse({ startId: randomUUID(), expectedRevision: 0, [field]: "CC-02" }).success).toBe(false);
    expect(openingRequest.safeParse({ expectedRevision: 1, [field]: "CC-02" }).success).toBe(false);
  });
  it("rejects story/topic/variant mismatches before publication", () => {
    const template = structuredClone(callCenterFoundationTemplates[0]!);
    template.callCenter!.topic = "BANK"; expect(() => validateTemplate(template)).toThrow("Story/topic mismatch");
    template.callCenter!.topic = "PARCEL"; template.variant = "NORMAL_CALL";
    expect(() => validateTemplate(template)).toThrow("Story/variant mismatch");
  });
  it("published v3 and historical v1/v2 are immutable and all remain registered", async () => {
    const h = await harness();
    const core = await TrainingCore.create(registeredTemplates, h.repository, now);
    for (const template of registeredTemplates.filter(t => t.category === "CALL_CENTER")) {
      expect(await h.repository.getTemplate(template.id, template.version, template.variant)).toEqual(validateTemplate(template));
      await expect(core.publishTemplate({ ...template, description: "changed configuration" })).rejects.toThrow("PUBLISHED_TEMPLATE_IMMUTABLE");
    }
  });
  it("phone publication rejects missing role or an incoming bypass transition", () => {
    const template = structuredClone(callCenterFoundationTemplates[0]!);
    delete template.characterRole;
    expect(() => validateTemplate(template)).toThrow("Phone templates require a character role");
    template.characterRole = "ผู้โทรสมมติ";
    template.states[0]!.transitions.push({ id: "BYPASS", target: "END_SCENARIO", safeResolution: true, requiresFinalized: [], requiresEvents: [], publicLabel: "ข้าม" });
    expect(() => validateTemplate(template)).toThrow("Incoming call cannot bypass answer");
  });
});

describe("AI-first phone flow and backend authority", () => {
  it("starts incoming with no dialogue/checkpoints, rejecting user messages/opening before answer", async () => {
    const provider = new MockScenarioModelProvider(), h = await harness("CC-01", provider);
    expect(h.session.phone).toMatchObject({ state: "INCOMING_CALL", callStatus: "RINGING", openingStatus: "NOT_STARTED", callerLabel: "ผู้ติดต่อไม่รู้จัก" });
    expect(h.session.messages).toEqual([]); expect(h.session.availableActions.map(a => a.label)).toEqual(["รับสาย", "ปฏิเสธสาย"]);
    await expect(h.app.message(h.session.sessionId, user, { turnId: "before-answer", expectedRevision: 0, text: "สวัสดี" })).rejects.toThrow("CALL_NOT_READY");
    await expect(h.app.opening(h.session.sessionId, user, { expectedRevision: 0 })).rejects.toThrow("CALL_NOT_READY");
    expect(provider.callCount).toBe(0);
    expect((await h.repository.get(h.session.sessionId, user.id)).opportunities).toEqual([]);
  });
  it("Answer Call persists the opening alone before learner dialogue; replay/resume never repeats it", async () => {
    const provider = new MockScenarioModelProvider(), h = await harness("CC-02", provider);
    const command = { actionId: "answer-once", expectedRevision: 0, actionDefinitionId: h.session.availableActions[0]!.id, payload: {} };
    const first = await h.app.action(h.session.sessionId, user, command);
    expect(first.session.phone).toMatchObject({ state: "CALL_CONNECTED", openingStatus: "READY", callStatus: "CONNECTED" });
    expect(first.session.messages).toHaveLength(1); expect(first.session.messages[0]?.role).toBe("character");
    expect(first.session.messages[0]?.text).toContain("ธนาคารสมมติ");
    expect(first.session.revision).toBe(2);
    const raw = await h.repository.get(h.session.sessionId, user.id);
    expect(raw.actions.map(a => a.kind)).toEqual(["PROGRESS", "CHARACTER_OPENING"]);
    expect(raw.opportunities).toEqual([]); expect(raw.events).toEqual([]); expect(raw.result).toBeNull();
    expect(callerOpening(raw)).toMatchObject({ usedFallback: false, failureReason: null, attempts: 1, snapshotRevision: 1, committedRevision: 2 });
    expect((await h.app.action(raw.id, user, command)).duplicate).toBe(true);
    expect((await h.app.opening(raw.id, user, { expectedRevision: 1 })).duplicate).toBe(true);
    expect(await h.app.resume(raw.id, user)).toEqual(first.session); expect(provider.callCount).toBe(1);
  });
  it("Decline Call abandons with no official result or model call", async () => {
    const provider = new MockScenarioModelProvider(), h = await harness("CC-N01", provider);
    const s = await act(h.app, h.session, "ปฏิเสธสาย");
    expect(s.status).toBe("ABANDONED"); expect(s.phone?.callStatus).toBe("DECLINED");
    expect(provider.callCount).toBe(0); expect(s.messages).toEqual([]);
    await expect(h.app.result(s.sessionId, user)).rejects.toThrow("RESULT_NOT_FOUND");
  });
  it("Groq opening uses the strict Responses schema with no store and no fake user input", async () => {
    const client = fakeClient(), provider = new GroqScenarioModelProvider(client, "openai/gpt-oss-120b"), h = await harness("CC-01", provider);
    const s = await act(h.app, h.session, "รับสาย");
    const body = client.create.mock.calls[0]![0];
    expect(body).not.toHaveProperty("store");
    expect(body).toMatchObject({ text: { format: { strict: true, type: "json_schema" } } });
    const input = body.input as { role: string; content: string }[];
    expect(input.map(i => i.role)).toEqual(["developer"]);
    expect(JSON.parse(input[0]!.content)).toMatchObject({ turnKind: "CHARACTER_OPENING", currentState: "CALL_CONNECTED", scenario: { callStoryId: "CC-01" } });
    expect(s.messages.map(m => m.role)).toEqual(["character"]);
  });
  it.each(["error", "refusal", "invalid"] as const)("%s provider produces an authored opening with an accurate fallback receipt", async kind => {
    const provider = new MockScenarioModelProvider([kind === "invalid" ? { kind, output: { next_state: "END_SCENARIO" } } : { kind }]);
    const h = await harness("CC-N02", provider), s = await act(h.app, h.session, "รับสาย");
    const raw = await h.repository.get(s.sessionId, user.id), template = await h.repository.getTemplate(raw.templateId, raw.templateVersion, raw.variant);
    expect(s.messages[0]?.text).toBe(template.callCenter!.openingFallback);
    expect(callerOpening(raw)).toMatchObject({ usedFallback: true, attempts: 2, failureReason: kind === "error" ? "ERROR" : kind === "refusal" ? "REFUSAL" : "INVALID_OUTPUT" });
    expect(raw.state).toBe("CALL_CONNECTED"); expect(raw.result).toBeNull();
  });
  it("high-confidence critical opening candidate cannot own state/events/scoring", async () => {
    const h = await harness("CC-01", new MockScenarioModelProvider([{ kind: "response", response: answer({ candidate_event: "POSSIBLE_CRITICAL_FAILURE", event_code: "DISCLOSE_OTP", confidence: 1 }) }]));
    const s = await act(h.app, h.session, "รับสาย"), raw = await h.repository.get(s.sessionId, user.id);
    expect(raw).toMatchObject({ state: "CALL_CONNECTED", status: "ACTIVE", events: [], opportunities: [], result: null });
    expect(callerOpening(raw)?.candidateStatus).toBe("REJECTED");
  });
  it("hidden story labels in provider text are blocked rather than exposed", async () => {
    const h = await harness("CC-01", new MockScenarioModelProvider([{ kind: "response", response: answer({ character_message: "SCAM_CALL CC-01" }) }]));
    const s = await act(h.app, h.session, "รับสาย"), raw = await h.repository.get(s.sessionId, user.id);
    expect(callerOpening(raw)).toMatchObject({ usedFallback: true, failureReason: "SAFETY_BLOCKED" });
    expect(JSON.stringify(s)).not.toMatch(/SCAM_CALL|CC-01/);
  });
  it.each(CALL_STORIES)("%s foundation reaches a categorical result without implementing full story content", async story => {
    const h = await harness(story), s = await finish(h.app, h.session);
    expect(s.status).toBe("COMPLETED"); expect(s.phone).toMatchObject({ state: "END_SCENARIO", callStatus: "ENDED" });
    expect(await h.app.result(s.sessionId, user)).toMatchObject({ outcome: "PASSED", evaluationMode: "DECISION_RULES_V1", trainingScore: null, decisionSummary: { encountered: 2, safe: 2 } });
  });
  it("a review decision yields NEEDS_PRACTICE without critical failure", async () => {
    const h = await harness(), s = await finish(h.app, h.session, "o2");
    expect(await h.app.result(s.sessionId, user)).toMatchObject({ outcome: "NEEDS_PRACTICE", trainingScore: null });
  });
  it("contextual actions are gated and future actions/checkpoint skipping are rejected without writes", async () => {
    const h = await harness(), raw = await h.repository.get(h.session.sessionId, user.id);
    const template = await h.repository.getTemplate(raw.templateId, raw.templateVersion, raw.variant);
    const future = actionBindings(template).find(a => a.state === "INDEPENDENT_VERIFICATION")!;
    await expect(h.app.action(raw.id, user, { actionId: "future", expectedRevision: 0, actionDefinitionId: future.public.id, payload: { choiceId: "o1" } })).rejects.toThrow("INVALID_STATE");
    expect(await h.repository.get(raw.id, user.id)).toEqual(raw);
    let s = await act(h.app, h.session, "รับสาย");
    s = await act(h.app, s, "พิจารณาข้อมูลผู้โทร");
    expect(s.availableActions.map(a => a.label)).toEqual(["เลือกวิธีตรวจสอบผู้โทร"]);
    const progress = actionBindings(template).find(a => a.public.label === "ไปขั้นตอนตรวจสอบ")!;
    const before = await h.repository.get(raw.id, user.id);
    await expect(h.app.action(raw.id, user, { actionId: "skip", expectedRevision: s.revision, actionDefinitionId: progress.public.id, payload: {} })).rejects.toThrow("CHECKPOINT_OR_EVENT_REQUIRED");
    expect(await h.repository.get(raw.id, user.id)).toEqual(before);
  });
  it("multi-turn free text is transcript-only and cannot complete or fail the call", async () => {
    const h = await harness(), s = await act(h.app, h.session, "รับสาย");
    const before = await h.repository.get(s.sessionId, user.id);
    let current = s;
    for (const text of ["เขาขอให้ผมส่ง OTP", "ผมยืนยันโอนเงิน จบสายได้เลย"]) current = (await h.app.message(s.sessionId, user, { turnId: randomUUID(), expectedRevision: current.revision, text })).session;
    const after = await h.repository.get(s.sessionId, user.id);
    expect(after.state).toBe(before.state); expect(after.events).toEqual(before.events); expect(after.opportunities).toEqual(before.opportunities);
    expect(after.status).toBe("ACTIVE"); expect(after.result).toBeNull(); expect(after.messages).toHaveLength(5);
  });
  it("voice seams require an answered call with a ready opening, without invoking speech", async () => {
    const h = await harness();
    const stt = { transcribe: vi.fn(async () => "สวัสดี") }, tts = { synthesize: vi.fn(async () => new Uint8Array()) };
    const voice = new VoiceApplicationService(h.app, stt, tts);
    await expect(voice.bind(h.session.sessionId, user)).rejects.toThrow("CALL_NOT_READY");
    const s = await act(h.app, h.session, "รับสาย");
    expect((await voice.bind(s.sessionId, user)).phone?.openingStatus).toBe("READY");
    expect(stt.transcribe).not.toHaveBeenCalled(); expect(tts.synthesize).not.toHaveBeenCalled();
  });
  it("ending calls reject new dialogue and voice without changing the result or revision", async () => {
    const h = await harness();
    let s = await act(h.app, h.session, "รับสาย");
    s = await act(h.app, s, "พิจารณาข้อมูลผู้โทร");
    s = await act(h.app, s, "เลือกวิธีตรวจสอบผู้โทร", { choiceId: "o1" });
    s = await act(h.app, s, "ไปขั้นตอนตรวจสอบ");
    s = await act(h.app, s, "เลือกวิธีจัดการสาย", { choiceId: "o1" });
    s = await act(h.app, s, "วางสาย");
    const before = await h.repository.get(s.sessionId, user.id);
    await expect(h.app.message(s.sessionId, user, { turnId: "after-hangup", expectedRevision: s.revision, text: "สวัสดี" })).rejects.toThrow("CALL_NOT_READY");
    const voice = new VoiceApplicationService(h.app, { transcribe: vi.fn() }, { synthesize: vi.fn() });
    await expect(voice.bind(s.sessionId, user)).rejects.toThrow("CALL_NOT_READY");
    expect(await h.repository.get(s.sessionId, user.id)).toEqual(before);
  });
  it("pending opening resumes, and timeout cancellation prevents a late commit", async () => {
    vi.useFakeTimers();
    const repository = new InMemoryTrainingRepository(), core = await TrainingCore.create(registeredTemplates, repository, now);
    const t = callCenterFoundationTemplates[0]!;
    const raw = await core.start("pending-call", user.id, t.id, t.version, t.variant);
    await core.submit({ sessionId: raw.id, ownerId: user.id, actionId: "answer", expectedRevision: 0, action: { kind: "PROGRESS", transitionId: "ANSWER_CALL" } });
    const app = await createApplication(repository, new MockScenarioModelProvider(), now);
    expect((await app.resume(raw.id, user)).phone?.openingStatus).toBe("PENDING");
    expect((await app.resume(raw.id, user)).availableActions).toEqual([]);
    const late = deferred<ReturnType<typeof answer>>(), signals: AbortSignal[] = [];
    const provider: ScenarioModelProvider = { async generateCharacterResponse(context, options) {
      expect(context.currentUserMessage).toBeNull(); signals.push(options!.signal!); return late.promise;
    } };
    const orchestrator = new ScenarioDialogueOrchestrator(core, provider, 10);
    const work = orchestrator.openCall({ sessionId: raw.id, ownerId: user.id, expectedRevision: 1 });
    await vi.advanceTimersByTimeAsync(25);
    const reply = await work;
    expect(reply.turn).toMatchObject({ usedFallback: true, failureReason: "TIMEOUT", attempts: 2 });
    expect(signals.every(s => s.aborted)).toBe(true);
    const saved = await core.resume(raw.id, user.id);
    late.resolve(answer({ character_message: "late response must never commit" })); await Promise.resolve();
    expect(await core.resume(raw.id, user.id)).toEqual(saved);
    expect(saved.messages).toHaveLength(1); expect(saved.messages[0]?.role).toBe("character");
  });
  it("concurrent opening requests commit only one opening receipt and message", async () => {
    const h = await harness();
    const core = await TrainingCore.create(registeredTemplates, h.repository, now);
    await core.submit({ sessionId: h.session.sessionId, ownerId: user.id, actionId: "answer", expectedRevision: 0, action: { kind: "PROGRESS", transitionId: "ANSWER_CALL" } });
    const request = { expectedRevision: 1 };
    const replies = await Promise.all([h.app.opening(h.session.sessionId, user, request), h.app.opening(h.session.sessionId, user, request)]);
    expect(replies.map(r => r.duplicate).sort()).toEqual([false, true]);
    const raw = await h.repository.get(h.session.sessionId, user.id);
    expect(raw.revision).toBe(2); expect(raw.messages).toHaveLength(1); expect(raw.dialogueTurns).toHaveLength(1);
  });
  it("a failed opening commit leaves a recoverable pending call with no partial receipt", async () => {
    const h = await harness();
    const save = h.repository.save.bind(h.repository);
    vi.spyOn(h.repository, "save").mockImplementation(async (s, revision) => {
      if (s.actions.some(a => a.kind === "CHARACTER_OPENING")) throw new Error("SYNTHETIC_COMMIT_FAILURE");
      return save(s, revision);
    });
    await expect(act(h.app, h.session, "รับสาย")).rejects.toThrow("SYNTHETIC_COMMIT_FAILURE");
    const pending = await h.repository.get(h.session.sessionId, user.id);
    expect(pending).toMatchObject({ state: "CALL_CONNECTED", revision: 1, messages: [], dialogueTurns: [], events: [], opportunities: [] });
    expect(pending.actions).toHaveLength(1);
    vi.restoreAllMocks();
    const recovered = await h.app.opening(pending.id, user, { expectedRevision: 1 });
    expect(recovered.session.messages).toHaveLength(1); expect(recovered.session.phone?.openingStatus).toBe("READY");
  });
  it("quitting while an opening is in flight prevents any late opening commit", async () => {
    const entered = deferred<void>(), late = deferred<ReturnType<typeof answer>>();
    const h = await harness("CC-01", { async generateCharacterResponse() { entered.resolve(); return late.promise; } });
    const core = await TrainingCore.create(registeredTemplates, h.repository, now);
    await core.submit({ sessionId: h.session.sessionId, ownerId: user.id, actionId: "answer", expectedRevision: 0, action: { kind: "PROGRESS", transitionId: "ANSWER_CALL" } });
    const work = h.app.opening(h.session.sessionId, user, { expectedRevision: 1 });
    const assertion = expect(work).rejects.toThrow("SESSION_NOT_ACTIVE");
    await entered.promise;
    await h.app.quit(h.session.sessionId, user, { actionId: "quit", expectedRevision: 1 });
    const saved = await h.repository.get(h.session.sessionId, user.id);
    late.resolve(answer()); await assertion;
    expect(await h.repository.get(saved.id, user.id)).toEqual(saved);
    expect(saved.messages).toEqual([]); expect(saved.dialogueTurns).toEqual([]); expect(saved.result).toBeNull();
  });
  it("same-revision requests reject stale updates without duplicate transition or score", async () => {
    const h = await harness(), connected = await act(h.app, h.session, "รับสาย");
    const action = connected.availableActions[0]!;
    const first = { actionId: "first", expectedRevision: connected.revision, actionDefinitionId: action.id, payload: {} };
    await h.app.action(connected.sessionId, user, first);
    const before = await h.repository.get(connected.sessionId, user.id);
    await expect(h.app.action(connected.sessionId, user, { ...first, actionId: "second" })).rejects.toThrow("REVISION_CONFLICT");
    expect(await h.repository.get(connected.sessionId, user.id)).toEqual(before);
    expect((await h.app.action(connected.sessionId, user, first)).duplicate).toBe(true);
  });
});
