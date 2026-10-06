import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createApplication } from "../src/application/composition.js";
import { registeredTemplates } from "../src/application/catalog.js";
import type { PublicActionPayload, PublicTrainingSession } from "../src/application/contracts.js";
import type { CallVariantSelector } from "../src/application/training-service.js";
import { TrainingCore } from "../src/core.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { calculateResult } from "../src/domain/scoring.js";
import { validateTemplate } from "../src/domain/template-validator.js";
import type { TrainingSession } from "../src/domain/types.js";
import type { ActionInput } from "../src/domain/training-action.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";
import { normalCallFixture } from "../src/fixtures/normal-call.js";
import { additionalScamScenarios } from "../src/fixtures/scam-scenarios.js";
import { startRequest } from "../src/public-api/contracts.js";
import { startHistoricalCall } from "./call-foundation.helpers.js";

const owner = { id: "call-learner" };
const callId = normalCallFixture.id;
const scamCall = additionalScamScenarios.find(t => t.category === "CALL_CENTER")!;
const now = () => 1000;
type App = Awaited<ReturnType<typeof createApplication>>;

async function appHarness(selector: CallVariantSelector = () => "NORMAL_CALL") {
  const repository = new InMemoryTrainingRepository();
  const app = await createApplication(repository, new MockScenarioModelProvider(), now, selector);
  const started = await app.start(callId, owner, { startId: randomUUID(), expectedRevision: 0 });
  return { app, repository, session: started.session };
}
async function historicalHarness() {
  const repository = new InMemoryTrainingRepository();
  const app = await createApplication(repository, new MockScenarioModelProvider(), now);
  const session = await startHistoricalCall(repository, app, owner, "NORMAL_CALL", now);
  return { app, repository, session };
}
async function choose(app: App, session: PublicTrainingSession, label: string, payload: PublicActionPayload = {}) {
  const action = session.availableActions.find(a => a.label === label);
  if (!action) throw new Error(`Missing public action: ${label}`);
  return (await app.action(session.sessionId, owner, { actionId: randomUUID(), expectedRevision: session.revision,
    actionDefinitionId: action.id, payload })).session;
}
async function finishNormal(app: App, session: PublicTrainingSession, options: { d1?: string; evidence?: string[]; d2?: string; ending?: string } = {}) {
  session = await choose(app, session, "ตรวจสอบผู้โทรและบริบท", { choiceId: options.d1 ?? "o1" });
  session = await choose(app, session, "พิจารณาข้อมูลการติดต่อ");
  session = await choose(app, session, "เลือกข้อมูลที่เห็นว่าเป็นสัญญาณหลอกลวง (เว้นว่างได้)", { selectedEvidenceIds: options.evidence ?? [] });
  session = await choose(app, session, "เลือกการตอบสนองต่อข้อมูลทั่วไป");
  session = await choose(app, session, "จัดการข้อมูลนัดสมมติ", { choiceId: options.d2 ?? "o1" });
  session = await choose(app, session, "เลือกวิธีจบสาย");
  session = await choose(app, session, "จบการติดต่อ", { choiceId: options.ending ?? "o1" });
  return choose(app, session, "จบสถานการณ์");
}
async function coreHarness(template = normalCallFixture) {
  const repository = new InMemoryTrainingRepository();
  const core = await TrainingCore.create([template], repository, now);
  const id = randomUUID();
  await core.start(id, owner.id, template.id, template.version, template.variant);
  const current = () => core.resume(id, owner.id);
  const act = async (action: ActionInput) => (await core.submit({ sessionId: id, ownerId: owner.id,
    actionId: randomUUID(), expectedRevision: (await current()).revision, action })).session;
  return { core, repository, id, current, act };
}

describe("backend-selected Call Center variants", () => {
  it("keeps one public Call Center among nine categories and registers two private variants", async () => {
    const { app } = await appHarness();
    const catalog = app.listScenarios();
    expect(catalog).toHaveLength(9);
    expect(new Set(catalog.map(s => s.category)).size).toBe(9);
    expect(catalog.filter(s => s.category === "CALL_CENTER")).toHaveLength(1);
    expect(catalog.filter(s => s.communicationMode === "TEXT_VOICE").map(s => s.id)).toEqual([callId]);
    expect(catalog.filter(s => s.category !== "CALL_CENTER").every(s => s.communicationMode === "TEXT")).toBe(true);
    expect([...new Set(registeredTemplates.filter(t => t.id === callId).map(t => t.variant))].sort()).toEqual(["NORMAL_CALL", "SCAM_CALL"]);
    for (const version of [1, 2]) expect(registeredTemplates.filter(t => t.id === callId && t.version === version).map(t => t.variant).sort()).toEqual(["NORMAL_CALL", "SCAM_CALL"]);
    expect(JSON.stringify(catalog)).not.toMatch(/NORMAL_CALL|SCAM_CALL|criticalFailureRules|assessmentRule/);
  });

  it.each(["NORMAL_CALL", "SCAM_CALL"] as const)("the server selector deterministically persists %s", async variant => {
    const select = vi.fn(() => variant);
    const { app, repository, session } = await appHarness(select);
    const raw = await repository.get(session.sessionId, owner.id);
    expect(raw.variant).toBe(variant);
    expect(select).toHaveBeenCalledTimes(1);
    expect(session.scenario).toEqual(app.scenario(callId));
    expect(JSON.stringify(session)).not.toContain('"variant"');
    await app.start("investment-scam", owner, { startId: randomUUID(), expectedRevision: 0 });
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("same owner/scenario/startId resumes the saved variant without rerolling", async () => {
    const repository = new InMemoryTrainingRepository();
    const select = vi.fn<CallVariantSelector>().mockReturnValueOnce("NORMAL_CALL").mockReturnValue("SCAM_CALL");
    const app = await createApplication(repository, new MockScenarioModelProvider(), now, select);
    const input = { startId: randomUUID(), expectedRevision: 0 as const };
    const first = await app.start(callId, owner, input);
    const again = await app.start(callId, owner, input);
    expect(again).toEqual({ session: first.session, duplicate: true });
    expect(select).toHaveBeenCalledTimes(1);
    expect((await repository.get(first.session.sessionId, owner.id)).variant).toBe("NORMAL_CALL");
    const reopened = await createApplication(repository, new MockScenarioModelProvider(), now, () => { throw new Error("Must not reroll"); });
    expect(await reopened.start(callId, owner, input)).toEqual(again);
    const otherOwner = { id: "other-call-learner" };
    const other = await app.start(callId, otherOwner, input);
    expect(other.session.sessionId).not.toBe(first.session.sessionId);
    expect((await repository.get(other.session.sessionId, otherOwner.id)).variant).toBe("SCAM_CALL");
  });

  it("concurrent duplicate starts with different selections return the persisted winner", async () => {
    let arrived = 0;
    let release!: () => void;
    const bothCreating = new Promise<void>(resolve => { release = resolve; });
    class RacingRepository extends InMemoryTrainingRepository {
      override async create(session: TrainingSession) {
        if (++arrived === 2) release();
        await bothCreating;
        return super.create(session);
      }
    }
    const repository = new RacingRepository();
    const select = vi.fn<CallVariantSelector>().mockReturnValueOnce("NORMAL_CALL").mockReturnValueOnce("SCAM_CALL");
    const app = await createApplication(repository, new MockScenarioModelProvider(), now, select);
    const input = { startId: randomUUID(), expectedRevision: 0 as const };
    const [first, second] = await Promise.all([app.start(callId, owner, input), app.start(callId, owner, input)]);
    expect(arrived).toBe(2);
    expect(select).toHaveBeenCalledTimes(2);
    expect([first.duplicate, second.duplicate].sort()).toEqual([false, true]);
    expect(first.session).toEqual(second.session);
    const persisted = await repository.get(first.session.sessionId, owner.id);
    expect(["NORMAL_CALL", "SCAM_CALL"]).toContain(persisted.variant);
    expect(persisted.revision).toBe(0);
    expect(persisted.actions).toEqual([]);
    expect(persisted.events).toEqual([]);
    expect(persisted.opportunities).toHaveLength(0);
    expect(persisted.state).toBe("INCOMING_CALL");
    const retry = await app.start(callId, owner, input);
    expect(retry).toEqual({ session: first.session, duplicate: true });
    expect(select).toHaveBeenCalledTimes(2);
    expect(await repository.get(first.session.sessionId, owner.id)).toEqual(persisted);
  });

  it.each(["variant", "callType", "seed", "probability", "ownerId", "model", "provider"])("rejects browser-controlled %s at the strict start boundary", field => {
    expect(startRequest.safeParse({ startId: randomUUID(), expectedRevision: 0, [field]: "NORMAL_CALL" }).success).toBe(false);
  });
});

describe("legitimate NORMAL_CALL assessment", () => {
  it("publishes a neutral fictional call with no critical rule or warning-sign evidence", () => {
    expect(validateTemplate(normalCallFixture)).toEqual(normalCallFixture);
    expect(normalCallFixture.evaluationMode).toBe("DECISION_RULES_V1");
    expect(normalCallFixture.criticalFailureRules).toEqual([]);
    const warnings = normalCallFixture.opportunities.filter(o => o.skill === "W");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.assessmentRule).toBe("NO_WARNINGS_EXPECTED");
    expect(warnings[0]!.evidence.every(e => e.warningSignId === null)).toBe(true);
    expect(normalCallFixture.states.every(s => !s.allowedEventCodes.includes("IDENTIFY_WARNING_SIGN"))).toBe(true);
    expect(normalCallFixture.fictionalOnly).toBe(true);
  });

  it.each(["o1", "o2"])("empty warning selection and appropriate ending %s yield PASSED", async ending => {
    const { app, repository, session } = await historicalHarness();
    const completed = await finishNormal(app, session, { ending });
    expect(completed.status).toBe("COMPLETED");
    const result = await app.result(completed.sessionId, owner);
    expect(result).toMatchObject({ outcome: "PASSED", evaluationMode: "DECISION_RULES_V1", trainingScore: null,
      D: null, W: null, S: null, decisionSummary: { encountered: 4, safe: 4, review: 0, unassessed: 0, critical: 0 } });
    const raw = await repository.get(completed.sessionId, owner.id);
    expect(raw.events.some(e => e.code === "IDENTIFY_WARNING_SIGN" || e.critical)).toBe(false);
    expect(raw.opportunities.find(o => o.definitionId === "w1")).toMatchObject({ assessment: "SAFE", correctWarningSignIds: [], incorrectEvidenceIds: [] });
  });

  it.each([
    { label: "unverified caller", options: { d1: "o2" }, skill: "d1" },
    { label: "neutral greeting flagged", options: { evidence: ["o1"] }, skill: "w1" },
    { label: "all neutral details flagged", options: { evidence: ["o1", "o2"] }, skill: "w1" },
    { label: "unclear fictional-information scope", options: { d2: "o2" }, skill: "d2" },
  ])("$label produces NEEDS_PRACTICE without Critical Failure", async ({ options, skill }) => {
    const { app, repository, session } = await historicalHarness();
    const completed = await finishNormal(app, session, options);
    const result = await app.result(completed.sessionId, owner);
    expect(result.outcome).toBe("NEEDS_PRACTICE");
    expect(result.decisionSummary).toMatchObject({ review: 1, critical: 0 });
    const raw = await repository.get(completed.sessionId, owner.id);
    expect(raw.opportunities.find(o => o.definitionId === skill)?.assessment).toBe("REVIEW");
    expect(raw.events.some(e => e.code === "IDENTIFY_WARNING_SIGN" || e.critical)).toBe(false);
    const warning = raw.opportunities.find(o => o.definitionId === "w1")!;
    expect(warning.correctWarningSignIds).toEqual([]);
    if (options.evidence) expect(warning.incorrectEvidenceIds).toHaveLength(options.evidence.length);
  });

  it("cannot skip a required checkpoint, while an incomplete result snapshot remains UNASSESSED", async () => {
    const h = await coreHarness();
    const before = await h.current();
    await expect(h.act({ kind: "PROGRESS", transitionId: "review-call" })).rejects.toThrow("CHECKPOINT_OR_EVENT_REQUIRED");
    expect(await h.current()).toEqual(before);
    const incomplete = structuredClone(before);
    incomplete.status = "COMPLETED";
    incomplete.state = "end_scenario";
    const result = calculateResult(incomplete, normalCallFixture, 1000);
    expect(result.outcome).toBe("UNASSESSED");
    expect(result.decisionSummary).toMatchObject({ unassessed: 1, safe: 0, review: 0 });
    await h.act({ kind: "DECISION", opportunityId: "d1", choiceId: "verify" });
    await h.act({ kind: "PROGRESS", transitionId: "review-call" });
    const warningOpen = await h.current();
    await expect(h.act({ kind: "PROGRESS", transitionId: "discuss-time" })).rejects.toThrow("CHECKPOINT_OR_EVENT_REQUIRED");
    expect(await h.current()).toEqual(warningOpen);
  });

  it("warning selection finalizes only once and stores false positives for the audit", async () => {
    const h = await coreHarness();
    await h.act({ kind: "DECISION", opportunityId: "d1", choiceId: "verify" });
    await h.act({ kind: "PROGRESS", transitionId: "review-call" });
    const command = { sessionId: h.id, ownerId: owner.id, actionId: "warning-once", expectedRevision: (await h.current()).revision,
      action: { kind: "WARNING_FINALIZE", opportunityId: "w1", selectedEvidenceIds: ["greeting"] } };
    const first = await h.core.submit(command);
    expect((await h.core.submit(command)).duplicate).toBe(true);
    expect(await h.current()).toEqual(first.session);
    await expect(h.act({ kind: "WARNING_FINALIZE", opportunityId: "w1", selectedEvidenceIds: [] })).rejects.toThrow();
    expect(await h.current()).toEqual(first.session);
    expect(first.session.opportunities.find(o => o.definitionId === "w1")).toMatchObject({ assessment: "REVIEW", incorrectEvidenceIds: ["greeting"], correctWarningSignIds: [] });
  });

  it("template publication rejects warning-sign evidence in a NO_WARNINGS_EXPECTED call", () => {
    const changed = structuredClone(normalCallFixture);
    const warning = changed.opportunities.find(o => o.skill === "W")!;
    warning.evidence[0]!.warningSignId = "invented-warning";
    expect(() => validateTemplate(changed)).toThrow("neutral evidence");
  });

  it("template publication rejects critical rules or critical allowed events in NORMAL_CALL", () => {
    const rules = structuredClone(normalCallFixture);
    rules.criticalFailureRules = structuredClone(scamCall.criticalFailureRules);
    expect(() => validateTemplate(rules)).toThrow("zero critical rules");
    const events = structuredClone(normalCallFixture);
    events.states[0]!.allowedEventCodes.push("DISCLOSE_OTP");
    expect(() => validateTemplate(events)).toThrow("cannot allow critical events");
  });

  it("ALL_WARNINGS_NO_FALSE_POSITIVES still requires real warning evidence for scam templates", () => {
    expect(validateTemplate(scamCall)).toEqual(scamCall);
    const invalid = structuredClone(scamCall);
    const warning = invalid.opportunities.find(o => o.skill === "W")!;
    expect(warning.assessmentRule).toBe("ALL_WARNINGS_NO_FALSE_POSITIVES");
    warning.evidence.forEach(e => { e.warningSignId = null; });
    expect(() => validateTemplate(invalid)).toThrow("No warning-sign maximum");
  });
});

describe("SCAM_CALL authority regression", () => {
  it("free text and high-confidence AI candidates cannot fail; explicit validated action still fails", async () => {
    const repository = new InMemoryTrainingRepository();
    const provider = new MockScenarioModelProvider([{ kind: "response", response: {
      character_message: "ข้อความสนทนาสมมติ", observed_intent: "unknown", candidate_event: "POSSIBLE_CRITICAL_FAILURE",
      event_code: "DISCLOSE_OTP", confidence: 100, safety: { contains_real_pii: false, out_of_scope: false },
    } }]);
    const app = await createApplication(repository, provider, now, () => "SCAM_CALL");
    let session = await startHistoricalCall(repository, app, owner, "SCAM_CALL", now);
    session = await choose(app, session, "ตรวจสอบผู้ติดต่อ", { choiceId: "o1" });
    session = await choose(app, session, "พิจารณาข้ออ้างต่อ");
    session = await choose(app, session, "สัญญาณเตือนในข้ออ้าง", { selectedEvidenceIds: ["o1", "o2"] });
    session = await choose(app, session, "พิจารณาคำขอ");
    const before = await repository.get(session.sessionId, owner.id);
    for (const text of ["เขาขอให้ผมส่งรหัส", "ฉันยืนยันส่ง OTP ในข้อความนี้"]) {
      session = (await app.message(session.sessionId, owner, { turnId: randomUUID(), expectedRevision: session.revision, text })).session;
    }
    const after = await repository.get(session.sessionId, owner.id);
    expect(after.status).toBe("ACTIVE");
    expect(after.state).toBe(before.state);
    expect(after.events).toEqual(before.events);
    expect(after.opportunities).toEqual(before.opportunities);
    expect(after.result).toBeNull();
    expect(after.variant).toBe("SCAM_CALL");
    const critical = session.availableActions.find(a => a.input === "CONFIRM")!;
    await expect(app.action(session.sessionId, owner, { actionId: randomUUID(), expectedRevision: session.revision,
      actionDefinitionId: critical.id, payload: { confirmed: false } })).rejects.toThrow();
    expect(await repository.get(session.sessionId, owner.id)).toEqual(after);
    session = (await app.action(session.sessionId, owner, { actionId: randomUUID(), expectedRevision: session.revision,
      actionDefinitionId: critical.id, payload: { confirmed: true } })).session;
    expect(session.status).toBe("FAILED");
    expect((await app.result(session.sessionId, owner)).outcome).toBe("CRITICAL_FAILURE");
    expect((await repository.get(session.sessionId, owner.id)).events.filter(e => e.critical)).toHaveLength(1);
  });
});
