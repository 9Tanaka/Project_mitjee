import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ApplicationRuntime } from "../src/server/runtime.js";
const injected = vi.hoisted(() => ({ runtime: vi.fn() }));
vi.mock("../src/server/runtime.js", () => ({ getRuntime: injected.runtime }));
import { GET as scenarios } from "../src/app/api/scenarios/route.js";
import { GET as scenario } from "../src/app/api/scenarios/[scenarioId]/route.js";
import { POST as start } from "../src/app/api/scenarios/[scenarioId]/start/route.js";
import { GET as resume } from "../src/app/api/training/[sessionId]/route.js";
import { POST as message } from "../src/app/api/training/[sessionId]/message/route.js";
import { POST as action } from "../src/app/api/training/[sessionId]/action/route.js";
import { POST as quit } from "../src/app/api/training/[sessionId]/quit/route.js";
import { GET as result } from "../src/app/api/training/[sessionId]/result/route.js";
import { createApplication } from "../src/application/composition.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import type { TrainingRepository } from "../src/domain/training-repository.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";
import type { ScenarioModelProvider } from "../src/dialogue/contracts.js";
import type { RequestAuthenticator } from "../src/http/auth.js";
import type { AuthenticatedPrincipal } from "../src/application/contracts.js";
import { publicError } from "../src/http/errors.js";
import { DomainError } from "../src/domain/types.js";
import { sessionDto, resultDto, messageDto, mutationDto } from "../src/http/dto.js";
import { createPrismaClient } from "../src/persistence/prisma-client.js";
import { PrismaTrainingRepository } from "../src/persistence/prisma-repository.js";

// Only tests can bind an identity to a Request instance. No credential or owner header shortcut.
class TestRequestAuthenticator implements RequestAuthenticator {
  private readonly users = new WeakMap<Request, AuthenticatedPrincipal>();
  bind(request: Request, id: string) { this.users.set(request, { id }); }
  async authenticate(request: Request) { return this.users.get(request) ?? null; }
}
const handlers = { scenarios, scenario, start, resume, message, action, quit, result };
type Operation = keyof typeof handlers;
type PublicSession = z.infer<typeof sessionDto>;
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function harness(provider: ScenarioModelProvider = new MockScenarioModelProvider(), repository: TrainingRepository = new InMemoryTrainingRepository()) {
  let now = 1000;
  const app = await createApplication(repository, provider, () => now);
  const auth = new TestRequestAuthenticator();
  const runtime: ApplicationRuntime = { authenticator: auth, application: async () => app, close: async () => {} };
  injected.runtime.mockReturnValue(runtime);
  async function request(operation: Operation, id = "", body?: unknown, owner: string | null = "user-a", options: { raw?: string; query?: string; headers?: Record<string, string> } = {}) {
    const method = ["start", "message", "action", "quit"].includes(operation) ? "POST" : "GET";
    const path = operation === "scenarios" ? "/api/scenarios" : ["scenario", "start"].includes(operation)
      ? `/api/scenarios/${id}${operation === "start" ? "/start" : ""}`
      : `/api/training/${id}${operation === "resume" ? "" : `/${operation}`}`;
    const req = new Request(`http://localhost${path}${options.query ?? ""}`, {
      method, headers: { ...(method === "POST" ? { "content-type": "application/json" } : {}), ...options.headers },
      ...(method === "POST" ? { body: options.raw ?? JSON.stringify(body ?? {}) } : {}),
    });
    if (owner) auth.bind(req, owner);
    const params = ["scenario", "start"].includes(operation) ? { scenarioId: id } : operation === "scenarios" ? {} : { sessionId: id };
    return handlers[operation](req, { params: Promise.resolve(params as Record<string, string>) });
  }
  async function begin(owner = "user-a", startId = randomUUID()) {
    const response = await request("start", "sms-phishing-demo", { startId, expectedRevision: 0 }, owner);
    expect(response.status).toBe(201);
    return mutationDto.parse((await response.json()).data).session;
  }
  let sequence = 0;
  async function act(s: PublicSession, actionDefinitionId: string, payload: unknown = {}, actionId = `action-${++sequence}`) {
    return request("action", s.sessionId, { actionId, expectedRevision: s.revision, actionDefinitionId, payload });
  }
  async function step(s: PublicSession, definition: string, payload: unknown = {}) {
    const response = await act(s, definition, payload);
    expect(response.status).toBe(200);
    return mutationDto.parse((await response.json()).data).session;
  }
  async function say(s: PublicSession, turnId = `turn-${++sequence}`, text = "ขอตรวจสอบข้อความ") {
    return request("message", s.sessionId, { turnId, expectedRevision: s.revision, text });
  }
  async function toRequest() {
    let s = await begin();
    for (const [id, payload] of safeSteps.slice(0, 4)) s = await step(s, id, payload);
    return s;
  }
  return { request, begin, act, step, say, toRequest, repository, provider, runtime, auth,
    raw: (s: PublicSession, owner = "user-a") => repository.get(s.sessionId, owner),
    setTime: (time: number) => { now = time; } };
}
const safeSteps: [string, unknown][] = [
  ["a01", { choiceId: "o1" }], ["a02", {}], ["a03", { selectedEvidenceIds: ["o1", "o2"] }],
  ["a04", {}], ["a05", { choiceId: "o1" }], ["a06", {}], ["a07", { choiceId: "o1" }],
  ["a08", { choiceId: "o1" }], ["a09", {}],
];
function assertPublic(value: unknown) {
  const forbidden = new Set(["ownerId", "configuration", "states", "transitions", "target", "targetState", "ruleId", "eventCode", "eventCodes",
    "allowedEventCodes", "criticalFailureRules", "requiresFinalized", "requiresEvents", "guardRuleIds", "opportunities", "earned", "eligibleMaximum",
    "score", "rating", "warningSignId", "correctWarningSignIds", "characterRole", "allowedBehaviors", "forbiddenBehaviors", "fallbackMessage",
    "candidate_event", "event_code", "confidence", "failureReason", "attempts", "inputKey", "criticalEventIds", "templateVersion"]);
  if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
    expect(forbidden.has(key), `Forbidden public field: ${key}`).toBe(false); assertPublic(child);
  }
}

describe("HTTP Route Handler integration", () => {
  it.each(Object.keys(handlers) as Operation[])("unauthenticated %s returns 401 before database initialization", async operation => {
    const h = await harness(); const init = vi.spyOn(h.runtime, "application");
    const response = await h.request(operation, "opaque-id", {}, null, { headers: { "x-owner-id": "user-a", authorization: "Bearer test-only" } });
    expect(response.status).toBe(401); expect(init).not.toHaveBeenCalled();
  });
  it("lists/details playable scenarios using an explicit projection", async () => {
    const h = await harness();
    for (const op of ["scenarios", "scenario"] as const) {
      const r = await h.request(op, "sms-phishing-demo"); expect(r.status).toBe(200);
      assertPublic(await r.json()); expect(r.headers.get("cache-control")).toBe("no-store");
    }
    expect((await h.request("scenario", "unknown")).status).toBe(404);
    expect((await h.request("start", "unknown", { startId: randomUUID(), expectedRevision: 0 })).status).toBe(404);
  });
  it("start binds authenticated owner, fixes version and handles concurrent start retries", async () => {
    const h = await harness(); const input = { startId: randomUUID(), expectedRevision: 0 };
    const replies = await Promise.all([h.request("start", "sms-phishing-demo", input), h.request("start", "sms-phishing-demo", input)]);
    expect(replies.map(r => r.status).sort()).toEqual([200, 201]);
    const [first, second] = await Promise.all(replies.map(async r => mutationDto.parse((await r.json()).data)));
    expect(first!.session.sessionId).toBe(second!.session.sessionId);
    const stored = await h.raw(first!.session); expect(stored.ownerId).toBe("user-a"); expect(stored.templateVersion).toBe(4);
    expect(first!.session.revision).toBe(0);
    const other = await h.begin("user-b", input.startId); expect(other.sessionId).not.toBe(first!.session.sessionId);
  });
  it("lists nine playable categories and starts another scenario through the same authenticated API", async () => {
    const h = await harness();
    const catalog = (await (await h.request("scenarios")).json()).data as { id: string; category: string }[];
    expect(catalog).toHaveLength(9);
    expect(new Set(catalog.map(item => item.category)).size).toBe(9);
    const response = await h.request("start", "investment-scam", { startId: randomUUID(), expectedRevision: 0 });
    expect(response.status).toBe(201);
    const started = mutationDto.parse((await response.json()).data).session;
    expect(started.scenario.id).toBe("investment-scam");
    const stop = started.availableActions.find(action => action.label === "ยุติการติดต่ออย่างปลอดภัย");
    expect(stop).toBeDefined();
    const completed = await h.step(started, stop!.id);
    expect(completed.status).toBe("COMPLETED");
    const result = resultDto.parse((await (await h.request("result", completed.sessionId)).json()).data);
    expect(result.outcome).toBe("PASSED");
    expect(result.decisionSummary?.encountered).toBe(0);
  });
  it.each(["ownerId", "score", "targetState", "version", "variant"])("rejects spoofed start field %s", async field => {
    const h = await harness();
    expect((await h.request("start", "sms-phishing-demo", { startId: randomUUID(), expectedRevision: 0, [field]: "injected" })).status).toBe(400);
  });
  it.each(["resume", "message", "action", "quit", "result"] as const)("owner isolation for %s uses identical 404 for missing/foreign resources", async op => {
    const h = await harness(); const s = await h.begin("user-b"); const before = await h.raw(s, "user-b");
    const bodies = { resume: undefined, result: undefined, message: { turnId: "t1", expectedRevision: 0, text: "hello" },
      action: { actionId: "a1", expectedRevision: 0, actionDefinitionId: "a01", payload: { choiceId: "o1" } }, quit: { actionId: "q1", expectedRevision: 0 } };
    const foreign = await h.request(op, s.sessionId, bodies[op]); const missing = await h.request(op, "missing", bodies[op]);
    expect(foreign.status).toBe(404); expect(await foreign.json()).toEqual(await missing.json());
    expect(await h.raw(s, "user-b")).toEqual(before);
  });
  it("resumes and completes a multi-turn safe path with categorical result", async () => {
    const h = await harness(); let s = await h.begin();
    expect(sessionDto.parse((await (await h.request("resume", s.sessionId)).json()).data)).toEqual(s);
    expect((await h.request("result", s.sessionId)).status).toBe(404);
    for (const [id, payload] of safeSteps) {
      const r = await h.say(s); expect(r.status).toBe(200);
      const data = messageDto.parse((await r.json()).data); assertPublic(data); s = data.session;
      s = await h.step(s, id, payload); assertPublic(s);
    }
    expect(s.status).toBe("COMPLETED"); expect(s.availableActions).toEqual([]);
    const r = resultDto.parse((await (await h.request("result", s.sessionId)).json()).data);
    expect(r.evaluationMode).toBe("DECISION_RULES_V1");
    expect(r.outcome).toBe("PASSED");
    expect(r.decisionSummary).toMatchObject({ encountered: 5, safe: 5, review: 0, unassessed: 0 });
    expect(r.decisionSummary?.checkpoints).toHaveLength(5);
    expect(r.decisionSummary?.checkpoints?.[0]?.ruleRef).toMatch(/^R-[a-f0-9]{16}$/);
    expect(JSON.stringify(r)).not.toContain('"ruleId"');
    expect(JSON.stringify(r)).not.toContain('"checkpointId"');
    expect(JSON.stringify(r)).not.toContain("d1:trust-display-name");
    expect([r.D, r.W, r.S, r.trainingScore]).toEqual([null, null, null, null]); assertPublic(r);
    const raw = await h.raw(s); expect(raw.opportunities.some(o => o.definitionId === "w-extra")).toBe(false);
    expect(raw.opportunities.find(o => o.definitionId === "w1")!.incorrectEvidenceIds).toEqual([]);
    expect((await h.act(s, "a01", { choiceId: "o1" })).status).toBe(422);
    expect((await h.say(s)).status).toBe(422);
  });
  it("several turns do not advance or score, and required checkpoints cannot be skipped", async () => {
    const h = await harness(); let s = await h.begin(); const before = await h.raw(s);
    for (let i = 0; i < 3; i++) s = messageDto.parse((await (await h.say(s)).json()).data).session;
    const raw = await h.raw(s); expect(raw.state).toBe(before.state); expect(raw.opportunities).toEqual(before.opportunities); expect(raw.events).toEqual([]);
    const r = await h.act(s, "a02"); expect(r.status).toBe(422); expect((await r.json()).error.code).toBe("INVALID_STATE");
    expect(await h.raw(s)).toEqual(raw);
  });
  it("free text cannot cause failure; explicit simulated confirmation does", async () => {
    const h = await harness(); let s = await h.toRequest();
    s = messageDto.parse((await (await h.say(s, "ambiguous", "เขาขอให้ผมส่งรหัสผ่าน")).json()).data).session;
    expect(s.status).toBe("ACTIVE"); assertPublic(s);
    expect((await h.act(s, "a13", { confirmed: false })).status).toBe(422);
    s = await h.step(s, "a13", { confirmed: true }); expect(s.status).toBe("FAILED");
    const r = resultDto.parse((await (await h.request("result", s.sessionId)).json()).data);
    expect(r.outcome).toBe("CRITICAL_FAILURE"); expect(r.trainingScore).toBeNull(); assertPublic(r);
  });
  it("high-confidence critical hints cannot cause failure through HTTP", async () => {
    const h = await harness(new MockScenarioModelProvider([{ kind: "response", response: {
      character_message: "ข้อความสมมติ", observed_intent: "unknown", candidate_event: "POSSIBLE_CRITICAL_FAILURE",
      event_code: "DISCLOSE_OTP", confidence: 100, safety: { contains_real_pii: false, out_of_scope: false },
    } }]));
    const s = await h.toRequest(); const before = await h.raw(s);
    const r = await h.say(s); expect(r.status).toBe(200); assertPublic(await r.json());
    const after = await h.raw(s); expect(after.status).toBe("ACTIVE"); expect(after.events).toEqual(before.events);
    expect(after.opportunities).toEqual(before.opportunities); expect(after.result).toBeNull();
  });
  it.each(["revision", "expiry"])("pending provider reply cannot commit after %s changes", async reason => {
    let release!: () => void; let started!: () => void;
    const entered = new Promise<void>(r => { started = r; });
    const gate = new Promise<void>(r => { release = r; });
    const h = await harness({ async generateCharacterResponse() {
      started(); await gate;
      return { character_message: "คำตอบล่าช้า", observed_intent: "continue", candidate_event: "NONE", event_code: null,
        confidence: null, safety: { contains_real_pii: false, out_of_scope: false } };
    } });
    const s = await h.begin(); const pending = h.say(s); await entered;
    if (reason === "expiry") h.setTime(1000 + 30 * 60_000);
    else await h.step(s, "a01", { choiceId: "o1" });
    const before = await h.raw(s); release(); const response = await pending;
    expect(response.status).toBe(reason === "expiry" ? 410 : 409);
    const after = await h.raw(s); expect(after.messages).toEqual([]); expect(after.dialogueTurns).toEqual([]);
    expect(after.actions).toEqual(before.actions); expect(after.events).toEqual(before.events);
    expect(after.opportunities).toEqual(before.opportunities);
  });
  it("sanitized-equivalent retries preserve the original dialogue receipt", async () => {
    const mock = new MockScenarioModelProvider(); const h = await harness(mock); const s = await h.begin();
    const first = messageDto.parse((await (await h.say(s, "sanitize-retry", `password ${randomUUID()}`)).json()).data);
    const again = messageDto.parse((await (await h.say(s, "sanitize-retry", `password ${randomUUID()}`)).json()).data);
    expect(again.turn).toEqual(first.turn); expect(again.duplicate).toBe(true); expect(mock.callCount).toBe(1);
  });
  it("retrying the final action does not create a second result", async () => {
    const h = await harness(); let s = await h.begin();
    for (const [id, payload] of safeSteps.slice(0, -1)) s = await h.step(s, id, payload);
    expect((await h.act(s, "a09", {}, "finish-once")).status).toBe(200); const before = await h.raw(s);
    const retry = await h.act(s, "a09", {}, "finish-once"); expect(retry.status).toBe(200);
    expect((await retry.json()).data.duplicate).toBe(true); expect(await h.raw(s)).toEqual(before);
  });
  it("risky choices request further practice without critical failure", async () => {
    const h = await harness(); let s = await h.begin();
    for (const [id, p] of safeSteps) {
      const payload = id === "a03" ? { selectedEvidenceIds: [] } : "choiceId" in (p as object) ? { choiceId: "o3" } : p;
      s = await h.step(s, id, payload);
    }
    const r = resultDto.parse((await (await h.request("result", s.sessionId)).json()).data);
    expect(r.outcome).toBe("NEEDS_PRACTICE"); expect(r.trainingScore).toBeNull();
    expect(r.decisionSummary?.review).toBeGreaterThan(0);
  });
  it("two requests at one revision have one winner and no partial loser", async () => {
    const h = await harness(); const s = await h.begin();
    const replies = await Promise.all([h.act(s, "a01", { choiceId: "o1" }, "first"), h.act(s, "a01", { choiceId: "o2" }, "second")]);
    expect(replies.map(r => r.status).sort()).toEqual([200, 409]);
    const raw = await h.raw(s); expect(raw.revision).toBe(1); expect(raw.actions).toHaveLength(1); expect(raw.events.length).toBeLessThanOrEqual(1);
    for (const op of ["message", "action", "quit"] as const) {
      const stale = op === "message" ? await h.say(s) : op === "action" ? await h.act(s, "a02") : await h.request("quit", s.sessionId, { actionId: "q", expectedRevision: 0 });
      expect(stale.status).toBe(409); expect((await stale.json()).error.code).toBe("REVISION_CONFLICT");
      expect(await h.raw(s)).toEqual(raw);
    }
  });
  it("duplicate action replays after state change; changed payload conflicts", async () => {
    const h = await harness(); const original = await h.begin();
    let s = mutationDto.parse((await (await h.act(original, "a01", { choiceId: "o1" }, "once")).json()).data).session;
    s = await h.step(s, "a02"); const before = await h.raw(s);
    const retry = await h.act(original, "a01", { choiceId: "o1" }, "once"); expect(retry.status).toBe(200);
    expect((await retry.json()).data.duplicate).toBe(true); expect(await h.raw(s)).toEqual(before);
    expect((await h.act(original, "a01", { choiceId: "o2" }, "once")).status).toBe(409);
  });
  it("duplicate dialogue returns the original turn and does not call provider again", async () => {
    const provider = new MockScenarioModelProvider(); const h = await harness(provider); const s = await h.begin();
    const first = messageDto.parse((await (await h.say(s, "same", "hello")).json()).data); const before = await h.raw(s);
    const retry = messageDto.parse((await (await h.say(s, "same", "hello")).json()).data);
    expect(retry.turn).toEqual(first.turn); expect(retry.duplicate).toBe(true); expect(provider.callCount).toBe(1); expect(await h.raw(s)).toEqual(before);
    expect((await h.say(s, "same", "different")).status).toBe(409);
  });
  it("quit uses Core, replays idempotently, and has no official result", async () => {
    const h = await harness(); const s = await h.begin(); const body = { actionId: "quit-once", expectedRevision: 0 };
    const first = await h.request("quit", s.sessionId, body); expect(first.status).toBe(200);
    expect((await first.json()).data.session.status).toBe("ABANDONED"); const before = await h.raw(s);
    expect((await (await h.request("quit", s.sessionId, body)).json()).data.duplicate).toBe(true);
    expect(await h.raw(s)).toEqual(before); expect((await h.request("result", s.sessionId)).status).toBe(404);
  });
  it.each(["resume", "message", "action", "quit", "result"] as const)("expired %s returns 410", async op => {
    const h = await harness(); const s = await h.begin(); h.setTime(1000 + 30 * 60_000);
    const bodies = { resume: undefined, result: undefined, message: { turnId: "t", expectedRevision: 0, text: "hello" },
      action: { actionId: "a", expectedRevision: 0, actionDefinitionId: "a01", payload: { choiceId: "o1" } }, quit: { actionId: "q", expectedRevision: 0 } };
    expect((await h.request(op, s.sessionId, bodies[op])).status).toBe(410);
    const raw = await h.raw(s); expect(raw.status).toBe("EXPIRED"); expect(raw.revision).toBe(1); expect(raw.actions).toEqual([]);
  });
  it.each(["score", "targetState", "EventCode", "nextState", "criticalFailure", "pass", "fail", "earnedPoints", "eligibleMaximum", "validationStatus", "ruleId", "ownerId"])("rejects authoritative field %s at either request depth", async field => {
    const h = await harness(); const s = await h.begin(); const before = await h.raw(s);
    const body = { actionId: "bad", expectedRevision: 0, actionDefinitionId: "a01", payload: { choiceId: "o1" } };
    expect((await h.request("action", s.sessionId, { ...body, [field]: "injected" })).status).toBe(400);
    expect((await h.request("action", s.sessionId, { ...body, payload: { ...body.payload, [field]: "injected" } })).status).toBe(400);
    expect(await h.raw(s)).toEqual(before);
  });
  it("rejects invalid JSON, text length, unknown query, malformed IDs and revision ranges", async () => {
    const h = await harness(); const s = await h.begin();
    expect((await h.request("message", s.sessionId, {}, "user-a", { raw: "{" })).status).toBe(400);
    for (const extra of [{ turnId: "bad:id" }, { expectedRevision: -1 }, { expectedRevision: 1.5 }, { expectedRevision: Number.MAX_SAFE_INTEGER + 1 }, { text: "x".repeat(8001) }, { ownerId: "other" }]) {
      expect((await h.request("message", s.sessionId, { turnId: "t", expectedRevision: 0, text: "hello", ...extra })).status).toBe(400);
    }
    expect((await h.request("resume", "bad.id")).status).toBe(400);
    expect((await h.request("resume", s.sessionId, undefined, "user-a", { query: "?ownerId=other" })).status).toBe(400);
    expect((await h.request("message", s.sessionId, {}, "user-a", { raw: "x".repeat(65537) })).status).toBe(413);
    expect((await h.request("message", s.sessionId, {}, "user-a", { headers: { "content-length": "999999" } })).status).toBe(413);
    expect((await h.raw(s)).revision).toBe(0);
  });
  it("accepts an 8000-code-unit Thai message within byte limit and blocks cross-origin writes", async () => {
    const h = await harness(); const s = await h.begin();
    expect((await h.say(s, "large", "ก".repeat(8000))).status).toBe(200);
    expect((await h.request("quit", s.sessionId, { actionId: "q", expectedRevision: 1 }, "user-a", { headers: { origin: "https://other.example" } })).status).toBe(403);
  });
  it.each(["error", "refusal", "invalid"] as const)("provider %s returns fallback without internal metadata", async kind => {
    const h = await harness(new MockScenarioModelProvider([kind === "invalid" ? { kind, output: { secretInternal: "hidden" } } : { kind }]));
    const s = await h.begin(); const r = await h.say(s); expect(r.status).toBe(200);
    const body = await r.json(); assertPublic(body); expect(JSON.stringify(body)).not.toContain("hidden");
    expect((await h.raw(s)).dialogueTurns[0]!.usedFallback).toBe(true);
  });
  it("sanitization remains in the dialogue path and provider exceptions never leak", async () => {
    const marker = randomUUID();
    const h = await harness({ async generateCharacterResponse() { throw new Error(marker); } });
    const s = await h.begin(); const text = `password ${marker}`;
    const r = await h.say(s, "redaction", text); expect(r.status).toBe(200);
    expect(JSON.stringify(await r.json()).includes(marker)).toBe(false);
    expect(JSON.stringify(await h.raw(s)).includes(marker)).toBe(false);
  });
  it("unexpected database errors are generic and not logged", async () => {
    const h = await harness(); const s = await h.begin();
    const log = vi.spyOn(console, "error"); const marker = randomUUID();
    vi.spyOn(h.repository, "get").mockRejectedValue(new Error(`Prisma SQL ${marker}`));
    const r = await h.request("resume", s.sessionId); expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: { code: "INTERNAL_ERROR", message: "Unable to process the request." } });
    expect(log).not.toHaveBeenCalled();
  });
  it("central error mapping distinguishes conflicts, validation and state errors", () => {
    expect(publicError(new DomainError("UNKNOWN_EVIDENCE")).status).toBe(422);
    expect(publicError(new DomainError("CHECKPOINT_OR_EVENT_REQUIRED")).body.error.code).toBe("INVALID_STATE");
    expect(publicError(new DomainError("REVISION_CONFLICT")).status).toBe(409);
    expect(publicError(new DomainError("INVALID_TEMPLATE", "private internals")).body.error.code).toBe("INTERNAL_ERROR");
  });
});

const mysqlUrl = process.env.MYSQL_TEST_DATABASE_URL;
it.skipIf(!mysqlUrl)("HTTP services/real MySQL complete path and persisted resume", async () => {
  if (!/^mitjee_test(?:_[a-z0-9_]+)?$/.test(new URL(mysqlUrl!).pathname.slice(1))) throw new Error("Dedicated test database required");
  const key = process.env.MYSQL_TEST_RSA_PUBLIC_KEY_PATH;
  const client = createPrismaClient(mysqlUrl!, key ? { loopbackRsaPublicKey: key } : {});
  try {
    const h = await harness(new MockScenarioModelProvider(), new PrismaTrainingRepository(client)); let s = await h.begin();
    for (const [id, payload] of safeSteps) { s = messageDto.parse((await (await h.say(s)).json()).data).session; s = await h.step(s, id, payload); }
    expect((await (await h.request("result", s.sessionId)).json()).data.outcome).toBe("PASSED");
    expect(await client.trainingResult.count({ where: { sessionId: s.sessionId } })).toBe(1);
    const restored = await harness(new MockScenarioModelProvider(), new PrismaTrainingRepository(client));
    expect((await (await restored.request("resume", s.sessionId)).json()).data).toEqual(s);
  } finally { await client.$disconnect(); }
});
