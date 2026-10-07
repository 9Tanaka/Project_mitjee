import type { ScenarioTemplate } from "../domain/schema.js";
import type { ScenarioCategory } from "../domain/types.js";
import { CRITICAL_CODES } from "../domain/constants.js";

interface ScenarioContent {
  id: string;
  category: ScenarioCategory;
  title: string;
  description: string;
  role: string;
  intro: string;
  claim: string;
  pressure: string;
  neutral: string;
  request: string;
  verification: string;
  criticalCode: typeof CRITICAL_CODES[number];
  criticalLabel: string;
  criticalFeedback: string;
}

// All people, organizations, balances and actions in these fixtures are fictional.
const content: ScenarioContent[] = [
  {
    id: "call-center-scam", category: "CALL_CENTER", title: "สายอ้างเป็นเจ้าหน้าที่การเงิน", description: "ฝึกรับสายหลอกลวงผ่านข้อความจำลองก่อนเปิดระบบเสียง",
    role: "ผู้โทรอ้างเป็นเจ้าหน้าที่สถาบันการเงินสมมติ ใช้ข้อความแทนเสียงในระยะนี้",
    intro: "ผู้โทรสมมติอ้างว่าบัญชีของคุณมีรายการผิดปกติ", claim: "ผู้โทรขอให้ยืนยันตัวตนผ่านสายที่ติดต่อมาเอง",
    pressure: "ขู่ว่าบัญชีจะถูกระงับทันทีหากไม่ทำตาม", neutral: "ผู้โทรกล่าวคำทักทายสุภาพ",
    request: "บอกรหัส OTP จำลองให้ผู้โทร", verification: "วางสายและโทรกลับหมายเลขทางการที่ค้นหาเอง",
    criticalCode: "DISCLOSE_OTP", criticalLabel: "ยืนยันการบอก OTP จำลอง", criticalFeedback: "OTP ต้องไม่บอกผู้โทร แม้เขาอ้างเป็นเจ้าหน้าที่ ให้ยุติสายและตรวจสอบช่องทางทางการ",
  },
  {
    id: "investment-scam", category: "INVESTMENT", title: "ข้อเสนอการลงทุนผลตอบแทนสูง", description: "ตรวจคำรับรองกำไรและคำขอให้โอนเงินเพิ่ม",
    role: "ผู้ชวนลงทุนในแพลตฟอร์มสมมติที่อ้างผลตอบแทนแน่นอน",
    intro: "มีข้อความชวนลงทุนและรับรองกำไรทุกวัน", claim: "หน้าจอยอดกำไรจำลองแสดงผลตอบแทนสูงผิดปกติ",
    pressure: "เร่งให้โอนค่าปลดล็อกก่อนถอนกำไร", neutral: "มีภาพประกอบกราฟสีสวย",
    request: "ยืนยันโอนค่าปลดล็อกจำลอง", verification: "หยุดโอนและตรวจข้อมูลผู้ให้บริการจากแหล่งอิสระ",
    criticalCode: "CONFIRM_UNVERIFIED_TRANSFER", criticalLabel: "ยืนยันโอนเงินจำลอง", criticalFeedback: "การโอนค่าปลดล็อกก่อนตรวจผู้ให้บริการเป็นความเสี่ยงสำคัญ ให้หยุดและตรวจสอบจากแหล่งอิสระ",
  },
  {
    id: "romance-scam", category: "ROMANCE", title: "ความสัมพันธ์ออนไลน์กับคำขอเงิน", description: "ฝึกแยกความไว้วางใจส่วนตัวออกจากคำขอทางการเงิน",
    role: "คนรู้จักออนไลน์สมมติที่พยายามสร้างความผูกพันแล้วขอเงิน",
    intro: "คนรู้จักออนไลน์พูดคุยอย่างใกล้ชิดและขอความช่วยเหลือ", claim: "เขาอ้างว่ามีเหตุฉุกเฉินแต่ไม่ยอมยืนยันตัวตน",
    pressure: "ขอให้โอนเงินทันทีและเก็บเรื่องนี้เป็นความลับ", neutral: "เขาจำชื่อเล่นของคุณได้",
    request: "ยืนยันโอนเงินช่วยเหลือจำลอง", verification: "หยุดโอน ตรวจตัวตนอย่างอิสระ และปรึกษาคนที่ไว้ใจ",
    criticalCode: "CONFIRM_UNVERIFIED_TRANSFER", criticalLabel: "ยืนยันโอนเงินจำลอง", criticalFeedback: "ความสนิทสนมออนไลน์ไม่ยืนยันตัวตนหรือเหตุฉุกเฉิน ควรหยุดโอนจนกว่าจะตรวจได้อย่างอิสระ",
  },
  {
    id: "ecommerce-scam", category: "ECOMMERCE", title: "ร้านค้าออนไลน์ชวนจ่ายนอกระบบ", description: "พิจารณาราคา รีวิว และการจ่ายเงินที่ไม่มีความคุ้มครอง",
    role: "ผู้ขายร้านค้าสมมติที่ชวนชำระเงินนอกแพลตฟอร์ม",
    intro: "ผู้ขายเสนอสินค้าราคาถูกกว่าปกติ", claim: "ร้านแสดงรีวิวจำนวนมากแต่ตรวจที่มาไม่ได้",
    pressure: "บอกว่าสินค้าจะหมดและให้โอนนอกระบบทันที", neutral: "หน้าร้านมีภาพสินค้าหลายมุม",
    request: "ยืนยันโอนค่าสินค้านอกระบบจำลอง", verification: "ใช้ช่องทางชำระเงินที่มีความคุ้มครองและตรวจร้านค้า",
    criticalCode: "CONFIRM_UNVERIFIED_TRANSFER", criticalLabel: "ยืนยันโอนนอกระบบจำลอง", criticalFeedback: "การจ่ายนอกระบบก่อนตรวจร้านค้าอาจเสียความคุ้มครอง ควรใช้ช่องทางที่ตรวจสอบได้",
  },
  {
    id: "task-scam", category: "TASK", title: "งานออนไลน์ที่ต้องเติมเงินปลดล็อก", description: "สังเกตงานที่จ่ายเล็กน้อยก่อนขอเงินสำรอง",
    role: "ผู้ชวนทำภารกิจออนไลน์สมมติและเรียกให้สำรองเงิน",
    intro: "มีงานกดรับภารกิจง่าย ๆ พร้อมค่าตอบแทน", claim: "รอบแรกจ่ายค่าตอบแทนเล็กน้อยเพื่อสร้างความเชื่อใจ",
    pressure: "ต้องเติมเงินเพื่อปลดล็อกการถอนค่าตอบแทน", neutral: "มีตารางแสดงจำนวนภารกิจ",
    request: "ยืนยันเติมเงินสำรองจำลอง", verification: "หยุดเติมเงินและตรวจความน่าเชื่อถือของผู้ว่าจ้าง",
    criticalCode: "CONFIRM_UNVERIFIED_TRANSFER", criticalLabel: "ยืนยันเติมเงินจำลอง", criticalFeedback: "การจ่ายเงินเพื่อรับค่าจ้างเป็นสัญญาณเสี่ยง ควรหยุดและตรวจผู้ว่าจ้างก่อน",
  },
  {
    id: "fake-loan-scam", category: "FAKE_LOAN", title: "สินเชื่อออนไลน์กับแอปไม่รู้ที่มา", description: "ตรวจค่าธรรมเนียมล่วงหน้าและสิทธิ์ที่แอปขอ",
    role: "ผู้เสนอสินเชื่อสมมติที่อ้างอนุมัติง่ายและชวนติดตั้งแอป",
    intro: "โฆษณาสินเชื่ออ้างว่าอนุมัติได้ทันที", claim: "ผู้เสนอไม่แสดงข้อมูลผู้ให้บริการที่ตรวจสอบได้",
    pressure: "เร่งให้ติดตั้งแอปและให้สิทธิ์เข้าถึงข้อมูลก่อนพิจารณา", neutral: "มีภาพตารางผ่อนชำระประกอบ",
    request: "ยืนยันติดตั้งแอปไม่รู้ที่มาจำลอง", verification: "ตรวจผู้ให้บริการและสิทธิ์แอปผ่านแหล่งทางการก่อน",
    criticalCode: "INSTALL_UNTRUSTED_APP", criticalLabel: "ยืนยันติดตั้งแอปจำลอง", criticalFeedback: "แอปไม่รู้ที่มาอาจเข้าถึงข้อมูลเกินจำเป็น ควรหยุดติดตั้งและตรวจผู้ให้บริการ",
  },
  {
    id: "recovery-scam", category: "RECOVERY", title: "ผู้ติดต่ออ้างช่วยติดตามเงินคืน", description: "ป้องกันการเสียหายซ้ำจากผู้เรียกค่าดำเนินการหรือสิทธิ์เครื่อง",
    role: "ผู้ติดตามเงินคืนสมมติที่อ้างรู้ข้อมูลคดีและขอเข้าถึงอุปกรณ์",
    intro: "มีผู้ติดต่ออ้างว่าช่วยติดตามเงินที่สูญเสียได้", claim: "เขาอ้างว่ารู้ข้อมูลคดีเดิมบางส่วน",
    pressure: "เร่งให้เปิดสิทธิ์ควบคุมอุปกรณ์เพื่อดำเนินการคืนเงิน", neutral: "เขาพูดด้วยน้ำเสียงให้กำลังใจ",
    request: "ยืนยันให้ควบคุมอุปกรณ์จำลอง", verification: "ปฏิเสธสิทธิ์เครื่องและตรวจสอบกับช่องทางรับแจ้งเหตุทางการ",
    criticalCode: "GRANT_REMOTE_CONTROL", criticalLabel: "ยืนยันให้ควบคุมเครื่องจำลอง", criticalFeedback: "การให้บุคคลที่ติดต่อมาเองควบคุมเครื่องเสี่ยงต่อข้อมูลและบัญชี ควรปฏิเสธและตรวจสอบทางการ",
  },
  {
    id: "job-scam", category: "JOB", title: "ข้อเสนองานที่เรียกค่าฝึกอบรม", description: "ตรวจประกาศงาน ค่าธรรมเนียม และคำขอใช้บัญชี",
    role: "ผู้รับสมัครงานสมมติที่เสนอรายได้สูงและเรียกเงินก่อนเริ่มงาน",
    intro: "ประกาศงานเสนอรายได้สูงโดยไม่บอกหน้าที่ชัดเจน", claim: "ผู้รับสมัครใช้ชื่อบริษัทที่ตรวจสอบไม่ได้",
    pressure: "ต้องโอนค่าฝึกอบรมวันนี้จึงจะได้ตำแหน่ง", neutral: "มีภาพสำนักงานประกอบประกาศ",
    request: "ยืนยันโอนค่าฝึกอบรมจำลอง", verification: "ตรวจบริษัทจากช่องทางทางการและไม่จ่ายก่อนยืนยันงาน",
    criticalCode: "CONFIRM_UNVERIFIED_TRANSFER", criticalLabel: "ยืนยันจ่ายค่าฝึกอบรมจำลอง", criticalFeedback: "งานที่ต้องจ่ายเงินก่อนเริ่มและตรวจบริษัทไม่ได้มีความเสี่ยง ควรหยุดโอนและตรวจที่มา",
  },
];

function createScenario(c: ScenarioContent): ScenarioTemplate {
  const stopLabel = c.category === "CALL_CENTER" ? "วางสายอย่างปลอดภัย" : "ยุติการติดต่ออย่างปลอดภัย";
  const refusalCode = c.criticalCode === "DISCLOSE_OTP" ? "REFUSE_OTP"
    : c.criticalCode === "CONFIRM_UNVERIFIED_TRANSFER" ? "REFUSE_TRANSFER" : "REFUSE_SENSITIVE_INFO";
  return {
    id: c.id, version: 1, evaluationMode: "DECISION_RULES_V1", publicFeedbackEnabled: true, publicActionBindings: true,
    category: c.category, variant: c.category === "CALL_CENTER" ? "SCAM_CALL" : "DEFAULT",
    title: c.title, description: c.description, characterRole: c.role,
    learningObjectives: ["ตรวจสอบตัวตนและที่มา", "สังเกตคำขอและแรงกดดัน", "ยุติการติดต่ออย่างปลอดภัย"],
    fictionalOnly: true, initialState: "contact",
    states: [
      { id: "contact", objective: "พิจารณาการติดต่อครั้งแรก", allowedBehaviors: [c.intro], forbiddenBehaviors: ["ขอข้อมูลจริง"],
        allowedEventCodes: ["VERIFY_SOURCE"], fallbackMessage: c.intro, transitions: [
          { id: "end-contact-early", target: "end_scenario", publicLabel: stopLabel, requiresFinalized: [], requiresEvents: [], safeResolution: true, earlySafeResolution: true },
          { id: "read-claim", target: "build_trust", publicLabel: "พิจารณาข้ออ้างต่อ", requiresFinalized: ["d1"], requiresEvents: [], safeResolution: false },
        ] },
      { id: "build_trust", objective: "ตรวจหลักฐานและสัญญาณเตือน", allowedBehaviors: [c.claim, c.pressure], forbiddenBehaviors: ["สร้างหลักฐานใหม่"],
        allowedEventCodes: ["IDENTIFY_WARNING_SIGN"], fallbackMessage: c.claim, transitions: [
          { id: "consider-request", target: "request_action", publicLabel: "พิจารณาคำขอ", requiresFinalized: ["w1"], requiresEvents: [], safeResolution: false },
        ] },
      { id: "request_action", objective: "ตอบสนองต่อคำขอที่เสี่ยง", allowedBehaviors: [c.request], forbiddenBehaviors: ["รับเงินจริงหรือข้อมูลจริง"],
        allowedEventCodes: [refusalCode, c.criticalCode], fallbackMessage: c.request, transitions: [
          { id: "choose-response", target: "user_verification", publicLabel: "เลือกวิธีรับมือ", requiresFinalized: ["d2"], requiresEvents: [], safeResolution: false },
        ] },
      { id: "user_verification", objective: "ตรวจสอบและยุติการติดต่อ", allowedBehaviors: [c.verification], forbiddenBehaviors: ["ติดต่อหรือทำธุรกรรมจริง"],
        allowedEventCodes: ["VERIFY_SOURCE", "END_CONTACT", "REPORT_INCIDENT"], fallbackMessage: c.verification, transitions: [
          { id: "resolve", target: "end_scenario", publicLabel: "จบสถานการณ์", requiresFinalized: ["d1", "w1", "d2", "s1"], requiresEvents: ["END_CONTACT"], safeResolution: true },
        ] },
      { id: "end_scenario", objective: "สิ้นสุดสถานการณ์", allowedBehaviors: [], forbiddenBehaviors: ["เปลี่ยนผลประเมิน"],
        allowedEventCodes: [], fallbackMessage: "สิ้นสุดสถานการณ์จำลอง", transitions: [] },
    ],
    opportunities: [
      { id: "d1", state: "contact", skill: "D", required: true, activation: "STATE_ENTRY", publicCheckpointLabel: "ตรวจสอบผู้ติดต่อ",
        unassessedFeedback: "ยังไม่ได้ยืนยันวิธีตรวจสอบผู้ติดต่อ", choices: [
          { id: "verify", rating: "safe", assessment: "SAFE", publicLabel: "ตรวจสอบจากช่องทางอื่น", publicFeedback: "การตรวจสอบจากช่องทางอิสระช่วยลดการเชื่อคำอ้างของผู้ติดต่อ", eventCodes: ["VERIFY_SOURCE"] },
          { id: "wait", rating: "partially_safe", assessment: "REVIEW", publicLabel: "รอดูข้อมูลเพิ่ม", publicFeedback: "การรอข้อมูลเพิ่มจากผู้ติดต่อเดิมยังไม่ยืนยันตัวตน", eventCodes: [] },
          { id: "trust", rating: "risky", assessment: "REVIEW", publicLabel: "เชื่อคำกล่าวอ้างทันที", publicFeedback: "คำกล่าวอ้างจากผู้ติดต่อยังไม่ใช่หลักฐานยืนยันตัวตน", eventCodes: [] },
        ] },
      { id: "w1", state: "build_trust", skill: "W", required: true, activation: "STATE_ENTRY", publicCheckpointLabel: "สัญญาณเตือนในข้ออ้าง",
        unassessedFeedback: "ยังไม่ได้ยืนยันหลักฐานที่สังเกตในขั้นตอนนี้", assessmentRule: "ALL_WARNINGS_NO_FALSE_POSITIVES",
        safeFeedback: "แยกสัญญาณเตือนออกจากรายละเอียดทั่วไปได้ครบในเส้นทางนี้",
        reviewFeedback: "ควรตรวจคำขอและแรงกดดันโดยไม่ใช้รายละเอียดทั่วไปเป็นหลักฐานยืนยัน",
        evidence: [
          { id: "unverified-claim", text: c.claim, warningSignId: "unverified-claim" },
          { id: "pressure", text: c.pressure, warningSignId: "pressure" },
          { id: "neutral-detail", text: c.neutral, warningSignId: null },
        ] },
      { id: "d2", state: "request_action", skill: "D", required: true, activation: "STATE_ENTRY", publicCheckpointLabel: "ตอบสนองต่อคำขอ",
        unassessedFeedback: "ยังไม่ได้ยืนยันการตอบสนองต่อคำขอ", choices: [
          { id: "refuse", rating: "safe", assessment: "SAFE", publicLabel: "ปฏิเสธคำขอและตรวจสอบ", publicFeedback: "การปฏิเสธคำขอที่ยังตรวจไม่ได้ช่วยจำกัดความเสี่ยง", eventCodes: [refusalCode] },
          { id: "ask-caller", rating: "partially_safe", assessment: "REVIEW", publicLabel: "ถามผู้ติดต่อเดิมเพิ่มเติม", publicFeedback: "คำตอบจากผู้ติดต่อเดิมยังไม่ยืนยันว่าคำขอปลอดภัย", eventCodes: [] },
          { id: "continue", rating: "risky", assessment: "REVIEW", publicLabel: "ดำเนินการต่อก่อนตรวจสอบ", publicFeedback: "การดำเนินการต่อก่อนตรวจที่มาเพิ่มความเสี่ยง", eventCodes: [] },
        ] },
      { id: "s1", state: "user_verification", skill: "S", required: true, activation: "STATE_ENTRY", publicCheckpointLabel: "ยุติและจัดการเหตุ",
        unassessedFeedback: "ยังไม่ได้ยืนยันวิธียุติการติดต่อ", actions: [
          { id: "verify-end-report", assessment: "SAFE", publicLabel: "ตรวจสอบ ยุติ และรายงาน", publicFeedback: c.verification, eventCodes: ["VERIFY_SOURCE", "END_CONTACT", "REPORT_INCIDENT"] },
          { id: "end-contact", assessment: "SAFE", publicLabel: stopLabel, publicFeedback: "ยุติการติดต่อช่วยหยุดคำขอที่ยังตรวจไม่ได้", eventCodes: ["END_CONTACT"] },
          { id: "dismiss", assessment: "REVIEW", publicLabel: "ปิดการสนทนาโดยไม่ตรวจต่อ", publicFeedback: "แม้หยุดการติดต่อแล้ว ยังควรตรวจสอบหรือเก็บหลักฐานเมื่อมีเหตุเสี่ยง", eventCodes: ["END_CONTACT"] },
        ] },
    ],
    criticalFailureRules: [{ id: "confirm-harmful-action", state: "request_action", opportunityId: "d2", eventCode: c.criticalCode,
      publicLabel: c.criticalLabel, publicFeedback: c.criticalFeedback, requiresExplicitAction: true, requiresAbsentEvents: [] }],
    recommendations: {
      D: { type: "DECISION_PRACTICE", key: `${c.id}-decision`, reason: `ทบทวนการตรวจสอบที่มาและคำขอในสถานการณ์ ${c.title}` },
      W: { type: "WARNING_SIGN_LESSON", key: `${c.id}-warnings`, reason: `ทบทวนสัญญาณเตือนของสถานการณ์ ${c.title}` },
      S: { type: "SAFE_ACTION_CONTENT", key: `${c.id}-response`, reason: `ทบทวนวิธียุติและจัดการเหตุในสถานการณ์ ${c.title}` },
      critical: { type: "CRITICAL_FAILURE_REVIEW", key: `${c.id}-critical`, reason: c.criticalFeedback },
    },
  };
}

export const additionalScamScenarios: ScenarioTemplate[] = content.map(createScenario);
