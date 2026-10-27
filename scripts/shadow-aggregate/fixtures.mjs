import { randomUUID } from "node:crypto";
import { TrainingCore } from "../../src/core.ts";
import { InMemoryTrainingRepository } from "../../src/domain/repository.ts";
import { createApplication } from "../../src/application/composition.ts";
import { registeredTemplates } from "../../src/application/catalog.ts";
import { ScenarioDialogueOrchestrator } from "../../src/dialogue/orchestrator.ts";
import { MockScenarioModelProvider } from "../../src/dialogue/mock-provider.ts";
import { IDLE_TIMEOUT_MS } from "../../src/domain/constants.ts";
import { smsPhishingFixture } from "../../src/fixtures/sms-phishing.ts";
import { smsPhishingDialogueFixture } from "../../src/fixtures/sms-phishing-dialogue.ts";
import { smsPhishingDecisionRulesFixture } from "../../src/fixtures/sms-phishing-decision-rules.ts";
import { smsPhishingFeedbackFixture } from "../../src/fixtures/sms-phishing-feedback.ts";

export const safeActions = [
  { kind: "DECISION", opportunityId: "d1", choiceId: "verify" }, { kind: "PROGRESS", transitionId: "review-sms" },
  { kind: "WARNING_FINALIZE", opportunityId: "w1", selectedEvidenceIds: ["wrong-domain", "urgency", "logo"] },
  { kind: "PROGRESS", transitionId: "inspect-link" }, { kind: "DECISION", opportunityId: "d2", choiceId: "refuse" },
  { kind: "PROGRESS", transitionId: "verify-and-close" }, { kind: "DECISION", opportunityId: "d3", choiceId: "official-channel" },
  { kind: "SAFE_ACTION", opportunityId: "s1", actionId: "verify-end-report" }, { kind: "PROGRESS", transitionId: "resolve" },
];

export function forkSnapshot(source) {
  const s = structuredClone(source), old = s.id; s.id = randomUUID(); s.ownerId = randomUUID();
  const eventId = id => id.startsWith(old + ":event:") ? s.id + id.slice(old.length) : id;
  s.actions.forEach(a => { a.sessionId = s.id; }); s.events.forEach(e => { e.sessionId = s.id; e.id = eventId(e.id); });
  if (s.result) { s.result.sessionId = s.id; s.result.criticalEventIds = s.result.criticalEventIds.map(eventId); }
  return s;
}

/** Only existing domain/application code creates the meaningful training states. */
export async function buildFixtures() {
  let clock = Date.parse("2026-10-23T12:34:56.789Z"); const now = () => clock;
  const templates = [...new Map([smsPhishingFixture, smsPhishingDialogueFixture, smsPhishingDecisionRulesFixture, smsPhishingFeedbackFixture, ...registeredTemplates]
    .map(t => [[t.id, t.version, t.variant].join("@"), t])).values()];
  const memory = new InMemoryTrainingRepository(), core = await TrainingCore.create(templates, memory, now), cases = [];
  const remember = (name, s, extra = {}) => { cases.push({ name, snapshot: forkSnapshot(s), ...extra }); };
  async function start(t) { const id = randomUUID(), owner = randomUUID(); return core.start(id, owner, t.id, t.version, t.variant); }
  async function act(s, action) { return (await core.submit({ sessionId: s.id, ownerId: s.ownerId, actionId: randomUUID(), expectedRevision: s.revision, action })).session; }
  for (const [i, t] of templates.entries()) remember(`historical-${i}-v${t.version}-${t.variant}`, await start(t));
  let completed;
  for (const t of [smsPhishingFixture, smsPhishingDialogueFixture, smsPhishingDecisionRulesFixture, smsPhishingFeedbackFixture]) {
    let s = await start(t);
    const dialogue = new ScenarioDialogueOrchestrator(core, new MockScenarioModelProvider());
    for (const [i, a] of safeActions.entries()) {
      if (t === smsPhishingDialogueFixture) {
        await dialogue.sendMessage({ sessionId: s.id, ownerId: s.ownerId, turnId: randomUUID(), expectedRevision: s.revision, text: "ขอตรวจสอบข้อมูลเพิ่มเติม" });
        s = await memory.get(s.id, s.ownerId);
        if (i === 0) remember("one-dialogue", s);
      }
      clock++; s = await act(s, a);
    }
    remember(`completed-sms-v${t.version}`, s);
    if (t === smsPhishingDialogueFixture) { completed = s; remember("physical-reverse", s, { reverse: true }); }
  }
  let s = await start(smsPhishingDialogueFixture);
  for (const a of safeActions.slice(0, 4)) s = await act(s, a);
  remember("critical-password", await act(s, { kind: "SIMULATED_ACTION", ruleId: "confirm-simulated-password", confirmed: true }));
  s = await start(smsPhishingDecisionRulesFixture); remember("categorical-zero-decisions", await act(s, { kind: "PROGRESS", transitionId: "end-contact-early" }));
  s = await start(smsPhishingDialogueFixture); remember("abandoned", await act(s, { kind: "QUIT_SESSION" }));
  s = await start(smsPhishingDialogueFixture); clock += IDLE_TIMEOUT_MS; remember("expired", await core.resume(s.id, s.ownerId));
  for (const story of ["CC-01", "CC-02", "CC-N01", "CC-N02"]) {
    const app = await createApplication(memory, new MockScenarioModelProvider(), now, undefined, () => story), owner = { id: randomUUID() };
    let ui = (await app.start("call-center", owner, { startId: randomUUID(), expectedRevision: 0 })).session;
    async function choice(label, option) {
      const a = ui.availableActions.find(a => a.label === label); if (!a) throw new Error("SHADOW_FIXTURE_ACTION_MISSING");
      ui = (await app.action(ui.sessionId, owner, { actionId: randomUUID(), expectedRevision: ui.revision, actionDefinitionId: a.id,
        payload: option ? { choiceId: a.options.find(o => o.label === option).id } : {} })).session;
    }
    const open = async () => { ui = (await app.opening(ui.sessionId, owner, { expectedRevision: ui.revision })).session; };
    await choice("รับสาย"); await open(); remember(`call-${story}-one-character`, await memory.get(ui.sessionId, owner.id)); if (ui.phone.openingStatus === "PENDING") await open();
    for (let n = 0; n < 3 && ui.phone.state === "IDENTITY_CLAIM"; n++) ui = (await app.message(ui.sessionId, owner, { turnId: randomUUID(), expectedRevision: ui.revision, text: "ขอรายละเอียดเพิ่มเติม" })).session;
    await open(); remember(`call-${story}-assessment-null`, await memory.get(ui.sessionId, owner.id));
    await choice(ui.phone.contextualDecision.label, "ฟังข้อมูลต่อโดยยังไม่ให้ข้อมูลเพิ่มเติม"); await open();
    if (ui.phone.state === "PRESSURE") { await choice(ui.phone.contextualDecision.label, "ฟังข้อมูลต่อโดยยังไม่ให้ข้อมูลเพิ่มเติม"); await open(); }
    await choice(ui.phone.contextualDecision.label, story === "CC-01" ? "ไม่ดำเนินการโอนตามคำขอ" : story === "CC-02" ? "ไม่บอกรหัสตามคำขอ" : story === "CC-N01" ? "ยืนยันช่วงจัดส่งจำลอง" : "รับทราบข้อมูลรายการ");
    const final = await memory.get(ui.sessionId, owner.id); remember(`call-${story}-completed`, final);
    if (story === "CC-01") {
      const short = (await app.start("call-center", owner, { startId: randomUUID(), expectedRevision: 0 })).session;
      const a = short.availableActions.find(a => a.label === "รับสาย");
      let u = (await app.action(short.sessionId, owner, { actionId: randomUUID(), expectedRevision: short.revision, actionDefinitionId: a.id, payload: {} })).session;
      const hang = u.availableActions.find(a => a.id === u.phone.hangUpActionId);
      u = (await app.action(u.sessionId, owner, { actionId: randomUUID(), expectedRevision: u.revision, actionDefinitionId: hang.id, payload: {} })).session;
      remember("call-unassessed", await memory.get(u.sessionId, owner.id));
      for (const mode of ["sql-null", "json-null", "empty-object", "empty-array", "nested-json"]) remember("result-" + mode, final, { resultVariant: mode });
    }
  }
  for (const [name, instant] of [["before-epoch", -1234], ["millisecond-boundary", Date.parse("2000-02-29T23:59:59.999Z")]]) {
    const s = forkSnapshot(completed); s.startedAt = instant; s.lastActivityAt = instant + 1000; s.endedAt = instant + 1000;
    s.actions.forEach((a, i) => { a.at = instant + i; }); s.events.forEach((e, i) => { e.at = instant + i; });
    s.messages.forEach((m, i) => { m.at = instant + i; }); s.opportunities.forEach(o => { o.openedAt = instant; if (o.finalizedAt !== null) o.finalizedAt = instant + 1; }); s.result.calculatedAt = instant + 1000;
    cases.push({ name, snapshot: s, reverse: true });
  }
  return { templates, cases, history: completed };
}

/** Collect the baseline writer's actual mappings, then insert fixture children
 * in reverse physical order within each dependency group. CREATE only. */
export function reverseFixtureInserts(repository) {
  const original = repository.writeChildren;
  repository.writeChildren = async function(tx, session, previous) {
    if (previous) throw new Error("SHADOW_CREATE_ONLY");
    const operations = [], recorder = new Proxy({}, { get(_target, model) { return {
      async create(args) { operations.push({ model, method: "create", args }); },
      async createMany(args) { operations.push({ model, method: "createMany", args }); },
    }; } });
    await original.call(this, recorder, session, previous);
    for (const model of ["trainingAction", "sessionOpportunity", "trainingEvent", "dialogueTurnReceipt", "trainingMessage", "trainingResult"]) {
      for (const op of operations.filter(o => o.model === model).reverse()) {
        if (op.method === "createMany") op.args = { ...op.args, data: [...op.args.data].reverse() };
        await tx[model][op.method](op.args);
      }
    }
  };
  return repository;
}
