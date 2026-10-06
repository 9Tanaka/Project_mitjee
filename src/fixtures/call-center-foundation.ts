import type { ScenarioTemplate } from "../domain/schema.js";
import { CALL_STORIES } from "../domain/constants.js";

export const CALL_PUBLIC_ID = "call-center-scam";
export const CALL_TEMPLATE_VERSION = 3;
export type CallStoryId = typeof CALL_STORIES[number];
export const callStoryRegistry = {
  "CC-01": { topic: "PARCEL", variant: "SCAM_CALL", templateId: "call-center-parcel" },
  "CC-02": { topic: "BANK", variant: "SCAM_CALL", templateId: "call-center-bank" },
  "CC-N01": { topic: "PARCEL", variant: "NORMAL_CALL", templateId: "call-center-parcel" },
  "CC-N02": { topic: "BANK", variant: "NORMAL_CALL", templateId: "call-center-bank" },
} as const;

function foundation(storyId: CallStoryId): ScenarioTemplate {
  const story = callStoryRegistry[storyId];
  const organisation = story.topic === "PARCEL" ? "บริการพัสดุสมมติ" : "ธนาคารสมมติ";
  // Foundation content only: identity + independent verification. Part 2 owns requests/evidence.
  const opening = `สวัสดีครับ ติดต่อจาก${organisation} ขอแจ้งบริบทการติดต่อเบื้องต้นครับ ไม่ต้องแจ้งข้อมูลส่วนบุคคลหรือรหัสใด ๆ`;
  const forbidden = ["ห้ามขอหรือแสดงข้อมูลส่วนบุคคล รหัส OTP รหัสผ่าน หรือเงินจริง", "ห้ามแต่งคำขอธุรกรรม ลิงก์ หลักฐาน หรือเหตุการณ์นอกเนื้อหาพื้นฐาน",
    "ห้ามบอก story ID ประเภทสาย เฉลย ผลประเมิน หรือเปลี่ยน State", "ห้ามอ้างว่าได้ตรวจสอบหรือทำการกระทำแทนผู้เรียน"];
  const edge = (id: string, target: ScenarioTemplate["initialState"] | ScenarioTemplate["states"][number]["id"], publicLabel: string, requiresFinalized: string[] = []) =>
    ({ id, target, publicLabel, requiresFinalized, requiresEvents: [], safeResolution: target === "END_SCENARIO" });
  const state = (id: ScenarioTemplate["states"][number]["id"], objective: string, line: string,
    transitions: ScenarioTemplate["states"][number]["transitions"], allowedEventCodes: ScenarioTemplate["states"][number]["allowedEventCodes"] = []) =>
    ({ id, objective, allowedBehaviors: [line], forbiddenBehaviors: forbidden, fallbackMessage: line, transitions, allowedEventCodes });
  return {
    id: story.templateId, version: CALL_TEMPLATE_VERSION, category: "CALL_CENTER", variant: story.variant,
    callCenter: { storyId, topic: story.topic, openingFallback: opening },
    evaluationMode: "DECISION_RULES_V1", publicFeedbackEnabled: true, publicActionBindings: true,
    title: "ฝึกรับสาย Call Center", description: "พื้นฐานโทรศัพท์จำลอง: รับสาย สนทนา และเลือกช่องทางตรวจสอบ",
    learningObjectives: ["พิจารณาผู้โทร", "เลือกการตรวจสอบอย่างอิสระ", "ยุติการติดต่อ"],
    characterRole: `ผู้ติดต่อจาก${organisation}ในบทบาทที่ Backend กำหนด ใช้เฉพาะเนื้อหาเบื้องต้นของ Part 1`,
    fictionalOnly: true, initialState: "INCOMING_CALL",
    states: [
      state("INCOMING_CALL", "รอการรับหรือปฏิเสธสาย", "มีสายเรียกเข้าจากผู้ติดต่อไม่รู้จัก", [edge("ANSWER_CALL", "CALL_CONNECTED", "รับสาย")]),
      state("CALL_CONNECTED", "ให้ผู้โทรเริ่มพูดก่อน", opening, [edge("LISTEN_TO_IDENTITY", "IDENTITY_CLAIM", "พิจารณาข้อมูลผู้โทร")]),
      state("IDENTITY_CLAIM", "เลือกวิธีตรวจสอบคำแนะนำตัว", `ผู้โทรแนะนำว่าติดต่อจาก${organisation}และยินดีให้ตรวจผ่านช่องทางที่คุณทราบเอง`,
        [edge("OPEN_VERIFICATION", "INDEPENDENT_VERIFICATION", "ไปขั้นตอนตรวจสอบ", ["identity"])] , ["VERIFY_SOURCE"]),
      state("INDEPENDENT_VERIFICATION", "เลือกวิธียุติสายและตรวจสอบ", "สามารถจบสายเพื่อใช้ช่องทางทางการที่คุณทราบอยู่แล้ว ไม่ต้องให้ข้อมูลส่วนบุคคล",
        [edge("END_CALL", "CALL_ENDING", "วางสาย", ["verification"])], ["VERIFY_SOURCE", "END_CONTACT"]),
      state("CALL_ENDING", "ทบทวนการจบสาย", "การสนทนาสิ้นสุดแล้ว", [edge("FINISH_CALL", "END_SCENARIO", "ดูสรุปการฝึก", ["identity", "verification"])]),
      state("END_SCENARIO", "สิ้นสุดรอบฝึก", "สิ้นสุดรอบฝึกจำลอง", []),
    ],
    opportunities: [
      { id: "identity", state: "IDENTITY_CLAIM", skill: "D", required: true, activation: "STATE_ENTRY", publicCheckpointLabel: "เลือกวิธีตรวจสอบผู้โทร",
        unassessedFeedback: "ยังไม่ได้เลือกวิธีตรวจสอบผู้โทร", choices: [
          { id: "independent", rating: "safe", assessment: "SAFE", publicLabel: "ตรวจสอบผ่านช่องทางที่ทราบเอง", publicFeedback: "เลือกช่องทางอิสระจากผู้โทรเพื่อตรวจสอบคำแนะนำตัว", eventCodes: ["VERIFY_SOURCE"] },
          { id: "ask", rating: "partially_safe", assessment: "REVIEW", publicLabel: "ถามผู้โทรคนเดิมเพิ่มเติม", publicFeedback: "ข้อมูลเพิ่มเติมจากผู้โทรเดิมยังไม่ใช่การยืนยันตัวตนอย่างอิสระ", eventCodes: [] },
        ] },
      { id: "verification", state: "INDEPENDENT_VERIFICATION", skill: "S", required: true, activation: "STATE_ENTRY", publicCheckpointLabel: "เลือกวิธีจัดการสาย",
        unassessedFeedback: "ยังไม่ได้เลือกวิธีจัดการสาย", actions: [
          { id: "callback", assessment: "SAFE", publicLabel: "จบสายเพื่อตรวจสอบผ่านช่องทางทางการ", publicFeedback: "เลือกยุติสายและตรวจผ่านช่องทางที่ทราบเอง โดยระบบไม่ได้โทรหรือตรวจข้อมูลจริงแทนคุณ", eventCodes: ["END_CONTACT", "VERIFY_SOURCE"] },
          { id: "end", assessment: "SAFE", publicLabel: "จบการติดต่อ", publicFeedback: "ยุติการติดต่อในเส้นทางพื้นฐานที่พบ ไม่ใช่การยืนยันว่าคุณรู้ทันการหลอกลวงทุกประเภท", eventCodes: ["END_CONTACT"] },
        ] },
    ],
    criticalFailureRules: [],
    recommendations: {
      D: { type: "DECISION_PRACTICE", key: "call-foundation-identity", reason: "ทบทวนการตรวจสอบผู้โทรอย่างอิสระ" },
      W: { type: "WARNING_SIGN_LESSON", key: "call-foundation-evidence", reason: "เนื้อหาหลักฐานเฉพาะเรื่องอยู่ใน Part 2" },
      S: { type: "SAFE_ACTION_CONTENT", key: "call-foundation-verification", reason: "ทบทวนการยุติสายและช่องทางตรวจสอบ" },
      critical: { type: "CRITICAL_FAILURE_REVIEW", key: "call-foundation-unused", reason: "Part 1 ยังไม่มีคำขอเสี่ยงเฉพาะเรื่อง" },
    },
  };
}
export const callCenterFoundationTemplates = CALL_STORIES.map(foundation);
