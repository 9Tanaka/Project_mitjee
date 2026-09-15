import type { ScenarioTemplate } from "../domain/schema.js";

/** Demo-only scenario/points/content. Not presented as Proposal requirements. */
export const smsPhishingFixture: ScenarioTemplate = {
  id: "sms-phishing-demo", version: 1, category: "SMS_PHISHING", variant: "DEFAULT",
  title: "SMS แจ้งพัสดุจากผู้ส่งสมมติ", fictionalOnly: true,
  learningObjectives: ["ตรวจผู้ส่งและ URL", "ไม่เปิดเผยรหัสผ่านหรือ OTP", "ยุติและรายงานเหตุอย่างปลอดภัย"],
  initialState: "contact",
  states: [
    {
      id: "contact", objective: "พิจารณาที่มาของ SMS",
      allowedBehaviors: ["แสดง SMS จำลอง"], forbiddenBehaviors: ["ขอข้อมูลจริง"],
      allowedEventCodes: ["VERIFY_SOURCE"], fallbackMessage: "คุณได้รับ SMS จากบริษัทพัสดุสมมติ กรุณาพิจารณาผู้ส่ง",
      transitions: [{ id: "review-sms", target: "build_trust", requiresFinalized: ["d1"], requiresEvents: [], safeResolution: false }],
    },
    {
      id: "build_trust", objective: "ตรวจหลักฐานในข้อความ",
      allowedBehaviors: ["แสดงหลักฐานคงที่ใน fixture"], forbiddenBehaviors: ["ส่งลิงก์ใช้งานจริง"],
      allowedEventCodes: ["IDENTIFY_WARNING_SIGN"], fallbackMessage: "ตรวจชื่อผู้ส่ง ลิงก์ parcel-check.example และข้อความเร่งรัด",
      transitions: [
        { id: "inspect-link", target: "request_action", requiresFinalized: ["w1"], requiresEvents: [], safeResolution: false },
        { id: "extra-message", target: "create_pressure", requiresFinalized: ["w1"], requiresEvents: [], safeResolution: false },
      ],
    },
    {
      id: "create_pressure", objective: "พิจารณาข้อความเร่งรัดเพิ่มเติมในเส้นทางทางเลือก",
      allowedBehaviors: ["แสดงหลักฐานจำลองเพิ่มเติม"], forbiddenBehaviors: ["สร้างความเสียหายจริง"],
      allowedEventCodes: ["IDENTIFY_WARNING_SIGN"], fallbackMessage: "มีข้อความจำลองอ้างว่าต้องดำเนินการภายในห้านาที",
      transitions: [{ id: "continue-link", target: "request_action", requiresFinalized: [], requiresEvents: [], safeResolution: false }],
    },
    {
      id: "request_action", objective: "ตัดสินใจต่อคำขอข้อมูลรับพัสดุจำลอง",
      allowedBehaviors: ["แสดงตัวเลือกจำลองที่กำหนด"], forbiddenBehaviors: ["รับรหัสผ่านหรือ OTP จริง"],
      allowedEventCodes: ["REFUSE_OTP", "REFUSE_SENSITIVE_INFO", "DISCLOSE_OTP", "ENTER_PASSWORD_SUSPICIOUS_LINK"],
      fallbackMessage: "แบบฝึกนี้ใช้เฉพาะการยืนยันการกระทำจำลอง ห้ามกรอกรหัสจริง",
      transitions: [{ id: "verify-and-close", target: "user_verification", requiresFinalized: ["d2"], requiresEvents: [], safeResolution: false }],
    },
    {
      id: "user_verification", objective: "ตรวจสอบและจบการติดต่อจำลอง",
      allowedBehaviors: ["รับการตัดสินใจและการรายงานเหตุจำลอง"], forbiddenBehaviors: ["ติดต่อหน่วยงานจริง"],
      allowedEventCodes: ["VERIFY_SOURCE", "REFUSE_TRANSFER", "END_CONTACT", "REPORT_INCIDENT"],
      fallbackMessage: "เลือกวิธีตรวจสอบและยุติการติดต่อในแบบฝึก",
      transitions: [{ id: "resolve", target: "end_scenario", requiresFinalized: ["d1", "w1", "d2", "d3", "s1"], requiresEvents: ["END_CONTACT"], safeResolution: true }],
    },
    {
      id: "end_scenario", objective: "แสดงผลจาก Scoring Engine",
      allowedBehaviors: [], forbiddenBehaviors: ["เปลี่ยนผลคะแนน"], allowedEventCodes: [],
      fallbackMessage: "สิ้นสุดสถานการณ์จำลอง", transitions: [],
    },
  ],
  opportunities: [
    {
      id: "d1", state: "contact", skill: "D", required: true, activation: "STATE_ENTRY", maxScore: 10,
      choices: [
        { id: "verify", rating: "safe", score: 10, eventCodes: ["VERIFY_SOURCE"] },
        { id: "hesitate", rating: "partially_safe", score: 5, eventCodes: [] },
        { id: "trust-display-name", rating: "risky", score: 0, eventCodes: [] },
      ],
    },
    {
      id: "w1", state: "build_trust", skill: "W", required: true, activation: "STATE_ENTRY",
      evidence: [
        { id: "wrong-domain", text: "ลิงก์ parcel-check.example ไม่ตรงกับช่องทางสมมติที่แจ้งไว้", warningSignId: "domain-mismatch" },
        { id: "urgency", text: "อ้างว่าจะยกเลิกพัสดุหากไม่ดำเนินการทันที", warningSignId: "time-pressure" },
        { id: "logo", text: "มีรูปโลโก้ประกอบข้อความ ซึ่งเพียงอย่างเดียวใช้ตัดสินไม่ได้", warningSignId: null },
      ],
    },
    {
      id: "w-extra", state: "create_pressure", skill: "W", required: false, activation: "STATE_ENTRY",
      evidence: [{ id: "countdown", text: "เร่งให้ดำเนินการภายในห้านาที", warningSignId: "extra-pressure" }],
    },
    {
      id: "d2", state: "request_action", skill: "D", required: true, activation: "STATE_ENTRY", maxScore: 10,
      choices: [
        { id: "refuse", rating: "safe", score: 10, eventCodes: ["REFUSE_OTP", "REFUSE_SENSITIVE_INFO"] },
        { id: "ask-sender", rating: "partially_safe", score: 5, eventCodes: [] },
        { id: "continue-without-verifying", rating: "risky", score: 0, eventCodes: [] },
      ],
    },
    {
      id: "d3", state: "user_verification", skill: "D", required: true, activation: "STATE_ENTRY", maxScore: 10,
      choices: [
        { id: "official-channel", rating: "safe", score: 10, eventCodes: ["VERIFY_SOURCE", "REFUSE_TRANSFER"] },
        { id: "ask-friend", rating: "partially_safe", score: 5, eventCodes: [] },
        { id: "ignore-source", rating: "risky", score: 0, eventCodes: [] },
      ],
    },
    {
      id: "s1", state: "user_verification", skill: "S", required: true, activation: "STATE_ENTRY", maxScore: 10,
      // Local fixture rubric, not Proposal-derived point values.
      actions: [
        { id: "verify-end-report", score: 10, eventCodes: ["VERIFY_SOURCE", "END_CONTACT", "REPORT_INCIDENT"] },
        { id: "end-only", score: 5, eventCodes: ["END_CONTACT"] },
        { id: "dismiss-without-checking", score: 0, eventCodes: ["END_CONTACT"] },
      ],
    },
  ],
  criticalFailureRules: [
    { id: "confirm-simulated-otp", state: "request_action", opportunityId: "d2", eventCode: "DISCLOSE_OTP", requiresExplicitAction: true, requiresAbsentEvents: [] },
    { id: "confirm-simulated-password", state: "request_action", opportunityId: "d2", eventCode: "ENTER_PASSWORD_SUSPICIOUS_LINK", requiresExplicitAction: true, requiresAbsentEvents: [] },
  ],
  recommendations: {
    D: { type: "DECISION_PRACTICE", key: "sms-phishing-decisions", reason: "ฝึกจุดตัดสินใจในสถานการณ์ SMS / Phishing ประเภทเดิม" },
    W: { type: "WARNING_SIGN_LESSON", key: "sms-phishing-warning-signs", reason: "ทบทวนสัญญาณเตือนของผู้ส่งและลิงก์" },
    S: { type: "SAFE_ACTION_CONTENT", key: "verify-end-block-preserve-report", reason: "ทบทวนการตรวจสอบ ยุติการติดต่อ บล็อก เก็บหลักฐาน และรายงานเหตุ" },
    critical: { type: "CRITICAL_FAILURE_REVIEW", key: "sms-phishing-sensitive-data-review", reason: "ทบทวนการปกป้องรหัสผ่านและ OTP แล้วฝึก SMS / Phishing ประเภทเดิมอีกครั้ง" },
  },
};
