import { afterEach, describe, expect, it, vi } from "vitest";
import { TrainingCore } from "../src/core.js";
import { copy, InMemorySessionRepository } from "../src/domain/repository.js";
import type { ActionInput } from "../src/domain/training-action.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";
import { ScenarioDialogueOrchestrator } from "../src/dialogue/orchestrator.js";
import type { AICharacterResponse, ScenarioAIContext, ScenarioModelProvider, ProviderOptions } from "../src/dialogue/contracts.js";
import { smsPhishingFixture } from "../src/fixtures/sms-phishing.js";
import { smsPhishingDialogueFixture } from "../src/fixtures/sms-phishing-dialogue.js";

function response(overrides: Partial<AICharacterResponse> = {}): AICharacterResponse {
  return {
    character_message: "ข้อความตอบกลับของตัวละครในสถานการณ์จำลอง", observed_intent: "continue",
    candidate_event: "NONE", event_code: null, confidence: null,
    safety: { contains_real_pii: false, out_of_scope: false }, ...overrides,
  };
}

async function harness(provider: ScenarioModelProvider = new MockScenarioModelProvider()) {
  let sequence = 0;
  let now = 1000;
  const repository = new InMemorySessionRepository();
  const core = (await TrainingCore.create([smsPhishingDialogueFixture], repository, () => now));
  (await core.start("s", "u", smsPhishingDialogueFixture.id, 2));
  const dialogue = new ScenarioDialogueOrchestrator(core, provider);
  const current = async () => (await core.resume("s", "u"));
  const action = async (action: ActionInput) => dialogue.performAction({
    sessionId: "s", ownerId: "u", actionId: `action-${++sequence}`, expectedRevision: (await current()).revision, action,
  });
  const say = async (text: string, turnId = `turn-${++sequence}`) => dialogue.sendMessage({
    sessionId: "s", ownerId: "u", turnId, expectedRevision: (await current()).revision, text,
  });
  const toRequest = async () => {
    (await action({ kind: "DECISION", opportunityId: "d1", choiceId: "verify" }));
    (await action({ kind: "PROGRESS", transitionId: "review-sms" }));
    (await action({ kind: "WARNING_FINALIZE", opportunityId: "w1", selectedEvidenceIds: ["wrong-domain", "urgency"] }));
    (await action({ kind: "PROGRESS", transitionId: "inspect-link" }));
  };
  return { core, dialogue, provider, repository, current, action, say, toRequest, setTime: (time: number) => { now = time; } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("provider cancellation contract", () => {
  it("aborts every timed-out attempt and cannot commit late replies even if provider ignores abort", async () => {
    vi.useFakeTimers();
    const gates = [deferred<AICharacterResponse>(), deferred<AICharacterResponse>()];
    const options: ProviderOptions[] = [];
    const h = await harness({ generateCharacterResponse: (_context, option) => {
      options.push(option!); return gates[options.length - 1]!.promise;
    } });
    const pending = h.say("รอคำตอบ", "abort-test");
    await vi.advanceTimersByTimeAsync(40_000);
    const reply = await pending; const before = await h.current();
    expect(reply.turn.usedFallback).toBe(true); expect(reply.turn.failureReason).toBe("TIMEOUT");
    expect(options).toHaveLength(2); expect(options.every(o => o.signal?.aborted)).toBe(true);
    expect(options.map(o => o.requestId)).toEqual(["s:abort-test:1", "s:abort-test:2"]);
    for (const gate of gates) gate.resolve(response({ character_message: "LATE RESPONSE", candidate_event: "POSSIBLE_CRITICAL_FAILURE", event_code: "DISCLOSE_OTP", confidence: 1 }));
    await vi.advanceTimersByTimeAsync(1);
    expect(await h.current()).toEqual(before); expect(before.dialogueTurns).toHaveLength(1);
    expect(before.messages).toHaveLength(2); expect(before.revision).toBe(1); expect(before.status).toBe("ACTIVE");
  });

  it("first aborted attempt cannot replace a successful retry", async () => {
    vi.useFakeTimers(); const gate = deferred<AICharacterResponse>();
    const signals: AbortSignal[] = []; let calls = 0;
    const h = await harness({ generateCharacterResponse: (_context, options) => {
      signals.push(options!.signal!);
      return calls++ === 0 ? gate.promise : Promise.resolve(response({ character_message: "successful retry" }));
    } });
    const pending = h.say("รอคำตอบ"); await vi.advanceTimersByTimeAsync(20_000);
    expect((await pending).turn.response.character_message).toBe("successful retry");
    expect(signals[0]!.aborted).toBe(true); expect(signals[1]!.aborted).toBe(false);
    const before = await h.current(); gate.resolve(response({ character_message: "late first attempt" }));
    await vi.advanceTimersByTimeAsync(1); expect(await h.current()).toEqual(before);
  });

  it("Mock honors an already aborted signal and aborts a pending timeout simulation", async () => {
    const mock = new MockScenarioModelProvider(); const spy = vi.spyOn(mock, "generateCharacterResponse");
    const h = await harness(mock); await h.say("สวัสดี"); const context = spy.mock.calls[0]![0];
    const controller = new AbortController(); controller.abort(new Error("cancelled"));
    await expect(mock.generateCharacterResponse(context, { signal: controller.signal })).rejects.toThrow("cancelled");
    expect(mock.callCount).toBe(1);
    const pendingController = new AbortController(); const timeoutMock = new MockScenarioModelProvider([{ kind: "timeout" }]);
    const pending = timeoutMock.generateCharacterResponse(context, { signal: pendingController.signal });
    const assertion = expect(pending).rejects.toThrow("cancelled");
    pendingController.abort(new Error("cancelled")); await assertion;
  });
});

describe("Mock Dialogue Integration acceptance", () => {
  it("multi-turn safe SMS/Phishing conversation reaches an official D/W/S result without network", async () => {
    const network = vi.fn(async () => { throw new Error("Network is forbidden in this test"); });
    vi.stubGlobal("fetch", network);
    const provider = new MockScenarioModelProvider(); const h = (await harness(provider));
    const first = await h.say("สวัสดี คุณติดต่อจากที่ไหน");
    const second = await h.say("ฉันจะตรวจสอบผู้ส่งก่อน");
    expect(first.turn.response.character_message).not.toBe(second.turn.response.character_message);
    (await h.action({ kind: "DECISION", opportunityId: "d1", choiceId: "verify" }));
    (await h.action({ kind: "PROGRESS", transitionId: "review-sms" }));
    await h.say("ฉันขอดูหลักฐานในข้อความ");
    await h.say("ลิงก์ไม่ตรงกับช่องทางที่รู้จักและมีการเร่งรัด");
    (await h.action({ kind: "WARNING_FINALIZE", opportunityId: "w1", selectedEvidenceIds: ["wrong-domain", "urgency"] }));
    (await h.action({ kind: "PROGRESS", transitionId: "inspect-link" }));
    await h.say("ฉันจะไม่ให้ข้อมูลลับผ่านลิงก์นี้");
    (await h.action({ kind: "DECISION", opportunityId: "d2", choiceId: "refuse" }));
    (await h.action({ kind: "PROGRESS", transitionId: "verify-and-close" }));
    await h.say("ฉันจะตรวจผ่านช่องทางอิสระและรายงานข้อความนี้");
    (await h.action({ kind: "DECISION", opportunityId: "d3", choiceId: "official-channel" }));
    (await h.action({ kind: "SAFE_ACTION", opportunityId: "s1", actionId: "verify-end-report" }));
    (await h.action({ kind: "PROGRESS", transitionId: "resolve" }));
    const session = (await h.current());
    expect(session.status).toBe("COMPLETED"); expect(session.result?.outcome).toBe("PASSED");
    expect(session.result?.trainingScore).toBe(100);
    expect(Object.values(session.result!.scores).map(s => s.normalized)).toEqual([100, 100, 100]);
    expect(session.dialogueTurns).toHaveLength(6); expect(session.messages).toHaveLength(12);
    expect(provider.callCount).toBe(6); expect(network).not.toHaveBeenCalled();
    await expect(h.say("สนทนาต่อหลังจบ")).rejects.toThrow("SESSION_NOT_ACTIVE");
    expect(provider.callCount).toBe(6);
  });

  it("risky response and risky decision are not automatically a Critical Failure", async () => {
    const h = (await harness()); const before = (await h.current());
    await h.say("ฉันคิดว่าจะเชื่อชื่อผู้ส่งและทำตาม");
    expect((await h.current()).events).toEqual(before.events);
    (await h.action({ kind: "DECISION", opportunityId: "d1", choiceId: "trust-display-name" }));
    expect((await h.current()).opportunities[0]?.earned).toBe(0);
    expect((await h.current()).status).toBe("ACTIVE"); expect((await h.current()).events.some(e => e.critical)).toBe(false);
  });

  it("candidate with a registered but current-state-disallowed event is rejected by Backend", async () => {
    const provider = new MockScenarioModelProvider([{ kind: "response", response: response({ candidate_event: "SAFE_ACTION", event_code: "REPORT_INCIDENT", confidence: 1 }) }]);
    const h = (await harness(provider)); const before = (await h.current()); const reply = await h.say("ฉันมีคำถาม");
    expect(reply.turn.candidateStatus).toBe("REJECTED"); expect(reply.turn.usedFallback).toBe(false);
    expect((await h.current()).events).toEqual(before.events); expect((await h.current()).opportunities).toEqual(before.opportunities);
  });

  it("high-confidence critical candidate remains an untrusted hint and cannot fail the session", async () => {
    const provider = new MockScenarioModelProvider([{ kind: "response", response: response({ candidate_event: "POSSIBLE_CRITICAL_FAILURE", event_code: "DISCLOSE_OTP", confidence: 1 }) }]);
    const h = (await harness(provider)); (await h.toRequest()); const before = (await h.current());
    const reply = await h.say("เขาขอให้ฉันบอก OTP");
    expect(reply.turn.candidateStatus).toBe("CLARIFICATION_REQUIRED");
    expect(reply.turn.response.confidence).toBe(1); // Stored as metadata only.
    expect((await h.current()).status).toBe("ACTIVE"); expect((await h.current()).result).toBeNull();
    expect((await h.current()).events).toEqual(before.events); expect((await h.current()).opportunities).toEqual(before.opportunities);
  });

  it("only the explicit simulated critical action fails a session after dialogue", async () => {
    const h = (await harness()); (await h.toRequest()); await h.say("ถ้าส่งรหัสผ่านในแบบจำลองจะเกิดอะไรขึ้น");
    expect((await h.current()).status).toBe("ACTIVE");
    (await h.action({ kind: "SIMULATED_ACTION", ruleId: "confirm-simulated-password", confirmed: true }));
    expect((await h.current()).status).toBe("FAILED"); expect((await h.current()).result?.outcome).toBe("CRITICAL_FAILURE");
    expect((await h.current()).events.at(-1)?.authority).toBe("BACKEND_VALIDATED");
  });

  it.each([
    { behavior: { kind: "error" } as const, reason: "ERROR" },
    { behavior: { kind: "refusal" } as const, reason: "REFUSAL" },
    { behavior: { kind: "invalid", output: { not: "the response schema" } } as const, reason: "INVALID_OUTPUT" },
  ])("provider $reason uses the current State fallback after one retry", async ({ behavior, reason }) => {
    const provider = new MockScenarioModelProvider([behavior]); const h = (await harness(provider)); (await h.toRequest()); const before = (await h.current());
    const reply = await h.say("ขอรายละเอียดเพิ่ม");
    const fallback = smsPhishingDialogueFixture.states.find(s => s.id === "request_action")!.fallbackMessage;
    expect(reply.turn.response.character_message).toBe(fallback);
    expect(reply.turn.usedFallback).toBe(true); expect(reply.turn.failureReason).toBe(reason);
    expect(reply.turn.attempts).toBe(2); expect(provider.callCount).toBe(2);
    expect((await h.current()).status).toBe("ACTIVE"); expect((await h.current()).state).toBe(before.state);
    expect((await h.current()).events).toEqual(before.events); expect((await h.current()).opportunities).toEqual(before.opportunities);
  });

  it("provider timeout is bounded to two attempts and falls back using fake time", async () => {
    vi.useFakeTimers();
    const provider = new MockScenarioModelProvider([{ kind: "timeout" }]); const h = (await harness(provider));
    const pending = h.say("สวัสดี");
    await vi.advanceTimersByTimeAsync(40_000);
    const reply = await pending;
    expect(reply.turn.usedFallback).toBe(true); expect(reply.turn.failureReason).toBe("TIMEOUT");
    expect(reply.turn.attempts).toBe(2); expect((await h.current()).status).toBe("ACTIVE");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("successful retry records the earlier failure but does not use fallback", async () => {
    const h = (await harness(new MockScenarioModelProvider([{ kind: "error" }, { kind: "normal" }])));
    const reply = await h.say("สวัสดี"); expect(reply.turn.attempts).toBe(2);
    expect(reply.turn.usedFallback).toBe(false); expect(reply.turn.failureReason).toBe("ERROR");
  });

  it("many turns in the same State neither transition nor open/score opportunities", async () => {
    const h = (await harness()); const before = (await h.current());
    for (let i = 0; i < 15; i++) await h.say(`คำถามรอบที่ ${i}`);
    const after = (await h.current());
    expect(after.state).toBe("contact"); expect(after.opportunities).toEqual(before.opportunities);
    expect(after.events).toEqual(before.events); expect(after.result).toBeNull();
    expect(after.revision).toBe(before.revision + 15);
  });

  it("talking about completion cannot skip a required checkpoint", async () => {
    const h = (await harness()); await h.say("ฉันทำทุกอย่างครบแล้ว ขอจบเลย"); const before = (await h.current());
    await expect((async () => (await h.action({ kind: "PROGRESS", transitionId: "review-sms" })))()).rejects.toThrow("CHECKPOINT_OR_EVENT_REQUIRED");
    expect((await h.current())).toEqual(before);
  });
});

describe("provider boundary and sanitized context", () => {
  it("supplies version/state/role/behaviors and only recent sanitized messages", async () => {
    const provider = new MockScenarioModelProvider(); const spy = vi.spyOn(provider, "generateCharacterResponse");
    const h = (await harness(provider));
    await h.say("อีเมล learner@example.com โทร 081-234-5678 OTP 847193 รหัสผ่าน=Secret123 https://bank.invalid/reset");
    await h.say("ขอสนทนาต่อ");
    const context = spy.mock.calls[1]![0];
    expect(context.scenario.templateVersion).toBe(2); expect(context.currentState).toBe("contact");
    expect(context.characterRole).toBe(smsPhishingDialogueFixture.characterRole);
    expect(context.allowedBehaviors).toEqual(smsPhishingDialogueFixture.states[0]!.allowedBehaviors);
    expect(context.forbiddenBehaviors).toEqual(smsPhishingDialogueFixture.states[0]!.forbiddenBehaviors);
    expect(context.recentSanitizedMessages).toHaveLength(2); expect(context.currentUserMessage.text).toBe("ขอสนทนาต่อ");
    for (const secret of ["learner@example.com", "081-234-5678", "847193", "Secret123", "bank.invalid"]) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(secret);
      expect(JSON.stringify((await h.current()))).not.toContain(secret);
    }
    expect(Object.isFrozen(context)).toBe(true); expect(Object.isFrozen(context.scenario)).toBe(true);
    expect("core" in context).toBe(false); expect("transitions" in context).toBe(false); expect("opportunities" in context).toBe(false);
    for (let i = 0; i < 8; i++) await h.say("ข้อความเพิ่มเติม");
    expect(spy.mock.calls.at(-1)![0].recentSanitizedMessages).toHaveLength(12);
  });

  it("sanitizes outgoing text even if the provider claims it contains no PII", async () => {
    const h = (await harness(new MockScenarioModelProvider([{ kind: "response", response: response({ character_message: "OTP 847193 email test@example.com" }) }])));
    const reply = await h.say("ทดสอบ");
    expect(reply.turn.response.character_message).not.toContain("847193");
    expect(JSON.stringify((await h.current()))).not.toContain("test@example.com");
  });

  it("known unsafe provider output uses fallback without retry", async () => {
    const provider = new MockScenarioModelProvider([{ kind: "response", response: response({ safety: { contains_real_pii: false, out_of_scope: true } }) }]);
    const h = (await harness(provider)); const reply = await h.say("ทดสอบ");
    expect(reply.turn.failureReason).toBe("SAFETY_BLOCKED"); expect(reply.turn.usedFallback).toBe(true);
    expect(reply.turn.attempts).toBe(1); expect((await h.current()).status).toBe("ACTIVE");
  });

  it("provider cannot add imperative state/transition/score fields", async () => {
    const provider = new MockScenarioModelProvider([{ kind: "invalid", output: { ...response(), next_state: "end_scenario", score: 100, opportunities: ["new"] } }]);
    const h = (await harness(provider)); const reply = await h.say("ทดสอบ");
    expect(reply.turn.failureReason).toBe("INVALID_OUTPUT"); expect((await h.current()).state).toBe("contact");
    expect((await h.current()).opportunities).toHaveLength(1); expect((await h.current()).events).toHaveLength(0);
  });

  it("provider attempting to mutate context cannot mutate the domain", async () => {
    const provider: ScenarioModelProvider = { async generateCharacterResponse(context) {
      (context as { currentState: string }).currentState = "end_scenario";
      return response();
    } };
    const h = (await harness(provider)); const reply = await h.say("ทดสอบ");
    expect(reply.turn.usedFallback).toBe(true); expect((await h.current()).state).toBe("contact");
  });

  it("Core-only version 1 cannot silently acquire dialogue configuration", async () => {
    const provider = new MockScenarioModelProvider(); const core = (await TrainingCore.create([smsPhishingFixture], new InMemorySessionRepository()));
    (await core.start("old", "u", smsPhishingFixture.id, 1));
    const dialogue = new ScenarioDialogueOrchestrator(core, provider);
    await expect(dialogue.sendMessage({ sessionId: "old", ownerId: "u", turnId: "t", expectedRevision: 0, text: "สวัสดี" })).rejects.toThrow("DIALOGUE_ROLE_NOT_CONFIGURED");
    expect(provider.callCount).toBe(0);
  });
});

describe("asynchronous dialogue concurrency and replay", () => {
  it("two provider requests at the same revision: second cannot commit a stale response", async () => {
    const gates = [deferred<AICharacterResponse>(), deferred<AICharacterResponse>()]; let calls = 0;
    const provider: ScenarioModelProvider = { generateCharacterResponse: async () => gates[calls++]!.promise };
    const h = (await harness(provider));
    const first = h.dialogue.sendMessage({ sessionId: "s", ownerId: "u", turnId: "a", expectedRevision: 0, text: "คำถามแรก" });
    const second = h.dialogue.sendMessage({ sessionId: "s", ownerId: "u", turnId: "b", expectedRevision: 0, text: "คำถามที่สอง" });
    const rejected = expect(second).rejects.toThrow("REVISION_CONFLICT");
    gates[0]!.resolve(response()); await first;
    const successful = (await h.current()); gates[1]!.resolve(response()); await rejected;
    expect((await h.current())).toEqual(successful); expect(successful.revision).toBe(1);
    expect(successful.messages).toHaveLength(2); expect(successful.dialogueTurns).toHaveLength(1);
    expect(successful.events).toHaveLength(0); expect(successful.opportunities[0]?.earned).toBe(0);
  });

  it("explicit action during provider await makes the pending response stale", async () => {
    const gate = deferred<AICharacterResponse>(); const h = (await harness({ generateCharacterResponse: async () => gate.promise }));
    const pending = h.say("รอคำตอบ"); const rejected = expect(pending).rejects.toThrow("REVISION_CONFLICT");
    (await h.action({ kind: "DECISION", opportunityId: "d1", choiceId: "verify" }));
    (await h.action({ kind: "PROGRESS", transitionId: "review-sms" }));
    const before = (await h.current()); gate.resolve(response()); await rejected;
    expect((await h.current())).toEqual(before); expect((await h.current()).messages).toHaveLength(0);
  });

  it("retrying the same turn returns the receipt without another provider call or revision", async () => {
    const provider = new MockScenarioModelProvider(); const h = (await harness(provider));
    const request = { sessionId: "s", ownerId: "u", turnId: "same", expectedRevision: 0, text: "สวัสดี" };
    const first = await h.dialogue.sendMessage(request); const before = (await h.current());
    const retry = await h.dialogue.sendMessage(request);
    expect(retry.turn).toEqual(first.turn); expect(retry.duplicate).toBe(true);
    expect((await h.current())).toEqual(before); expect(provider.callCount).toBe(1);
    await expect(h.dialogue.sendMessage({ ...request, text: "คนละคำถาม" })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(provider.callCount).toBe(1);
  });

  it("expired and wrong-owner sessions do not call the provider", async () => {
    const provider = new MockScenarioModelProvider(); const h = (await harness(provider));
    await expect(h.dialogue.sendMessage({ sessionId: "s", ownerId: "other", turnId: "bad", expectedRevision: 0, text: "ทดสอบ" })).rejects.toThrow("SESSION_NOT_FOUND");
    h.setTime(1000 + 30 * 60_000);
    await expect(h.say("สวัสดี")).rejects.toThrow("SESSION_NOT_ACTIVE");
    expect(provider.callCount).toBe(0);
  });

  it("expiry during provider await does not record stale dialogue", async () => {
    const gate = deferred<AICharacterResponse>(); const h = (await harness({ generateCharacterResponse: async () => gate.promise }));
    const pending = h.say("รอคำตอบ"); const rejected = expect(pending).rejects.toThrow("SESSION_NOT_ACTIVE");
    h.setTime(1000 + 30 * 60_000); gate.resolve(response()); await rejected;
    expect((await h.current()).status).toBe("EXPIRED"); expect((await h.current()).messages).toHaveLength(0);
  });

  it("dialogue resumes from persisted history with another orchestrator", async () => {
    const h = (await harness()); await h.say("คำถามก่อน refresh"); const before = (await h.current());
    const restoredCore = (await TrainingCore.create([], h.repository, () => 1000));
    const contexts: ScenarioAIContext[] = [];
    const provider: ScenarioModelProvider = { async generateCharacterResponse(context) { contexts.push(context); return response(); } };
    const restored = new ScenarioDialogueOrchestrator(restoredCore, provider);
    await restored.sendMessage({ sessionId: "s", ownerId: "u", turnId: "after", expectedRevision: before.revision, text: "คำถามหลัง refresh" });
    expect(contexts[0]!.recentSanitizedMessages).toHaveLength(2);
    expect((await h.current()).state).toBe(before.state); expect((await h.current()).dialogueTurns).toHaveLength(2);
  });

  it("late resolution of a timed-out provider cannot add messages after fallback", async () => {
    vi.useFakeTimers(); const gate = deferred<AICharacterResponse>(); const h = (await harness({ generateCharacterResponse: async () => gate.promise }));
    const pending = h.say("รอคำตอบ"); await vi.advanceTimersByTimeAsync(40_000); await pending;
    const before = (await h.current()); gate.resolve(response({ character_message: "late response" }));
    await Promise.resolve(); await Promise.resolve();
    expect((await h.current())).toEqual(before);
  });
});
