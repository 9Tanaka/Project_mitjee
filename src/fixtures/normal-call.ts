import type { ScenarioTemplate } from "../domain/schema.js";

const forbidden = ["ห้ามสร้างภัยคุกคาม ความเร่งด่วน ลิงก์ หรือสัญญาณหลอกลวง", "ห้ามขอ OTP PIN password CVV เลขบัตรประชาชน บัญชีธนาคาร หรือข้อมูลชำระเงินจริง", "ห้ามขอเงิน ติดตั้งแอป หรือควบคุมเครื่อง", "ห้ามเปลี่ยนรูปแบบสายหรือผลประเมิน"];
export const normalCallFixture: ScenarioTemplate = {
  id: "call-center-scam", version: 1, category: "CALL_CENTER", variant: "NORMAL_CALL",
  evaluationMode: "DECISION_RULES_V1", publicFeedbackEnabled: true, publicActionBindings: true,
  title: "ฝึกรับสาย Call Center", description: "ฝึกตรวจสอบบริบทและเลือกการตอบสนองต่อสายจำลอง",
  learningObjectives: ["ตรวจสอบผู้โทรและบริบท", "แยกข้อมูลทั่วไปออกจากสัญญาณหลอกลวง", "จัดการข้อมูลสมมติและจบสายอย่างเหมาะสม"],
  characterRole: "เจ้าหน้าที่ห้องสมุดสมมติติดต่อยืนยันช่วงเวลานัดรับหนังสือ ผู้ใช้ไม่ต้องให้ข้อมูลส่วนบุคคล",
  fictionalOnly: true, initialState: "contact",
  states: [
    { id: "contact", objective: "ตรวจสอบบริบทการติดต่อ", allowedBehaviors: ["แนะนำว่าติดต่อจากห้องสมุดสมมติเรื่องเวลารับหนังสือ", "ยินดีให้ผู้ใช้ตรวจผ่านช่องทางทางการที่ทราบอยู่แล้ว"], forbiddenBehaviors: forbidden,
      allowedEventCodes: ["VERIFY_SOURCE"], fallbackMessage: "สวัสดีครับ ติดต่อจากห้องสมุดสมมติเรื่องเวลารับหนังสือ สามารถตรวจสอบผ่านช่องทางที่คุณทราบอยู่แล้วได้ครับ",
      transitions: [{ id: "review-call", target: "build_trust", publicLabel: "พิจารณาข้อมูลการติดต่อ", requiresFinalized: ["d1"], requiresEvents: [], safeResolution: false }] },
    { id: "build_trust", objective: "พิจารณาหลักฐานตามที่พบ", allowedBehaviors: ["กล่าวถึงการนัดรับหนังสือโดยไม่มีแรงกดดัน", "ไม่มีสัญญาณหลอกลวงในหลักฐานที่กำหนด"], forbiddenBehaviors: forbidden,
      allowedEventCodes: [], fallbackMessage: "เป็นการนัดรับหนังสือสมมติครับ เลือกช่วงเวลาที่สะดวกได้โดยไม่ต้องให้ข้อมูลส่วนบุคคล",
      transitions: [{ id: "discuss-time", target: "request_action", publicLabel: "เลือกการตอบสนองต่อข้อมูลทั่วไป", requiresFinalized: ["w1"], requiresEvents: [], safeResolution: false }] },
    { id: "request_action", objective: "ใช้เฉพาะข้อมูลสมมติที่ไม่อ่อนไหว", allowedBehaviors: ["ให้เลือกช่วงเช้าหรือบ่ายสำหรับนัดสมมติเท่านั้น"], forbiddenBehaviors: forbidden,
      allowedEventCodes: [], fallbackMessage: "สำหรับนัดสมมตินี้ สะดวกช่วงเช้าหรือบ่ายครับ ไม่ต้องส่งข้อมูลอื่น",
      transitions: [{ id: "close-call", target: "user_verification", publicLabel: "เลือกวิธีจบสาย", requiresFinalized: ["d2"], requiresEvents: [], safeResolution: false }] },
    { id: "user_verification", objective: "จบสายหรือโทรกลับช่องทางที่ทราบ", allowedBehaviors: ["ขอบคุณและจบสายตามปกติ", "ยินดีให้ติดต่อกลับผ่านช่องทางทางการที่ทราบ"], forbiddenBehaviors: forbidden,
      allowedEventCodes: ["END_CONTACT", "VERIFY_SOURCE"], fallbackMessage: "ขอบคุณครับ สามารถจบสายหรือติดต่อกลับผ่านช่องทางทางการที่คุณทราบอยู่แล้วได้",
      transitions: [{ id: "resolve", target: "end_scenario", publicLabel: "จบสถานการณ์", requiresFinalized: ["d1", "w1", "d2", "s1"], requiresEvents: ["END_CONTACT"], safeResolution: true }] },
    { id: "end_scenario", objective: "สิ้นสุด", allowedBehaviors: [], forbiddenBehaviors: forbidden, allowedEventCodes: [], fallbackMessage: "จบสายจำลองแล้ว", transitions: [] },
  ],
  opportunities: [
    { id: "d1", state: "contact", skill: "D", required: true, activation: "STATE_ENTRY", publicCheckpointLabel: "ตรวจสอบผู้โทรและบริบท", unassessedFeedback: "ยังไม่ได้เลือกวิธีตรวจสอบ", choices: [
      { id: "verify", rating: "safe", assessment: "SAFE", publicLabel: "ตรวจสอบผ่านช่องทางที่ทราบหรือขอชี้แจงบริบท", publicFeedback: "ตรวจสอบบริบทอย่างเหมาะสมก่อนสนทนาต่อ", eventCodes: ["VERIFY_SOURCE"] },
      { id: "continue", rating: "partially_safe", assessment: "REVIEW", publicLabel: "สนทนาต่อโดยยังไม่ตรวจบริบท", publicFeedback: "ควรตรวจผู้โทรและบริบทก่อนสนทนาต่อ", eventCodes: [] },
    ] },
    { id: "w1", state: "build_trust", skill: "W", required: true, activation: "STATE_ENTRY", publicCheckpointLabel: "เลือกข้อมูลที่เห็นว่าเป็นสัญญาณหลอกลวง (เว้นว่างได้)", unassessedFeedback: "ยังไม่ได้ยืนยันการพิจารณาหลักฐาน",
      assessmentRule: "NO_WARNINGS_EXPECTED", safeFeedback: "ข้อมูลที่ให้เป็นบริบททั่วไป ไม่มีสัญญาณหลอกลวง", reviewFeedback: "รายละเอียดทั่วไปที่เลือกยังไม่ใช่หลักฐานการหลอกลวง", evidence: [
        { id: "greeting", text: "ผู้โทรทักทายอย่างสุภาพ", warningSignId: null },
        { id: "appointment", text: "นัดรับหนังสือสมมติ เลือกเวลาได้และยินดีให้ตรวจสอบอย่างอิสระ", warningSignId: null },
      ] },
    { id: "d2", state: "request_action", skill: "D", required: true, activation: "STATE_ENTRY", publicCheckpointLabel: "จัดการข้อมูลนัดสมมติ", unassessedFeedback: "ยังไม่ได้เลือกวิธีจัดการข้อมูล", choices: [
      { id: "fictional-time", rating: "safe", assessment: "SAFE", publicLabel: "เลือกเวลาสมมติ โดยไม่ส่งข้อมูลส่วนบุคคล", publicFeedback: "ใช้เฉพาะข้อมูลสมมติที่จำเป็นต่อบริบท", eventCodes: [] },
      { id: "unclear", rating: "partially_safe", assessment: "REVIEW", publicLabel: "ตอบรับโดยยังไม่เข้าใจขอบเขตข้อมูล", publicFeedback: "ควรชี้แจงบริบทและขอบเขตข้อมูลก่อนตอบรับ", eventCodes: [] },
    ] },
    { id: "s1", state: "user_verification", skill: "S", required: true, activation: "STATE_ENTRY", publicCheckpointLabel: "จบการติดต่อ", unassessedFeedback: "ยังไม่ได้เลือกวิธีจบสาย", actions: [
      { id: "end", assessment: "SAFE", publicLabel: "จบสายตามปกติ", publicFeedback: "จบการติดต่อเมื่อได้ข้อมูลที่จำเป็นแล้ว", eventCodes: ["END_CONTACT"] },
      { id: "callback", assessment: "SAFE", publicLabel: "จบสายและติดต่อกลับผ่านช่องทางทางการที่ทราบ", publicFeedback: "ใช้ช่องทางที่ทราบอย่างอิสระเพื่อตรวจสอบเพิ่มเติม", eventCodes: ["END_CONTACT", "VERIFY_SOURCE"] },
    ] },
  ],
  criticalFailureRules: [],
  recommendations: {
    D: { type: "DECISION_PRACTICE", key: "normal-call-decision", reason: "ทบทวนการตรวจสอบบริบทผู้โทร" },
    W: { type: "WARNING_SIGN_LESSON", key: "normal-call-evidence", reason: "ทบทวนความแตกต่างระหว่างรายละเอียดทั่วไปกับสัญญาณหลอกลวง" },
    S: { type: "SAFE_ACTION_CONTENT", key: "normal-call-end", reason: "ทบทวนการจบสายและช่องทางติดต่อกลับ" },
    critical: { type: "CRITICAL_FAILURE_REVIEW", key: "normal-call-unused", reason: "ไม่ใช้ในสายปกติซึ่งไม่มีกฎ Critical Failure" },
  },
};
