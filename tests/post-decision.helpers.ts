import { randomUUID } from "node:crypto";
import { createApplication } from "../src/application/composition.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";
import type { ScenarioModelProvider } from "../src/dialogue/contracts.js";
import type { PublicTrainingSession } from "../src/application/contracts.js";
import type { CallStoryId } from "../src/fixtures/call-center-foundation.js";
import { callCenterContinuousTemplates } from "../src/fixtures/call-center-continuous-stories.js";

/** Exercises production application/Core with test identity and in-memory storage only. */
export async function learningHarness(story: CallStoryId = "CC-01", provider: ScenarioModelProvider = new MockScenarioModelProvider()) {
  const repo = new InMemoryTrainingRepository(), owner = { id: randomUUID() };
  const app = await createApplication(repo, provider, Date.now, undefined, () => story);
  const template = callCenterContinuousTemplates.find(t => t.callCenter!.storyId === story)!;
  let session = (await app.start("call-center", owner, { startId: randomUUID(), expectedRevision: 0 })).session;
  const set = (value: PublicTrainingSession) => { session = value; };
  async function action(label: string, payload: { choiceId: string } | { confirmed: boolean } | Record<string, never> = {}) {
    const definition = session.availableActions.find(a => a.label === label);
    if (!definition) throw new Error("TEST_ACTION_UNAVAILABLE");
    const request = { actionId: randomUUID(), expectedRevision: session.revision, actionDefinitionId: definition.id, payload };
    const reply = await app.action(session.sessionId, owner, request); set(reply.session); return request;
  }
  async function choose(id: string) {
    const o = template.opportunities.find(o => o.state === session.phone?.state);
    const definition = session.availableActions.find(a => a.input === "CHOICE");
    const option = o?.skill === "D" ? o.choices.find(c => c.id === id) : undefined;
    const publicOption = definition?.options.find(c => c.id === `o${o?.skill === "D" ? o.choices.indexOf(option!) + 1 : 0}`);
    if (!definition || !publicOption) throw new Error("TEST_CHOICE_UNAVAILABLE");
    return action(definition.label, { choiceId: publicOption.id });
  }
  async function opening() { set((await app.opening(session.sessionId, owner, { expectedRevision: session.revision })).session); }
  async function say(text = "ขอชื่อและข้อมูลอ้างอิงหน่อย") {
    set((await app.message(session.sessionId, owner, { turnId: randomUUID(), expectedRevision: session.revision, text })).session);
  }
  async function context() {
    await action("รับสาย"); await opening();
    if (session.phone?.openingStatus === "PENDING") await opening();
    for (let i = 0; i < 4 && session.phone?.state === "IDENTITY_CLAIM"; i++) await say();
    if (session.phone?.state !== "CONTEXT_CLAIM") throw new Error("TEST_CONTEXT_NOT_REACHED");
    await opening();
  }
  async function main() {
    await context(); await choose("caution"); await opening();
    if (session.phone?.state === "PRESSURE") { await choose("caution"); await opening(); }
  }
  async function critical() {
    await main(); const parcel = story === "CC-01";
    await action(parcel ? "เปิดธนาคารจำลอง" : "เปิดข้อความ");
    await action(parcel ? "ดูรายละเอียดการโอนจำลอง" : "อ่านรหัสในข้อความจำลอง");
    await action(parcel ? "เตรียมยืนยันการโอนจำลอง" : "เตรียมยืนยันการบอกรหัสจำลอง");
    const confirm = session.availableActions.find(a => a.input === "CONFIRM");
    if (!confirm) throw new Error("TEST_CONFIRM_UNAVAILABLE");
    return action(confirm.label, { confirmed: true });
  }
  async function safe() { await main(); await choose(story === "CC-01" || story === "CC-02" ? "refuse" : story === "CC-N01" ? "confirm" : "acknowledge"); }
  return { repo, app, owner, template, action, choose, opening, say, context, main, critical, safe, set,
    session: () => session, raw: () => repo.get(session.sessionId, owner.id), result: () => app.result(session.sessionId, owner) };
}
