import type { ScenarioTemplate, OpportunityDefinition } from "../domain/schema.js";
import type { PhoneAppId, CallBehavior } from "../domain/phone-model.js";
import { CALL_STORIES } from "../domain/constants.js";
import { callStoryRegistry, type CallStoryId } from "./call-center-foundation.js";

type State = ScenarioTemplate["states"][number];
type Interaction = NonNullable<State["interactions"]>[number];
const appLabels: Record<PhoneAppId, string> = { CALL: "สายสนทนา", MESSAGES: "ข้อความ", BANK: "ธนาคารจำลอง", PARCEL: "พัสดุ", CALLER_INFO: "ข้อมูลผู้โทร" };
const opened: Record<PhoneAppId, CallBehavior> = { CALL: "RETURNED_TO_CALL", MESSAGES: "OPENED_MESSAGES", BANK: "OPENED_BANK_APP", PARCEL: "OPENED_PARCEL_APP", CALLER_INFO: "OPENED_CALLER_INFO" };

function story(storyId: CallStoryId): ScenarioTemplate {
  const registry = callStoryRegistry[storyId];
  const scam = registry.variant === "SCAM_CALL", parcel = registry.topic === "PARCEL";
  const organisation = parcel ? "MITJEE Parcel" : "MITJEE Bank";
  const content: NonNullable<NonNullable<ScenarioTemplate["callCenter"]>["content"]> = {
    caller: { organisation, phoneLabel: "หมายเลขจำลอง CALL-A17", claimedRole: parcel ? "ฝ่ายจัดส่ง" : "ฝ่ายแจ้งรายการ", knownChannel: "ช่องทางติดต่อที่บันทึกไว้ในแอปจำลองของคุณ" },
    ...(parcel ? { parcel: { reference: "PX-A17", item: "สมุดและอุปกรณ์การเรียน", deliveryWindow: "วันนี้ 14:00–16:00", status: "อยู่ระหว่างจัดส่ง" } }
      : { transaction: { reference: "TX-B24", amount: 420, time: "วันนี้ 10:20", item: "ร้านหนังสือจำลอง", status: "รายการที่คุณทำไว้" } }),
    ...(parcel && scam ? { transfer: { recipient: "บัญชีตรวจสอบสมมติ", accountReference: "SIM-ACCT-K2", amount: 9300, purpose: "ตรวจสอบเงินตามคำขอของผู้โทร" } } : {}),
    reflectionNote: parcel ? "ผลนี้ครอบคลุมเฉพาะการกระทำและคำขอที่พบในรอบฝึก ไม่ใช่การรับรองความชำนาญทั้งหมวด"
      : `${scam ? "ทบทวนคำขอที่พบในรอบนี้" : "ตัวอย่างสายธนาคารปกติในสถานการณ์จำลอง ไม่ใช่ข้อสรุปว่าธนาคารจริงทุกแห่งติดต่อในรูปแบบเดียวกัน"} ผลครอบคลุมเส้นทางที่พบเท่านั้น`,
  };
  const lines: Partial<Record<State["id"], string>> = {
    CALL_CONNECTED: parcel ? "สวัสดีครับ ติดต่อจาก MITJEE Parcel เรื่องพัสดุ PX-A17 ครับ" : "สวัสดีครับ ติดต่อจาก MITJEE Bank เพื่อแจ้งรายการที่เกี่ยวข้องกับบัญชีจำลองครับ",
    IDENTITY_CLAIM: parcel ? "ผมเป็นฝ่ายจัดส่งของ MITJEE Parcel อ้างอิงพัสดุ PX-A17 คุณต้องการข้อมูลอ้างอิงส่วนไหนครับ"
      : scam ? "ผมอ้างว่ามาจากฝ่ายตรวจรายการของ MITJEE Bank มีรายการผิดปกติที่อยากแจ้งให้ทราบครับ" : "ผมเป็นฝ่ายแจ้งรายการของ MITJEE Bank คุณสามารถตรวจรายการในแอปของคุณเองได้ครับ",
    CONTEXT_CLAIM: parcel ? scam ? "พัสดุ PX-A17 ถูกกล่าวอ้างว่าเกี่ยวข้องกับคดี CASE-P17 ผมจะโอนเรื่องให้หน่วยตรวจสอบสมมติ โดยยังไม่มีหลักฐานยืนยันจากช่องทางอิสระครับ"
      : "พัสดุ PX-A17 เป็นสมุดและอุปกรณ์การเรียน รอบจัดส่งวันนี้ 14:00–16:00 คุณตรวจคำสั่งซื้อในแอปพัสดุของคุณได้ครับ"
      : scam ? "รายการที่ผมกล่าวอ้างคือ TX-X91 จำนวน 8,700 บาท วันนี้ 11:40 จากร้านอุปกรณ์สมมติ คุณสามารถเปรียบเทียบกับรายการในแอปของคุณได้ครับ"
        : "รายการ TX-B24 เป็นค่าหนังสือ 420 บาท วันนี้ 10:20 จากร้านหนังสือจำลอง เป็นการแจ้งข้อมูลทั่วไป ไม่ต้องแจ้งรหัสหรือข้อมูลลับครับ",
    PRESSURE: parcel ? "ผมอ้างเป็นผู้ประสานหน่วยตรวจสอบ CASE-P17 ขอให้เก็บเรื่องนี้เป็นความลับและรีบทำตามเพื่อไม่ให้กระทบคดีครับ"
      : "ผมอ้างว่าต้องรีบตรวจรายการ TX-X91 ตอนนี้ และขอให้ดำเนินการตามขั้นตอนในสายครับ",
    MAIN_REQUEST: parcel ? scam ? "ขอให้โอนเงินจำลอง 9,300 บาทไปบัญชี SIM-ACCT-K2 เพื่อการตรวจสอบตามที่ผมกล่าวอ้าง คุณสามารถเปิดรายละเอียดในธนาคารจำลองได้ ไม่มีการชำระเงินจริงครับ"
      : "ขอยืนยันช่วงจัดส่ง 14:00–16:00 หรือเปลี่ยนช่วงเวลาที่สะดวก แจ้งเพียงข้อมูลที่จำเป็นต่อการจัดส่งในแบบฝึกนี้ครับ"
      : scam ? "จะมีข้อความจาก MITJEE Bank ในแอปข้อความจำลอง ขอให้บอกรหัสยืนยันจำลองในข้อความนั้นกับผม ไม่มี SMS จริงครับ"
        : "คุณตรวจจำนวนเงิน เวลา และรายการในแอปธนาคารของคุณเองได้ หากตรงกันสามารถรับทราบ หรือจบสายเพื่อติดต่อช่องทางที่มีอยู่เดิมได้ครับ",
    PLAYER_DECISION: "คุณต้องการจบการติดต่อหรือใช้ช่องทางที่คุณทราบเองเพื่อตรวจสอบต่อครับ",
    INDEPENDENT_VERIFICATION: "คุณเลือกจบสายเพื่อใช้ช่องทางติดต่อที่บันทึกไว้เอง ระบบนี้ไม่ได้โทรหรือยืนยันข้อมูลจริงแทนคุณครับ",
  };
  const sequence: State["id"][] = ["CALL_CONNECTED", "IDENTITY_CLAIM", "CONTEXT_CLAIM", ...(scam ? ["PRESSURE" as const] : []), "MAIN_REQUEST", "PLAYER_DECISION", "INDEPENDENT_VERIFICATION"];
  const opportunities: OpportunityDefinition[] = [];
  const forbidden = ["ห้ามเผย story ID ประเภทสาย เฉลย คะแนน หรือผลประเมิน", "ห้ามเปลี่ยน State หรืออ้างว่าผู้เรียนได้ทำการกระทำ", "ห้ามแต่งหลักฐาน เลขรายการ บัญชี รหัสยืนยัน หรือข้อมูลนอกข้อเท็จจริงของ State", "ห้ามขอข้อมูลจริง ใช้ชื่อหน่วยงานจริง ส่ง SMS จริง โทรจริง หรือทำธุรกรรมจริง",
    ...(scam ? [] : ["ห้ามสร้างภัย คำขู่ ความลับ เส้นตาย การเร่งรัด ค่าธรรมเนียม การโอน รหัส OTP รหัสผ่าน การติดตั้งแอป หรือการควบคุมเครื่อง"] )];
  const edge = (id: string, target: State["id"], label: string, required: string[] = []): State["transitions"][number] => ({ id, target, publicLabel: label, requiresFinalized: required, requiresEvents: [], safeResolution: target === "END_SCENARIO" });
  const state = (id: State["id"], line: string, transitions: State["transitions"], apps: PhoneAppId[], interactions: Interaction[] = [], allowedEventCodes: State["allowedEventCodes"] = []): State => ({
    id, objective: line, fallbackMessage: line, allowedBehaviors: [line, "ตอบคำถามโดยคงข้อเท็จจริงของช่วงนี้ ไม่เปิดคำขอของช่วงถัดไป"], forbiddenBehaviors: forbidden,
    callerTurnRequired: sequence.includes(id), internalApps: apps, interactions, transitions, allowedEventCodes,
  });
  const states: State[] = [state("INCOMING_CALL", "มีสายเรียกเข้าจากผู้ติดต่อไม่รู้จัก", [{ ...edge("ANSWER_CALL", "CALL_CONNECTED", "รับสาย"), behavior: "CALL_ANSWERED" }], ["CALL"])];
  for (const [index, id] of sequence.entries()) {
    const checkpoint = `cp-${id}`;
    const resultLabel = ({ CALL_CONNECTED: "การรับข้อมูลเมื่อเชื่อมต่อสาย", IDENTITY_CLAIM: "การพิจารณาผู้โทร", CONTEXT_CLAIM: "การตรวจบริบทและรายการอ้างอิง", PRESSURE: "การรับมือแรงกดดัน", MAIN_REQUEST: "การตอบสนองต่อคำขอ", PLAYER_DECISION: "การเลือกจัดการการติดต่อ", INDEPENDENT_VERIFICATION: "การตรวจสอบผ่านช่องทางอิสระ" } as Partial<Record<State["id"], string>>)[id]!;
    const apps: PhoneAppId[] = ["CALL", "CALLER_INFO"];
    if (parcel && index >= 1) apps.push("PARCEL");
    if (!parcel && index >= 2 || parcel && scam && id === "MAIN_REQUEST") apps.push("BANK");
    if (!parcel && scam && id === "MAIN_REQUEST") apps.push("MESSAGES");
    const interactions: Interaction[] = [];
    const interact = (suffix: string, label: string, app: PhoneAppId, behavior: CallBehavior, extras: Partial<Interaction> = {}) => {
      const definition = { id: `${id}-${suffix}`, label, app, behavior, ...extras }; interactions.push(definition); return definition.id;
    };
    for (const app of apps.filter(a => a !== "CALL")) {
      interact(`open-${app}`, `เปิด${appLabels[app]}`, "CALL", opened[app], { navigationTarget: app });
      interact(`return-${app}`, "กลับสายสนทนา", app, "RETURNED_TO_CALL", { navigationTarget: "CALL" });
    }
    interact("identity", "ขอชื่อและฝ่ายที่ติดต่อ", "CALL", "ASKED_CALLER_IDENTITY");
    interact("reference", "ขอข้อมูลอ้างอิง", "CALL", "ASKED_FOR_REFERENCE");
    interact("clarify", "ขอคำอธิบายเพิ่มเติม", "CALL", "REQUESTED_CLARIFICATION");
    if (apps.includes("PARCEL")) interact("check-order", "ตรวจคำสั่งซื้อของฉัน", "PARCEL", "CHECKED_EXISTING_ORDER");
    if (apps.includes("BANK") && !parcel) interact("check-transaction", "เปรียบเทียบจำนวนเงิน เวลา และรายการ", "BANK", "CHECKED_TRANSACTION");
    interact("end", "วางสาย", "CALL", "HUNG_UP", { resolutionChoiceId: "end", transitionId: `${id}-end` });
    interact("callback", "จบสายเพื่อติดต่อช่องทางที่มีอยู่เดิม", "CALL", "CALLED_OFFICIAL_CHANNEL", { resolutionChoiceId: "callback", transitionId: `${id}-end` });
    const next = sequence[index + 1] ?? "CALL_ENDING";
    const options: Extract<OpportunityDefinition, { skill: "D" }>["choices"] = [
      { id: "end", rating: "safe" as const, assessment: "SAFE" as const, publicLabel: "จบการติดต่อ", publicFeedback: "ยุติสายโดยไม่ทำคำขอเพิ่มเติม ไม่ใช่การยืนยันว่าสายนี้เป็นอันตราย", eventCodes: ["END_CONTACT" as const], behavior: "HUNG_UP" as const },
      { id: "callback", rating: "safe" as const, assessment: "SAFE" as const, publicLabel: "ตรวจผ่านช่องทางที่มีอยู่เดิม", publicFeedback: "เลือกช่องทางอิสระที่คุณทราบเอง ไม่ใช้ข้อมูลติดต่อจากผู้โทร", eventCodes: ["VERIFY_SOURCE" as const], behavior: "CALLED_OFFICIAL_CHANNEL" as const },
      { id: "caution", rating: "safe" as const, assessment: "SAFE" as const, publicLabel: "ฟังข้อมูลต่อโดยยังไม่ให้ข้อมูลเพิ่มเติม", publicFeedback: "รับข้อมูลและรักษาขอบเขตไว้ การตอบสายหรือฟังข้อมูลอย่างระมัดระวังไม่ใช่ความผิด", eventCodes: [], behavior: "CONTINUED_CALL" as const },
    ];
    if (id === "CONTEXT_CLAIM") options.push({ id: "checked", rating: "safe", assessment: "SAFE", publicLabel: "เปรียบเทียบกับข้อมูลในแอปของฉันแล้ว", publicFeedback: "เปรียบเทียบข้อมูลอ้างอิงกับรายการที่มีอยู่เอง แยกคำกล่าวอ้างออกจากหลักฐาน", eventCodes: ["VERIFY_SOURCE"], behavior: "USED_INDEPENDENT_CHANNEL", requiresBehaviors: [parcel ? "CHECKED_EXISTING_ORDER" : "CHECKED_TRANSACTION"] } as typeof options[number]);
    if (scam) options.push({ id: "trust", rating: "partially_safe", assessment: "REVIEW", publicLabel: "เชื่อคำกล่าวอ้างโดยยังไม่ได้ตรวจสอบ", publicFeedback: "คำกล่าวอ้างของผู้โทรยังไม่ได้รับการยืนยันจากช่องทางอิสระ ควรตรวจสอบก่อนตัดสินใจ", eventCodes: [], behavior: "CONTINUED_CALL" } as typeof options[number]);
    if (id === "MAIN_REQUEST") {
      if (scam) options.push({ id: "refuse", rating: "safe", assessment: "SAFE", publicLabel: parcel ? "ไม่ดำเนินการโอนตามคำขอ" : "ไม่บอกรหัสตามคำขอ", publicFeedback: "ปฏิเสธคำขอและรักษาข้อมูลหรือเงินไว้โดยยังสามารถตรวจสอบต่อผ่านช่องทางอิสระ", eventCodes: [parcel ? "REFUSE_TRANSFER" : "REFUSE_OTP"], behavior: parcel ? "REFUSED_TRANSFER" : "REFUSED_OTP" } as typeof options[number]);
      else if (parcel) for (const [choice, label, behavior] of [["confirm", "ยืนยันช่วงจัดส่งจำลอง", "CONFIRMED_DELIVERY"], ["reschedule", "ขอเปลี่ยนช่วงจัดส่ง", "RESCHEDULED_DELIVERY"], ["limit", "ให้เฉพาะข้อมูลจำเป็นต่อการจัดส่ง", "LIMITED_INFORMATION"]] as const) options.push({ id: choice, rating: "safe", assessment: "SAFE", publicLabel: label, publicFeedback: "ตอบเรื่องจัดส่งตามบริบทและจำกัดข้อมูลอย่างเหมาะสม", eventCodes: [], behavior } as typeof options[number]);
      else options.push({ id: "acknowledge", rating: "safe", assessment: "SAFE", publicLabel: "รับทราบข้อมูลรายการ", publicFeedback: "รับทราบรายการทั่วไปโดยไม่มีการให้ข้อมูลลับ และยังเลือกตรวจสอบผ่านช่องทางของคุณเองได้", eventCodes: [], behavior: "ACKNOWLEDGED_NOTIFICATION" } as typeof options[number]);
    }
    opportunities.push({ id: checkpoint, state: id, skill: "D", required: true, activation: "STATE_ENTRY", app: "CALL", publicCheckpointLabel: "คุณจะทำอะไรต่อ?", publicResultLabel: resultLabel, unassessedFeedback: "ยังไม่ได้ยืนยันการตอบสนองต่อข้อมูลช่วงนี้", choices: options });
    const codes: State["allowedEventCodes"] = ["END_CONTACT", "VERIFY_SOURCE", ...(id === "MAIN_REQUEST" && scam ? [parcel ? "REFUSE_TRANSFER" as const : "REFUSE_OTP" as const, parcel ? "CONFIRM_UNVERIFIED_TRANSFER" as const : "DISCLOSE_OTP" as const] : [])];
    if (id === "MAIN_REQUEST" && scam) {
      const app = parcel ? "BANK" : "MESSAGES";
      const viewBehavior = parcel ? "VIEWED_TRANSFER_DETAILS" : "VIEWED_SIMULATED_OTP";
      interact("view", parcel ? "ดูรายละเอียดการโอนจำลอง" : "อ่านรหัสในข้อความจำลอง", app, viewBehavior);
      interact("prepare", parcel ? "เตรียมยืนยันการโอนจำลอง" : "เตรียมยืนยันการบอกรหัสจำลอง", app, parcel ? "PREPARED_TRANSFER" : "PREPARED_OTP_SHARE", { requiresBehaviors: [viewBehavior] });
    }
    states.push(state(id, lines[id]!, [edge(`${id}-next`, next, "ดำเนินบทสนทนาต่อ", [checkpoint]), edge(`${id}-end`, "CALL_ENDING", "จบสาย", [checkpoint])], apps, interactions, codes));
  }
  states.push(state("CALL_ENDING", "การสนทนาสิ้นสุดแล้ว", [edge("FINISH_CALL", "END_SCENARIO", "ดูสรุปการฝึก")], ["CALL"]), state("END_SCENARIO", "สิ้นสุดรอบฝึก", [], ["CALL"]));
  return {
    id: registry.templateId, version: 4, category: "CALL_CENTER", variant: registry.variant, fictionalOnly: true, initialState: "INCOMING_CALL", evaluationMode: "DECISION_RULES_V1", publicFeedbackEnabled: true, publicActionBindings: true,
    title: "ฝึกรับสาย Call Center", description: "ฝึกพิจารณาการติดต่อผ่านโทรศัพท์จำลอง", learningObjectives: ["ตรวจข้อมูลอ้างอิง", "รักษาขอบเขตข้อมูล", "เลือกการตอบสนอง"], characterRole: `ผู้ติดต่อจาก ${organisation} ใช้เฉพาะข้อเท็จจริงและคำขอที่ Backend อนุญาตใน State ปัจจุบัน`,
    callCenter: { storyId, topic: registry.topic, fullStory: true, content, openingFallback: lines.CALL_CONNECTED! }, states, opportunities,
    criticalFailureRules: scam ? [{ id: parcel ? "CONFIRM_SIMULATED_TRANSFER" : "SHARE_SIMULATED_OTP", state: "MAIN_REQUEST", opportunityId: "cp-MAIN_REQUEST", requiresExplicitAction: true, requiresAbsentEvents: [], app: parcel ? "BANK" : "MESSAGES", behavior: parcel ? "CONFIRMED_SIMULATED_TRANSFER" : "SHARED_SIMULATED_OTP", preparationInteractionId: "MAIN_REQUEST-prepare", eventCode: parcel ? "CONFIRM_UNVERIFIED_TRANSFER" : "DISCLOSE_OTP", publicLabel: parcel ? "ยืนยันการโอนเงินจำลอง" : "ยืนยันการบอกรหัสจำลองแก่ผู้โทร", publicFeedback: parcel ? "ยืนยันการโอนตามคำกล่าวอ้างที่ยังไม่ได้ตรวจสอบจากแหล่งอิสระ" : "ยืนยันการบอกรหัสแก่ผู้โทรตามคำขอ เป็นการกระทำจำลองที่ Backend ตรวจสอบแล้ว" }] : [],
    recommendations: { D: { type: "DECISION_PRACTICE", key: "call-decision", reason: "ทบทวนการตัดสินใจในบริบทที่พบ" }, W: { type: "WARNING_SIGN_LESSON", key: "call-warning", reason: "ทบทวนคำกล่าวอ้างและคำขอที่พบ" }, S: { type: "SAFE_ACTION_CONTENT", key: "call-boundaries", reason: "ทบทวนขอบเขตข้อมูลและช่องทางอิสระ" }, critical: { type: "CRITICAL_FAILURE_REVIEW", key: "call-critical", reason: "ทบทวนการยืนยันการกระทำจำลองตามคำขอที่ยังไม่ได้ตรวจสอบ" } },
  };
}
export const callCenterStoryTemplates = CALL_STORIES.map(story);
