import { z } from "zod";
import type { ScenarioTemplate } from "../domain/schema.js";
import type { TrainingSession } from "../domain/types.js";
import type { ActionInput } from "../domain/training-action.js";
import type { PublicActionDefinition, PublicActionPayload, PublicScenario } from "./contracts.js";
import { ApplicationError } from "./errors.js";
import { transitionAvailable } from "../domain/state-machine.js";
import { smsPhishingFeedbackFixture } from "../fixtures/sms-phishing-feedback.js";
import { additionalScamScenarios } from "../fixtures/scam-scenarios.js";

// Presentation-only bindings. Core templates own assessments, events and guards.
export const playableTemplate = smsPhishingFeedbackFixture;
export const playableTemplates: ScenarioTemplate[] = [playableTemplate, ...additionalScamScenarios];
const labels: Record<string, string[]> = {
  d1: ["ตรวจสอบผู้ส่งจากช่องทางอื่น", "รอดูข้อมูลเพิ่มเติม", "เชื่อชื่อที่แสดงของผู้ส่ง"],
  d2: ["ปฏิเสธการให้ข้อมูล", "สอบถามผู้ส่งข้อความ", "ดำเนินการต่อจากข้อความ"],
  d3: ["ตรวจสอบกับช่องทางทางการ", "สอบถามเพื่อน", "ข้ามการตรวจสอบที่มา"],
  s1: ["ตรวจสอบ ยุติการติดต่อ และรายงาน", "ยุติการติดต่อ", "ปิดข้อความ"],
};
type Binding = {
  public: PublicActionDefinition;
  state: TrainingSession["state"];
  opportunityId?: string;
  transitionId?: string;
  toDomain(payload: PublicActionPayload): ActionInput;
};
function payload<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApplicationError("INVALID_REQUEST");
  return result.data;
}
const none = z.strictObject({});
export function publicScenario(t: ScenarioTemplate): PublicScenario {
  return { id: t.id, category: t.category, title: t.title,
    description: t.description ?? "ฝึกตรวจข้อความเกี่ยวกับพัสดุสมมติ และเลือกการตอบสนองในสถานการณ์ SMS / Phishing",
    learningObjectives: [...t.learningObjectives], communicationMode: "TEXT" };
}
export function actionBindings(t: ScenarioTemplate): Binding[] {
  if (t.id !== playableTemplate.id) return genericBindings(t);
  if (t.id !== playableTemplate.id || ![2, 3, 4].includes(t.version) || t.variant !== "DEFAULT") throw new ApplicationError("SCENARIO_NOT_FOUND");
  const result: Binding[] = [];
  for (const [internalId, publicId] of [["d1", "a01"], ["w1", "a03"], ["d2", "a05"], ["d3", "a07"], ["s1", "a08"], ["w-extra", "a11"]]) {
    const o = t.opportunities.find(o => o.id === internalId)!;
    const options = o.skill === "W"
      ? o.evidence.map((e, i) => ({ id: `o${i + 1}`, label: e.text }))
      : (o.skill === "D" ? o.choices : o.actions).map((_c, i) => ({ id: `o${i + 1}`, label: labels[o.id]![i]! }));
    result.push({ state: o.state, opportunityId: o.id,
      public: { id: publicId!, label: o.skill === "W" ? "เลือกหลักฐานที่เห็นว่าน่าสงสัย" : "เลือกการตอบสนอง", input: o.skill === "W" ? "EVIDENCE" : "CHOICE", options },
      toDomain(input) {
        if (o.skill === "W") {
          const selected = payload(z.strictObject({ selectedEvidenceIds: z.array(z.string()).max(100) }), input).selectedEvidenceIds;
          return { kind: "WARNING_FINALIZE", opportunityId: o.id, selectedEvidenceIds: selected.map(id => {
            const index = options.findIndex(c => c.id === id);
            if (index < 0) throw new ApplicationError("INVALID_ACTION");
            return o.evidence[index]!.id;
          }) };
        }
        const choiceId = payload(z.strictObject({ choiceId: z.string() }), input).choiceId;
        const index = options.findIndex(c => c.id === choiceId);
        if (index < 0) throw new ApplicationError("INVALID_ACTION");
        return o.skill === "D" ? { kind: "DECISION", opportunityId: o.id, choiceId: o.choices[index]!.id }
          : { kind: "SAFE_ACTION", opportunityId: o.id, actionId: o.actions[index]!.id };
      },
    });
  }
  for (const [internalId, publicId, label] of [
    ["review-sms", "a02", "ดูข้อความ"], ["inspect-link", "a04", "พิจารณาคำขอในข้อความ"],
    ["verify-and-close", "a06", "ไปขั้นตอนตอบสนอง"], ["resolve", "a09", "จบแบบฝึก"],
    ["extra-message", "a10", "อ่านข้อความเพิ่มเติม"], ["continue-link", "a14", "พิจารณาคำขอในข้อความ"],
  ]) {
    const state = t.states.find(s => s.transitions.some(edge => edge.id === internalId))!;
    result.push({ state: state.id, public: { id: publicId!, label: label!, input: "NONE", options: [] },
      toDomain(input) { payload(none, input); return { kind: "PROGRESS", transitionId: internalId! }; } });
  }
  if (t.evaluationMode === "DECISION_RULES_V1") {
    result.push({ state: "contact", public: { id: "a15", label: "ยุติการติดต่ออย่างปลอดภัย", input: "NONE", options: [] },
      toDomain(input) { payload(none, input); return { kind: "PROGRESS", transitionId: "end-contact-early" }; } });
  }
  for (const [ruleId, publicId, label] of [
    ["confirm-simulated-otp", "a12", "ยืนยันการส่งรหัส OTP จำลอง (ไม่ใช้รหัสจริง)"],
    ["confirm-simulated-password", "a13", "ยืนยันการกรอกรหัสผ่านจำลอง (ไม่ใช้รหัสจริง)"],
  ]) {
    const rule = t.criticalFailureRules.find(r => r.id === ruleId)!;
    result.push({ state: rule.state, opportunityId: rule.opportunityId,
      public: { id: publicId!, label: label!, input: "CONFIRM", options: [] },
      toDomain(input) { return { kind: "SIMULATED_ACTION", ruleId: rule.id,
        confirmed: payload(z.strictObject({ confirmed: z.boolean() }), input).confirmed }; } });
  }
  return result;
}

function genericBindings(t: ScenarioTemplate): Binding[] {
  if (!t.publicActionBindings || !playableTemplates.some(candidate => candidate.id === t.id && candidate.version === t.version && candidate.variant === t.variant)) {
    throw new ApplicationError("SCENARIO_NOT_FOUND");
  }
  const result: Binding[] = [];
  for (const [position, o] of t.opportunities.entries()) {
    const options = o.skill === "W" ? o.evidence.map((item, index) => ({ id: `o${index + 1}`, label: item.text }))
      : (o.skill === "D" ? o.choices : o.actions).map((choice, index) => ({ id: `o${index + 1}`, label: choice.publicLabel! }));
    result.push({ state: o.state, opportunityId: o.id,
      public: { id: `a${String(position + 1).padStart(2, "0")}`, label: o.publicCheckpointLabel!,
        input: o.skill === "W" ? "EVIDENCE" : "CHOICE", options },
      toDomain(input) {
        if (o.skill === "W") {
          const selected = payload(z.strictObject({ selectedEvidenceIds: z.array(z.string()).max(100) }), input).selectedEvidenceIds;
          return { kind: "WARNING_FINALIZE", opportunityId: o.id, selectedEvidenceIds: selected.map(id => {
            const index = options.findIndex(option => option.id === id);
            if (index < 0) throw new ApplicationError("INVALID_ACTION");
            return o.evidence[index]!.id;
          }) };
        }
        const selected = payload(z.strictObject({ choiceId: z.string() }), input).choiceId;
        const index = options.findIndex(option => option.id === selected);
        if (index < 0) throw new ApplicationError("INVALID_ACTION");
        return o.skill === "D" ? { kind: "DECISION", opportunityId: o.id, choiceId: o.choices[index]!.id }
          : { kind: "SAFE_ACTION", opportunityId: o.id, actionId: o.actions[index]!.id };
      },
    });
  }
  let next = t.opportunities.length + 1;
  for (const state of t.states) for (const edge of state.transitions) {
    result.push({ state: state.id, transitionId: edge.id, public: { id: `a${String(next++).padStart(2, "0")}`, label: edge.publicLabel!, input: "NONE", options: [] },
      toDomain(input) { payload(none, input); return { kind: "PROGRESS", transitionId: edge.id }; } });
  }
  for (const rule of t.criticalFailureRules) {
    result.push({ state: rule.state, opportunityId: rule.opportunityId,
      public: { id: `a${String(next++).padStart(2, "0")}`, label: rule.publicLabel!, input: "CONFIRM", options: [] },
      toDomain(input) { return { kind: "SIMULATED_ACTION", ruleId: rule.id,
        confirmed: payload(z.strictObject({ confirmed: z.boolean() }), input).confirmed }; } });
  }
  return result;
}
export function availableActions(s: TrainingSession, t: ScenarioTemplate): PublicActionDefinition[] {
  if (s.status !== "ACTIVE") return [];
  return actionBindings(t).filter(b => b.state === s.state && (!b.opportunityId || s.opportunities.some(o =>
    o.definitionId === b.opportunityId && o.state === s.state && o.finalizedAt === null)) &&
    (!t.publicActionBindings || !b.transitionId || transitionAvailable(s, t, b.transitionId))).map(b => b.public);
}
