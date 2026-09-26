import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createApplication } from "../src/application/composition.js";
import type { PublicActionPayload } from "../src/application/contracts.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { validateTemplate } from "../src/domain/template-validator.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";
import { additionalScamScenarios } from "../src/fixtures/scam-scenarios.js";

type App = Awaited<ReturnType<typeof createApplication>>;
const learner = { id: "learner" };

async function start(app: App, scenarioId: string) {
  return (await app.start(scenarioId, learner, { startId: randomUUID(), expectedRevision: 0 })).session;
}
async function act(app: App, session: Awaited<ReturnType<App["resume"]>>, label: string, payload: PublicActionPayload) {
  const definition = session.availableActions.find(a => a.label === label);
  if (!definition) throw new Error(`Missing public action: ${label}`);
  return (await app.action(session.sessionId, learner, { actionId: randomUUID(), expectedRevision: session.revision,
    actionDefinitionId: definition.id, payload })).session;
}
async function fullSafePath(app: App, scenarioId: string) {
  let session = await start(app, scenarioId);
  session = await act(app, session, "ตรวจสอบผู้ติดต่อ", { choiceId: "o1" });
  session = await act(app, session, "พิจารณาข้ออ้างต่อ", {});
  session = await act(app, session, "สัญญาณเตือนในข้ออ้าง", { selectedEvidenceIds: ["o1", "o2"] });
  session = await act(app, session, "พิจารณาคำขอ", {});
  session = await act(app, session, "ตอบสนองต่อคำขอ", { choiceId: "o1" });
  session = await act(app, session, "เลือกวิธีรับมือ", {});
  session = await act(app, session, "ยุติและจัดการเหตุ", { choiceId: "o1" });
  session = await act(app, session, "จบสถานการณ์", {});
  return session;
}

describe("additional playable scam scenarios", () => {
  it("publishes nine distinct text scenarios with explicit public feedback", async () => {
    const app = await createApplication(new InMemoryTrainingRepository(), new MockScenarioModelProvider());
    const listed = app.listScenarios();
    expect(listed).toHaveLength(9);
    expect(new Set(listed.map(s => s.category)).size).toBe(9);
    for (const template of additionalScamScenarios) {
      expect(validateTemplate(template)).toEqual(template);
      expect(listed.find(s => s.id === template.id)?.communicationMode).toBe("TEXT");
    }
  });

  it.each(additionalScamScenarios)("$id: full safe path, early stop, review and critical paths", async template => {
    const app = await createApplication(new InMemoryTrainingRepository(), new MockScenarioModelProvider());
    const safe = await fullSafePath(app, template.id);
    expect(safe.status).toBe("COMPLETED");
    const safeResult = await app.result(safe.sessionId, learner);
    expect(safeResult.outcome).toBe("PASSED");
    expect(safeResult.trainingScore).toBeNull();
    expect(safeResult.decisionSummary).toMatchObject({ encountered: 4, safe: 4, review: 0, unassessed: 0, critical: 0 });
    expect(safeResult.decisionSummary?.checkpoints).toHaveLength(4);
    expect(JSON.stringify(safeResult)).not.toContain("ruleId");

    let early = await start(app, template.id);
    const stop = early.availableActions.find(a => a.label.includes("อย่างปลอดภัย") && a.input === "NONE");
    expect(stop).toBeDefined();
    early = (await app.action(early.sessionId, learner, { actionId: randomUUID(), expectedRevision: early.revision,
      actionDefinitionId: stop!.id, payload: {} })).session;
    const earlyResult = await app.result(early.sessionId, learner);
    expect(earlyResult.outcome).toBe("PASSED");
    expect(earlyResult.decisionSummary?.encountered).toBe(0);

    let review = await start(app, template.id);
    review = await act(app, review, "ตรวจสอบผู้ติดต่อ", { choiceId: "o3" });
    review = await act(app, review, "พิจารณาข้ออ้างต่อ", {});
    review = await act(app, review, "สัญญาณเตือนในข้ออ้าง", { selectedEvidenceIds: ["o1", "o2"] });
    review = await act(app, review, "พิจารณาคำขอ", {});
    review = await act(app, review, "ตอบสนองต่อคำขอ", { choiceId: "o1" });
    review = await act(app, review, "เลือกวิธีรับมือ", {});
    review = await act(app, review, "ยุติและจัดการเหตุ", { choiceId: "o1" });
    review = await act(app, review, "จบสถานการณ์", {});
    expect((await app.result(review.sessionId, learner)).outcome).toBe("NEEDS_PRACTICE");

    let critical = await start(app, template.id);
    critical = await act(app, critical, "ตรวจสอบผู้ติดต่อ", { choiceId: "o1" });
    critical = await act(app, critical, "พิจารณาข้ออ้างต่อ", {});
    critical = await act(app, critical, "สัญญาณเตือนในข้ออ้าง", { selectedEvidenceIds: ["o1", "o2"] });
    critical = await act(app, critical, "พิจารณาคำขอ", {});
    critical = await act(app, critical, template.criticalFailureRules[0]!.publicLabel!, { confirmed: true });
    expect(critical.status).toBe("FAILED");
    const criticalResult = await app.result(critical.sessionId, learner);
    expect(criticalResult.outcome).toBe("CRITICAL_FAILURE");
    expect(criticalResult.decisionSummary?.critical).toBe(1);
    expect(criticalResult.decisionSummary?.checkpoints?.at(-1)?.assessment).toBe("CRITICAL");
  });

  it("shows progression only after required checkpoints while allowing the early safe stop", async () => {
    const app = await createApplication(new InMemoryTrainingRepository(), new MockScenarioModelProvider());
    let session = await start(app, "investment-scam");
    expect(session.availableActions.map(a => a.label)).toContain("ยุติการติดต่ออย่างปลอดภัย");
    expect(session.availableActions.map(a => a.label)).not.toContain("พิจารณาข้ออ้างต่อ");
    session = await act(app, session, "ตรวจสอบผู้ติดต่อ", { choiceId: "o1" });
    expect(session.availableActions.map(a => a.label)).toContain("พิจารณาข้ออ้างต่อ");
    session = await act(app, session, "พิจารณาข้ออ้างต่อ", {});
    expect(session.availableActions.map(a => a.label)).not.toContain("พิจารณาคำขอ");
    session = await act(app, session, "สัญญาณเตือนในข้ออ้าง", { selectedEvidenceIds: ["o1", "o2"] });
    expect(session.availableActions.map(a => a.label)).toContain("พิจารณาคำขอ");
  });

  it("mock dialogue uses the selected scenario context instead of parcel SMS copy", async () => {
    const app = await createApplication(new InMemoryTrainingRepository(), new MockScenarioModelProvider());
    const session = await start(app, "investment-scam");
    const reply = await app.message(session.sessionId, learner, { turnId: randomUUID(), expectedRevision: 0, text: "ขอตรวจสอบ" });
    expect(reply.turn.characterMessage).toContain("ลงทุน");
    expect(reply.turn.characterMessage).not.toContain("พัสดุ");
  });
});
