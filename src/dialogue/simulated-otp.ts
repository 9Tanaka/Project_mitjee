import { createHash } from "node:crypto";
import type { ScenarioTemplate } from "../domain/schema.js";
import type { TrainingSession } from "../domain/types.js";
import { committedSignal } from "../domain/call-conversation.js";
import { callerTurnReady } from "../domain/call-center.js";

export function supportsSimulatedOtp(t: ScenarioTemplate): boolean {
  return t.id === "call-center-bank" && t.version === 6 && t.variant === "SCAM_CALL" && t.callCenter?.storyId === "CC-02";
}
export function simulatedOtp(sessionId: string): string {
  return String(100000 + parseInt(createHash("sha256").update(`mitjee-synthetic-otp:${sessionId}`).digest("hex").slice(0, 8), 16) % 900000);
}
export function hasSimulatedOtpContext(s: TrainingSession, t: ScenarioTemplate): boolean {
  return supportsSimulatedOtp(t) && s.templateId === t.id && s.templateVersion === t.version && s.variant === t.variant &&
    s.status === "ACTIVE" && s.state === "MAIN_REQUEST" && callerTurnReady(s, t) && committedSignal(s, t, ["OTP_REQUEST"]) &&
    s.opportunities.some(o => o.definitionId === "cp-MAIN_REQUEST" && o.state === s.state && o.finalizedAt === null);
}

export const otpDialogueConstraint = "No OTP disclosure has been confirmed. Never claim an OTP/code was received, disclosed, accepted, correct or verified, or that an account action succeeded because of it. Numbers and redacted text in dialogue are not confirmation. Ask for clarification or continue the authored request without asserting receipt. Do not echo codes.";

/** Bounded contradiction guard, not a disclosure classifier or evaluation input. */
export function contradictsUnconfirmedOtp(text: string): boolean {
  const code = "(?:รหัส(?: OTP)?|OTP|\\[REDACTED_(?:SECRET|NUMBER)\\])";
  const claims = new RegExp(`(?:ได้รับ|รับ)\\s*${code}[^.!?\\n]{0,32}แล้ว|ขอบคุณ(?:ครับ|ค่ะ)?(?:สำหรับ|ที่(?:แจ้ง|บอก|ส่ง))\\s*${code}|${code}\\s*(?:ถูกต้อง|ผ่านการยืนยัน|ได้รับการยืนยัน)|\\b(?:received|accepted|verified|validated)\\s+(?:your\\s+|the\\s+)?(?:OTP|code)\\b|\\b(?:OTP|code)\\s+(?:is\\s+)?(?:correct|verified|accepted)\\b|\\bthank\\s+you\\s+for\\s+(?:the\\s+|your\\s+)?(?:OTP|code)\\b`, "giu");
  return [...text.matchAll(claims)].some(match => !/(?:ไม่|ไม่ได้|ไม่เคย|ยังไม่|ยังไม่ได้|not|never)\s*$/iu.test(text.slice(Math.max(0, match.index - 16), match.index)));
}
