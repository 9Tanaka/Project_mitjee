import type { ScenarioState } from "../domain/types.js";
import type { CALL_SIGNALS } from "../domain/call-signals.js";

export interface LearningSource { title: string; url: string; reviewedAt: string }
export interface TutorialContent {
  id: string; state: ScenarioState; signal: typeof CALL_SIGNALS[number]; title: string;
  explanation: string; independentVerification: string[]; commonMistakes: string[]; nextTimePrevention: string[];
}
export interface RecoveryContent {
  ruleId: string; eventCode: "CONFIRM_UNVERIFIED_TRANSFER" | "DISCLOSE_OTP";
  incidentType: "MONEY_TRANSFERRED" | "OTP_OR_CREDENTIAL_DISCLOSED";
  immediateActions: string[]; evidenceToPreserve: string[];
  officialHelp: { category: "BANK" | "AOC" | "POLICE"; label: string; url: string }[];
  accountRecoverySteps: string[]; nextTimePrevention: string[]; retryRecommendation: string;
  sources: LearningSource[];
}
export interface CallCenterLearningContent {
  contentId: string; contentVersion: number; reviewedAt: string;
  binding: { templateId: string; templateVersion: number; variant: "SCAM_CALL" | "NORMAL_CALL" };
  checkpoints: { checkpointId: string; unansweredAlternative: string; choices: Record<string, string> }[];
  tutorials: TutorialContent[]; recovery: RecoveryContent[]; sources: LearningSource[];
}

// Reviewed against official BOT, MDES/AOC and Thai Police Online sources. No model-authored instructions.
const reviewedAt = "2026-10-25";
const bot: LearningSource = { title: "ธนาคารแห่งประเทศไทย — รับมือภัยทุจริตทางการเงิน", reviewedAt,
  url: "https://www.bot.or.th/th/research-and-publications/articles-and-publications/bot-magazine-issues/phrasiam-69-1/Financial-fraud-in-the-age-of-AI.html" };
const botOtp: LearningSource = { title: "ธนาคารแห่งประเทศไทย — กลโกงธนาคารออนไลน์", reviewedAt,
  url: "https://www.bot.or.th/th/satang-story/fraud/online-fraud.html" };
const aoc: LearningSource = { title: "กระทรวงดิจิทัลฯ — ศูนย์ AOC 1441", reviewedAt, url: "https://mdes.go.th/mission/153/" };
const police: LearningSource = { title: "สำนักงานตำรวจแห่งชาติ — Thai Police Online", reviewedAt, url: "https://www.thaipoliceonline.go.th/" };
const help: RecoveryContent["officialHelp"] = [
  { category: "BANK", label: "แนวทางรับมือและติดต่อธนาคารเจ้าของบัญชี — ธนาคารแห่งประเทศไทย", url: bot.url },
  { category: "AOC", label: "โทร AOC 1441 ด้วยตนเอง — ดูข้อมูลจากกระทรวงดิจิทัลฯ", url: aoc.url },
  { category: "POLICE", label: "แจ้งเหตุอาชญากรรมทางเทคโนโลยีผ่าน Thai Police Online", url: police.url },
];
const transfer: RecoveryContent = {
  ruleId: "CONFIRM_SIMULATED_TRANSFER", eventCode: "CONFIRM_UNVERIFIED_TRANSFER", incidentType: "MONEY_TRANSFERRED",
  immediateActions: ["หยุดโอนเงินเพิ่มและยุติการติดต่อกับผู้ที่กล่าวอ้าง", "ติดต่อธนาคารต้นทางหรือโทร AOC 1441 โดยเร็ว เพื่อขอความช่วยเหลือระงับธุรกรรมและแจ้งเหตุผ่านช่องทางทางการ"],
  evidenceToPreserve: ["หลักฐานการโอน วันเวลา จำนวนเงิน และบัญชีปลายทาง", "ประวัติการโทร ข้อความ และข้อกล่าวอ้างที่ใช้ขอให้โอนเงิน"],
  officialHelp: help,
  accountRecoverySteps: ["ตรวจรายการที่ไม่รู้จักและให้ธนาคารตรวจสอบธุรกรรมที่เกี่ยวข้อง", "ดำเนินการติดตามเหตุและดูแลบัญชีตามคำแนะนำของสถาบันการเงิน การช่วยเหลือไม่ได้รับประกันว่าจะได้เงินคืน"],
  nextTimePrevention: ["ตรวจสอบกับหน่วยงานผ่านช่องทางที่หาเองก่อนโอน", "ไม่โอนเงินเพียงเพื่อพิสูจน์ความบริสุทธิ์ตามคำกล่าวอ้างในสาย"],
  retryRecommendation: "ทบทวนจุดคำขอโอน แล้วลองฝึก Call Center อีกครั้ง", sources: [bot, aoc, police],
};
const otp: RecoveryContent = {
  ruleId: "SHARE_SIMULATED_OTP", eventCode: "DISCLOSE_OTP", incidentType: "OTP_OR_CREDENTIAL_DISCLOSED",
  immediateActions: ["หยุดบอกรหัสเพิ่มเติมและยุติสาย", "ติดต่อธนาคารเจ้าของบัญชีผ่านช่องทางทางการที่หาเองทันที และแจ้งว่าได้เปิดเผย OTP"],
  evidenceToPreserve: ["เวลาเกิดเหตุ ประวัติการโทรและข้อความที่เกี่ยวข้อง", "บริบทธุรกรรมที่รหัสนั้นอ้างถึง โดยไม่ส่ง OTP หรือรหัสผ่านจริงเข้าระบบ MITJEE"],
  officialHelp: help,
  accountRecoverySteps: ["ให้ผู้ให้บริการตรวจการเข้าถึงบัญชีและธุรกรรมที่ไม่ได้อนุญาต พร้อมระงับหรือกู้คืนตามข้อเท็จจริง", "หากพบความเสียหายหรือการใช้งานที่ไม่ได้อนุญาต ให้แจ้งเหตุผ่านช่องทางทางการ การเปิดเผย OTP เพียงอย่างเดียวยังไม่ยืนยันว่าบัญชีถูกยึดหรือเงินสูญแล้ว"],
  nextTimePrevention: ["อ่านวัตถุประสงค์ของรหัสและไม่เปิดเผย OTP แก่ผู้ติดต่อ", "ตรวจคำขอผ่านธนาคารด้วยช่องทางที่มีอยู่เอง"],
  retryRecommendation: "ทบทวนความต่างระหว่างอ่านรหัสกับยืนยันบอกรหัส แล้วลองฝึก Call Center อีกครั้ง", sources: [botOtp, aoc, police],
};
const baseChoices = {
  end: "หากยังมีข้อสงสัย ให้ตรวจต่อผ่านช่องทางที่มีอยู่เอง การวางสายยังไม่ใช่การยืนยันตัวตนผู้โทร",
  callback: "ลงมือตรวจสอบต่อผ่านช่องทางที่หาเอง การเลือกจบสายนี้เป็นความตั้งใจ ยังไม่ยืนยันว่าติดต่อหรือตรวจสอบสำเร็จ",
  caution: "รักษาขอบเขตข้อมูลต่อไป และตรวจจากแหล่งที่มีอยู่เองก่อนเชื่อหรือทำตามคำขอ",
};
const trust = "ตรวจข้อมูลในแอปของตนเองและติดต่อหน่วยงานผ่านช่องทางที่หาเอง แทนการใช้คำกล่าวอ้างของผู้โทรยืนยันตัวเอง";
function authored(parcel: boolean, scam: boolean, contentId: string): CallCenterLearningContent {
  const verify = parcel ? "ตรวจคำสั่งซื้อ เลขพัสดุ สินค้า และช่วงจัดส่งในแอปที่คุณใช้อยู่เอง"
    : "เปรียบเทียบจำนวนเงิน เวลา และรายละเอียดรายการในแอปธนาคารที่คุณเปิดเอง";
  const tutorials: TutorialContent[] = [{ id: "context", state: "CONTEXT_CLAIM", signal: "VERIFY_CONTEXT",
    title: parcel ? "การตรวจข้อมูลพัสดุ" : "การตรวจรายการธนาคาร",
    explanation: scam ? (parcel ? "ผู้โทรกล่าวอ้างว่าพัสดุเกี่ยวข้องกับคดี ข้อมูลอ้างอิงในสายยังไม่ใช่หลักฐานยืนยันข้อกล่าวอ้างหรือตัวตนผู้โทร"
      : "ผู้โทรกล่าวอ้างว่ามีรายการผิดปกติ ควรแยกคำกล่าวอ้างออกจากรายการที่ปรากฏในบัญชีของคุณเอง")
      : "การรับข้อมูลทั่วไปควรพิจารณาตามบริบทและเปรียบเทียบกับข้อมูลที่มีอยู่เอง โดยไม่ให้ข้อมูลเกินความจำเป็น",
    independentVerification: [verify, "ติดต่อหน่วยงานผ่านช่องทางที่หาเอง หากยังมีข้อสงสัย"],
    commonMistakes: ["ถือว่าชื่อองค์กรหรือเลขอ้างอิงที่ผู้โทรบอกเป็นหลักฐานยืนยันตัวตน", "เข้าใจว่าการเปิดแอปอย่างเดียวเท่ากับตรวจสอบสำเร็จ"],
    nextTimePrevention: [verify, "แยกการตรวจข้อมูลรายการออกจากการยืนยันตัวตนผู้โทร"],
  }];
  if (scam) {
    tutorials.push({ id: "urgency", state: "PRESSURE", signal: "URGENCY_PRESSURE", title: "การเร่งให้ตัดสินใจ",
      explanation: "ในสายนี้มีการเร่งให้ทำตามคำขอ ความเร่งด่วนอาจลดโอกาสตรวจสอบข้อเท็จจริง",
      independentVerification: ["หยุดตัดสินใจชั่วคราวและตรวจคำกล่าวอ้างผ่านช่องทางอิสระ"],
      commonMistakes: ["ใช้ความเร่งด่วนเป็นเหตุให้ข้ามการตรวจสอบ"], nextTimePrevention: ["ให้เวลาตนเองตรวจสอบก่อนดำเนินการ"] },
    { id: "secrecy", state: "PRESSURE", signal: "SECRECY_PRESSURE", title: "คำขอให้เก็บเรื่องเป็นความลับ",
      explanation: "ในสายนี้มีคำขอให้เก็บเรื่องเป็นความลับ ซึ่งอาจขัดขวางการขอคำปรึกษาหรือตรวจสอบจากแหล่งอื่น",
      independentVerification: ["ตรวจคำกล่าวอ้างกับหน่วยงานผ่านช่องทางที่มีอยู่เอง"], commonMistakes: ["งดตรวจสอบกับแหล่งอื่นเพราะผู้โทรสั่งให้เก็บเป็นความลับ"],
      nextTimePrevention: ["ไม่ให้คำสั่งในสายปิดกั้นการตรวจสอบอย่างอิสระ"] });
  }
  tutorials.push({ id: "request", state: "MAIN_REQUEST", signal: scam ? (parcel ? "TRANSFER_REQUEST" : "OTP_REQUEST") : (parcel ? "DELIVERY_CONFIRMATION" : "TRANSACTION_NOTIFICATION"),
    title: scam ? (parcel ? "คำขอให้โอนเงินจำลอง" : "คำขอให้บอก OTP จำลอง") : (parcel ? "การยืนยันช่วงจัดส่ง" : "การรับทราบรายการทั่วไป"),
    explanation: scam ? (parcel ? "ผู้โทรขอให้โอนเงินเพื่อการตรวจสอบตามคำกล่าวอ้าง คำขอนี้ต้องแยกจากหลักฐานที่คุณตรวจได้เอง"
      : "ผู้โทรขอรหัสยืนยันในข้อความ การอ่านรหัสในแอปต่างจากการยืนยันเปิดเผยรหัสแก่ผู้โทร")
      : (parcel ? "การยืนยันหรือเปลี่ยนช่วงจัดส่งควรจำกัดข้อมูลให้เหมาะกับงานจัดส่ง" : "การรับทราบรายการทั่วไปทำได้โดยไม่เปิดเผยข้อมูลลับ"),
    independentVerification: [verify],
    commonMistakes: scam ? [parcel ? "โอนเงินเพราะเชื่อว่าจะช่วยยืนยันข้อกล่าวอ้างในสาย" : "เชื่อว่าการบอก OTP แก่ผู้โทรเป็นขั้นตอนแก้ปัญหา"] : ["ให้ข้อมูลเกินความจำเป็นต่อเรื่องที่ติดต่อ"],
    nextTimePrevention: scam ? [parcel ? "ไม่โอนเงินตามคำกล่าวอ้างก่อนตรวจสอบอย่างอิสระ" : "ไม่เปิดเผย OTP แก่ผู้ติดต่อ"] : ["ตอบตามบริบทและให้เฉพาะข้อมูลที่จำเป็น"],
  });
  return { contentId, contentVersion: 1, reviewedAt,
    binding: { templateId: parcel ? "call-center-parcel" : "call-center-bank", templateVersion: 6, variant: scam ? "SCAM_CALL" : "NORMAL_CALL" },
    checkpoints: [
      { checkpointId: "cp-CONTEXT_CLAIM", unansweredAlternative: verify,
        choices: { ...baseChoices, checked: "ตรวจข้อมูลในแอปแล้ว หากยังมีข้อสงสัยให้ติดต่อหน่วยงานโดยตรง การเปรียบเทียบรายการไม่ใช่การโทรยืนยันกับองค์กรจริง", ...(scam ? { trust } : {}) } },
      ...(scam ? [{ checkpointId: "cp-PRESSURE", unansweredAlternative: "ให้เวลาตนเองตรวจสอบก่อนทำตามคำขอ", choices: { ...baseChoices, trust } }] : []),
      { checkpointId: "cp-MAIN_REQUEST", unansweredAlternative: "พิจารณาคำขอที่ปรากฏและยืนยันการเลือกผ่านตัวควบคุมของแบบฝึก",
        choices: { ...baseChoices, ...(scam ? { trust, refuse: "คงการปฏิเสธไว้ และตรวจคำกล่าวอ้างผ่านช่องทางที่มีอยู่เอง" }
          : parcel ? { confirm: "ยืนยันเฉพาะรายละเอียดที่จำเป็นต่อการจัดส่ง", reschedule: "เปลี่ยนช่วงจัดส่งโดยจำกัดข้อมูลตามบริบท", limit: "ให้ข้อมูลเท่าที่จำเป็นและตรวจรายละเอียดจากคำสั่งซื้อของตนเอง" }
            : { acknowledge: "รับทราบข้อมูลโดยไม่เปิดเผยข้อมูลลับ และตรวจรายการผ่านแอปที่มีอยู่เอง" }) } },
    ], tutorials, recovery: scam ? [parcel ? transfer : otp] : [], sources: [bot, botOtp, aoc, police] };
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
// Exact immutable bindings, never a latest-version lookup. IDs contain no hidden story labels.
export const callCenterLearningContent: readonly CallCenterLearningContent[] = freeze([
  authored(true, true, "L-16859b28-a081-4e6c-a397-6821e479b190"),
  authored(false, true, "L-f93f06e1-b365-48f1-8c1e-52f4d786d458"),
  authored(true, false, "L-972cd7d2-f2d8-4fbd-9f3e-730a61068051"),
  authored(false, false, "L-0114e86b-6ba8-41b3-8044-3a7899850f94"),
]);
