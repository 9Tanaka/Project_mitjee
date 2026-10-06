import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { demoCallVariant } from "../src/server/call-variant.js";
import { createApplication } from "../src/application/composition.js";
import { registeredTemplates, playableTemplates } from "../src/application/catalog.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { createScenarioProvider } from "../src/server/scenario-provider.js";
import { answer, envelope } from "./openai.fixtures.js";
import type { PublicActionPayload } from "../src/application/contracts.js";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("unset demo variant leaves secure random selection to the application", () => {
  expect(demoCallVariant({})).toBeUndefined(); expect(demoCallVariant({ CALL_CENTER_DEMO_VARIANT: "" })).toBeUndefined();
});
it.each(["SCAM_CALL", "NORMAL_CALL"] as const)("accepts only a backend-owned %s override", variant => {
  expect(demoCallVariant({ CALL_CENTER_DEMO_VARIANT: variant })!()).toBe(variant);
});
it("invalid variant fails without including supplied private data in error", () => {
  expect(() => demoCallVariant({ CALL_CENTER_DEMO_VARIANT: "PRIVATE_VALUE" })).toThrow("Invalid CALL_CENTER_DEMO_VARIANT configuration");
});
it("new Call Center copy is neutral while historical template versions remain registered", () => {
  const current = playableTemplates.find(t => t.category === "CALL_CENTER")!;
  expect(current.version).toBe(6); expect(current.characterRole).not.toContain("ใช้ข้อความแทนเสียง");
  expect(registeredTemplates.filter(t => t.id === "call-center-scam").map(t => [t.version,t.variant])).toEqual(
    expect.arrayContaining([[1,"SCAM_CALL"],[1,"NORMAL_CALL"],[2,"SCAM_CALL"],[2,"NORMAL_CALL"]]));
});
it.each(["call-center-scam", "sms-phishing-demo"])("%s supports Groq text then an explicit safe result without Azure/OpenAI configuration", async scenarioId => {
  const fetcher = vi.fn().mockImplementation(async (_url, options) => {
    const body = JSON.parse(options.body), scenario = JSON.parse(body.input[0].content).scenario;
    return Response.json(envelope(answer(scenario.category === "CALL_CENTER" ? { interaction_signal: "IDENTITY_INFORMATION", conversation_status: "CONTINUE_STATE" } : {})));
  }); vi.stubGlobal("fetch", fetcher);
  const provider = createScenarioProvider({ AI_PROVIDER: "groq", GROQ_API_KEY: "synthetic-test-key", GROQ_MODEL: "openai/gpt-oss-120b" });
  const app = await createApplication(new InMemoryTrainingRepository(), provider, Date.now, demoCallVariant({ CALL_CENTER_DEMO_VARIANT: "SCAM_CALL" }));
  const user = { id: randomUUID() }, start = { startId: randomUUID(), expectedRevision: 0 as const };
  let initial = (await app.start(scenarioId, user, start)).session;
  if (scenarioId === "call-center-scam") {
    const answerCall = initial.availableActions.find(a => a.label === "รับสาย")!;
    initial = (await app.action(initial.sessionId, user, { actionId: randomUUID(), expectedRevision: initial.revision, actionDefinitionId: answerCall.id, payload: {} })).session;
    expect(initial.phone?.openingStatus).toBe("PENDING"); expect(fetcher).not.toHaveBeenCalled();
    initial = (await app.opening(initial.sessionId, user, { expectedRevision: initial.revision })).session;
  }
  const chat = await app.message(initial.sessionId, user, { turnId: randomUUID(), expectedRevision: initial.revision, text: "ขอรายละเอียดเพื่อพิจารณา" });
  expect(chat.turn.characterMessage).toBe(answer().character_message);
  expect(chat.session.currentStatePublicLabel).toBe(initial.currentStatePublicLabel);
  expect(chat.session.availableActions).toEqual(initial.availableActions);
  const body = JSON.parse(fetcher.mock.calls.at(-1)![1].body);
  expect(body).not.toHaveProperty("store"); expect(fetcher).toHaveBeenCalledTimes(scenarioId === "call-center-scam" ? 2 : 1);
  if (scenarioId === "call-center-scam") expect(JSON.parse(body.input[0].content).scenario.variant).toBe("SCAM_CALL");
  const choice: PublicActionPayload = { choiceId: "o1" }, evidence: PublicActionPayload = { selectedEvidenceIds: ["o1","o2"] };
  const steps: [string, PublicActionPayload][] = scenarioId === "call-center-scam" ? [
    ["วางสาย", {}],
  ] : [
    ["เลือกการตอบสนอง", choice], ["ดูข้อความ", {}], ["เลือกหลักฐานที่เห็นว่าน่าสงสัย", evidence],
    ["พิจารณาคำขอในข้อความ", {}], ["เลือกการตอบสนอง", choice], ["ไปขั้นตอนตอบสนอง", {}],
    ["เลือกการตอบสนอง", choice], ["เลือกการตอบสนอง", choice], ["จบแบบฝึก", {}],
  ];
  let current = chat.session;
  for (const [label,payload] of steps) {
    const action = current.availableActions.find(a => a.label === label)!;
    expect(action, label).toBeDefined();
    current = (await app.action(initial.sessionId, user, { actionId: randomUUID(), expectedRevision: current.revision, actionDefinitionId: action.id, payload })).session;
  }
  expect(current.status).toBe("COMPLETED"); expect((await app.result(initial.sessionId,user)).outcome).toBe(scenarioId === "call-center-scam" ? "UNASSESSED" : "PASSED");
  expect((await app.start(scenarioId,user,start)).duplicate).toBe(true);
});
