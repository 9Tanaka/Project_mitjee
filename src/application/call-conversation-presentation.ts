import { createHash } from "node:crypto";
import type { ScenarioTemplate } from "../domain/schema.js";
import type { TrainingAction, TrainingSession } from "../domain/types.js";
import { parseAction } from "../domain/training-action.js";
import { actionBehavior, interactionFor } from "../domain/call-behavior.js";
import type { PublicTrainingSession } from "./contracts.js";

type Phone = NonNullable<PublicTrainingSession["phone"]>;
type TranscriptTurn = NonNullable<Phone["transcript"]>[number];
type Presentation = { label: string; text: string };

// Presentation copy is authored separately from immutable published templates.
// These bindings apply only to the four current v6 stories; older sessions retain their old presentation.
const bindings = new Set([
  "call-center-parcel@6:SCAM_CALL", "call-center-bank@6:SCAM_CALL",
  "call-center-parcel@6:NORMAL_CALL", "call-center-bank@6:NORMAL_CALL",
]);
const commonChoices = {
  caution: { label: "ฟังข้อมูลต่อโดยยังไม่ให้ข้อมูลเพิ่มเติม", text: "ขอฟังรายละเอียดต่อก่อนนะครับ ตอนนี้ผมยังไม่ให้ข้อมูลเพิ่มเติม" },
  trust: { label: "เชื่อคำกล่าวอ้างของผู้โทร", text: "ผมเชื่อข้อมูลที่คุณแจ้งครับ" },
  callback: { label: "จบสายเพื่อติดต่อช่องทางที่มีอยู่เดิม", text: "ผมขอจบสายก่อน แล้วจะติดต่อผ่านช่องทางที่ผมมีอยู่เองเพื่อตรวจสอบครับ" },
  end: { label: "วางสาย", text: "ผมขอจบการสนทนาเท่านี้ครับ" },
  confirm: { label: "ยืนยันช่วงจัดส่งจำลอง", text: "ได้ครับ ยืนยันช่วงจัดส่ง 14:00–16:00 ตามเดิมครับ" },
  reschedule: { label: "ขอเปลี่ยนช่วงจัดส่ง", text: "ผมขอเปลี่ยนช่วงจัดส่งครับ มีช่วงเวลาไหนให้เลือกบ้างครับ" },
  limit: { label: "ให้เฉพาะข้อมูลจำเป็นต่อการจัดส่ง", text: "ผมขอให้เฉพาะข้อมูลที่จำเป็นสำหรับการจัดส่งครั้งนี้ครับ" },
  acknowledge: { label: "รับทราบข้อมูลรายการ", text: "รับทราบข้อมูลรายการที่แจ้งครับ" },
} as const satisfies Record<string, Presentation>;

/** Deterministic wording for a real authored choice, never inferred from assessment or dialogue. */
export function callChoicePresentation(t: ScenarioTemplate, opportunityId: string, choiceId: string): Presentation | undefined {
  if (!bindings.has(`${t.id}@${t.version}:${t.variant}`) || !t.callCenter?.continuousConversation) return;
  const opportunity = t.opportunities.find(o => o.id === opportunityId);
  if (opportunity?.skill !== "D" || !opportunity.choices.some(c => c.id === choiceId)) return;
  if (choiceId === "checked") return { label: "เปรียบเทียบกับข้อมูลในแอปของฉันแล้ว", text: t.callCenter.topic === "PARCEL"
    ? "ผมตรวจข้อมูลคำสั่งซื้อในแอปพัสดุจำลองของผมแล้วครับ ข้อมูลนี้ยังไม่ได้ยืนยันตัวตนของผู้โทร"
    : "ผมเปรียบเทียบจำนวนเงิน เวลา และรายการในแอปธนาคารจำลองของผมแล้วครับ ข้อมูลนี้ยังไม่ได้ยืนยันตัวตนของผู้โทร" };
  if (choiceId === "refuse") return t.callCenter.topic === "PARCEL"
    ? { label: "ไม่ดำเนินการโอนตามคำขอ", text: "ผมไม่โอนเงินตามคำขอนี้ครับ ขอเก็บเงินไว้และตรวจสอบข้อมูลต่อด้วยตัวเอง" }
    : { label: "ไม่บอกรหัสตามคำขอ", text: "ผมไม่บอกรหัสในข้อความให้คุณครับ ขอเก็บรหัสไว้กับตัวเอง" };
  return commonChoices[choiceId as keyof typeof commonChoices];
}

function parsed(action: TrainingAction) {
  try { return parseAction(JSON.parse(action.fingerprint)); } catch { return null; }
}
function committed(s: TrainingSession, action: TrainingAction) {
  return action.sessionId === s.id && action.validationStatus === "ACCEPTED" && action.revision >= 0 && action.revision < s.revision;
}
function committedInteraction(s: TrainingSession, action: TrainingAction) {
  // NO_EVENT is the existing successful status for phone controls/app checks
  // that do not finalize a checkpoint. It is not an accepted decision score.
  return committed(s, action) || (action.kind === "CALL_INTERACTION" && action.validationStatus === "NO_EVENT" &&
    action.sessionId === s.id && action.revision >= 0 && action.revision < s.revision);
}
function choiceForAction(s: TrainingSession, t: ScenarioTemplate, action: TrainingAction): Presentation | undefined {
  if (!committedInteraction(s, action)) return;
  const input = parsed(action);
  const opportunity = s.opportunities.find(o => o.finalizedByActionId === action.id && o.finalizedAt !== null && o.state === action.state);
  const choiceId = input?.kind === "DECISION" && opportunity?.definitionId === input.opportunityId ? input.choiceId
    : input?.kind === "CALL_INTERACTION" ? interactionFor(t, action.state, input.interactionId)?.resolutionChoiceId : undefined;
  if (opportunity && choiceId) {
    if (!committed(s, action)) return;
    const definition = t.opportunities.find(o => o.id === opportunity.definitionId && o.state === action.state);
    if (definition?.skill !== "D") return;
    // Do not claim an app check unless its accepted action precedes this committed choice.
    if (choiceId === "checked") {
      const required = definition.choices.find(c => c.id === choiceId)?.requiresBehaviors ?? [];
      if (!required.length || !required.every(code => s.actions.some(a => committedInteraction(s, a) && a.revision < action.revision && actionBehavior(a, t) === code))) return;
    }
    return callChoicePresentation(t, definition.id, choiceId);
  }
  // Hang-up/callback are persistent phone controls, including before any checkpoint has opened.
  if (input?.kind === "CALL_INTERACTION") {
    const behavior = interactionFor(t, action.state, input.interactionId)?.behavior;
    if (behavior === "HUNG_UP") return commonChoices.end;
    if (behavior === "CALLED_OFFICIAL_CHANNEL") return commonChoices.callback;
  }
}

function confirmedCritical(s: TrainingSession, t: ScenarioTemplate) {
  if (s.status !== "FAILED" || s.result?.outcome !== "CRITICAL_FAILURE" || t.variant !== "SCAM_CALL" ||
    s.result.sessionId !== s.id || s.result.templateId !== s.templateId || s.result.templateVersion !== s.templateVersion) return;
  for (const event of s.events) {
    if (!event.critical || event.authority !== "BACKEND_VALIDATED" || event.sessionId !== s.id || !s.result.criticalEventIds.includes(event.id)) continue;
    const rule = t.criticalFailureRules.find(r => r.id === event.ruleId && r.eventCode === event.code && r.state === event.state && r.opportunityId === event.opportunityId);
    const action = s.actions.find(a => a.id === event.actionId && a.kind === "SIMULATED_ACTION" && a.state === event.state && committed(s, a));
    if (!rule || !action) continue;
    const input = parsed(action);
    if (input?.kind !== "SIMULATED_ACTION" || !input.confirmed || input.ruleId !== rule.id) continue;
    if (rule.id === "CONFIRM_SIMULATED_TRANSFER" && event.code === "CONFIRM_UNVERIFIED_TRANSFER" && t.callCenter?.content?.transfer) {
      return { action, text: `ผมยืนยันโอนเงินจำลอง ${t.callCenter.content.transfer.amount.toLocaleString("th-TH")} บาทตามที่ผู้โทรแจ้ง`,
        description: "คุณยืนยันโอนเงินจำลองตามคำขอของผู้โทรที่ยังไม่ได้ตรวจสอบผ่านช่องทางอิสระ ไม่มีการโอนเงินจริงจากแบบฝึกนี้" };
    }
    if (rule.id === "SHARE_SIMULATED_OTP" && event.code === "DISCLOSE_OTP") return {
      action, text: "ผมยืนยันบอกรหัส OTP จำลองในข้อความให้ผู้โทร", description: "คุณยืนยันบอกรหัส OTP จำลองให้ผู้โทรตามคำขอ แบบฝึกนี้ไม่ได้ส่งรหัสจริงหรือเข้าถึงบัญชีจริงของคุณ",
    };
  }
}

/** Read-only enrichment of committed evidence. It never writes messages, evaluates, or changes state. */
export function projectCallConversation(s: TrainingSession, t: ScenarioTemplate): Pick<Phone, "transcript" | "criticalEnding"> {
  if (!bindings.has(`${t.id}@${t.version}:${t.variant}`) || !t.callCenter?.continuousConversation ||
    s.templateId !== t.id || s.templateVersion !== t.version || s.variant !== t.variant) return {};
  const opaque = (kind: string, id: string) => `T-${createHash("sha256").update(JSON.stringify([s.id, kind, id])).digest("hex").slice(0, 24)}`;
  const entries: { revision: number; order: number; turn: TranscriptTurn }[] = [];
  for (const [order, message] of s.messages.entries()) {
    const receipt = s.dialogueTurns.find(turn => turn.id === message.turnId && turn.templateVersion === t.version && turn.state === message.state && turn.committedRevision > 0 && turn.committedRevision <= s.revision);
    if (!receipt) continue;
    entries.push({ revision: receipt.committedRevision, order, turn: { id: opaque("message", message.id), role: message.role, text: message.text, kind: "DIALOGUE" } });
  }
  const critical = confirmedCritical(s, t);
  for (const action of s.actions) {
    const text = action.id === critical?.action.id ? critical.text : choiceForAction(s, t, action)?.text;
    if (text) entries.push({ revision: action.revision + 1, order: 0,
      turn: { id: opaque("action", action.id), role: "user", text, kind: "COMMITTED_ACTION" } });
  }
  entries.sort((a, b) => a.revision - b.revision || a.order - b.order);
  return { transcript: entries.map(entry => entry.turn), ...(critical ? { criticalEnding: {
    title: "คุณถูกหลอกในสถานการณ์จำลอง", description: critical.description, actionText: critical.text,
  } } : {}) };
}
