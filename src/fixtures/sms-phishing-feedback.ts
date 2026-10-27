import { copy } from "../domain/copy.js";
import type { ScenarioTemplate } from "../domain/schema.js";
import { smsPhishingDecisionRulesFixture } from "./sms-phishing-decision-rules.js";

// Version 3 stays immutable. Version 4 publishes explicit public explanations.
const template = copy(smsPhishingDecisionRulesFixture);
template.version = 4;
template.publicFeedbackEnabled = true;

const labels: Record<string, string> = {
  d1: "ตรวจสอบผู้ส่ง", w1: "พิจารณาหลักฐานใน SMS", "w-extra": "ข้อความเร่งรัดเพิ่มเติม",
  d2: "ตอบสนองต่อคำขอข้อมูล", d3: "ตรวจสอบแหล่งข้อมูล", s1: "ยุติและรายงานเหตุ",
};
const reasons: Record<string, string> = {
  "d1:verify": "ตรวจสอบผู้ส่งผ่านช่องทางอื่นก่อนเชื่อชื่อที่แสดงใน SMS",
  "d1:hesitate": "การรอดูข้อมูลเพิ่มยังไม่ยืนยันว่าผู้ส่งเป็นใคร",
  "d1:trust-display-name": "ชื่อผู้ส่งที่แสดงอย่างเดียวไม่ยืนยันตัวตน",
  "d2:refuse": "การปฏิเสธคำขอช่วยปกป้องรหัสผ่านและ OTP",
  "d2:ask-sender": "การถามผู้ส่งเดิมยังไม่ใช่การตรวจสอบกับช่องทางที่เป็นอิสระ",
  "d2:continue-without-verifying": "การดำเนินการต่อก่อนตรวจที่มาเพิ่มความเสี่ยงต่อข้อมูลส่วนตัว",
  "d3:official-channel": "ตรวจสอบผ่านช่องทางทางการที่หาเอง ช่วยยืนยันข้ออ้างได้ปลอดภัยขึ้น",
  "d3:ask-friend": "คำแนะนำจากเพื่อนอาจช่วยคิด แต่ยังไม่ยืนยันแหล่งที่มาของข้อความ",
  "d3:ignore-source": "ควรตรวจที่มาก่อนตัดสินใจเชื่อคำขอ",
  "s1:verify-end-report": "ตรวจสอบ ยุติการติดต่อ และรายงานเหตุจำลองอย่างปลอดภัย",
  "s1:end-only": "ยุติการติดต่อทันทีช่วยจำกัดความเสี่ยงในเส้นทางนี้",
  "s1:dismiss-without-checking": "การปิดข้อความโดยไม่ตรวจสอบอาจทำให้พลาดการจัดการเหตุที่ควรทำต่อ",
};
function required(map: Record<string, string>, key: string): string {
  const value = map[key];
  if (!value) throw new Error(`Missing public SMS feedback: ${key}`);
  return value;
}
for (const opportunity of template.opportunities) {
  opportunity.publicCheckpointLabel = required(labels, opportunity.id);
  opportunity.unassessedFeedback = "ยังไม่ได้ยืนยันการตัดสินใจที่จุดนี้ จึงประเมินเส้นทางนี้ไม่ได้";
  if (opportunity.skill === "W") {
    opportunity.safeFeedback = "ระบุสัญญาณเตือนที่พบครบโดยไม่เลือกหลักฐานที่ไม่ใช่สัญญาณเตือน";
    opportunity.reviewFeedback = "ควรแยกสัญญาณเตือนออกจากรายละเอียดที่ยังไม่ยืนยันความเสี่ยง และตรวจหลักฐานอีกครั้ง";
  } else for (const option of opportunity.skill === "D" ? opportunity.choices : opportunity.actions) {
    option.publicFeedback = required(reasons, `${opportunity.id}:${option.id}`);
  }
}
for (const rule of template.criticalFailureRules) {
  rule.publicLabel = "การยืนยันคำขอข้อมูลจำลอง";
  rule.publicFeedback = rule.eventCode === "DISCLOSE_OTP"
    ? "การยืนยันส่ง OTP จำลองเป็นความเสี่ยงสำคัญ ควรเก็บรหัสไว้เป็นความลับและยุติการติดต่อ"
    : "การยืนยันกรอกรหัสผ่านในลิงก์จำลองเป็นความเสี่ยงสำคัญ ควรหลีกเลี่ยงลิงก์และตรวจสอบช่องทางทางการ";
}
export const smsPhishingFeedbackFixture: ScenarioTemplate = template;
