import { z } from "zod";
import { errorEnvelope, successEnvelope } from "../public-api/contracts.js";

export const errorMessages: Record<string, string> = {
  INVALID_REQUEST: "ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง",
  UNAUTHENTICATED: "กรุณาเข้าสู่ระบบเพื่อใช้งานต่อ",
  INVALID_ORIGIN: "ไม่สามารถส่งคำขอจากหน้านี้ได้ กรุณาเปิดเว็บไซต์จากที่อยู่หลัก",
  ACCOUNT_ALREADY_EXISTS: "อีเมลนี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบ",
  SCENARIO_NOT_FOUND: "ไม่พบสถานการณ์นี้ กรุณากลับไปเลือกสถานการณ์",
  SESSION_NOT_FOUND: "ไม่พบรอบฝึกนี้ หรือคุณไม่มีสิทธิ์เข้าถึง",
  RESULT_NOT_FOUND: "ยังไม่มีผลการฝึกสำหรับรอบนี้",
  REVISION_CONFLICT: "รอบฝึกมีการเปลี่ยนแปลง ระบบกำลังโหลดข้อมูลล่าสุด กรุณาตรวจสอบก่อนทำรายการใหม่",
  IDEMPOTENCY_CONFLICT: "คำขอนี้ไม่ตรงกับรายการเดิม กรุณาตรวจสอบข้อมูลล่าสุดก่อนทำรายการใหม่",
  SESSION_EXPIRED: "รอบฝึกหมดอายุแล้ว กรุณาเริ่มสถานการณ์ใหม่",
  PAYLOAD_TOO_LARGE: "ข้อมูลยาวเกินไป กรุณาลดความยาวแล้วลองอีกครั้ง",
  INVALID_ACTION: "ไม่สามารถทำรายการนี้ได้ในขณะนี้ กรุณาตรวจสอบตัวเลือก",
  INVALID_STATE: "กรุณาทำขั้นตอนปัจจุบันให้ครบก่อน",
  SESSION_NOT_ACTIVE: "รอบฝึกนี้สิ้นสุดแล้ว กรุณาตรวจสอบสถานะล่าสุด",
  PROVIDER_UNAVAILABLE: "ระบบสนทนายังไม่พร้อม กรุณาลองอีกครั้ง",
  INTERNAL_ERROR: "ระบบไม่สามารถทำรายการได้ในขณะนี้ กรุณาลองอีกครั้ง",
  NETWORK_ERROR: "การเชื่อมต่อขัดข้อง ยังยืนยันผลรายการไม่ได้ กรุณาลองส่งคำขอเดิมอีกครั้ง",
  INVALID_RESPONSE: "ยังยืนยันผลจากระบบไม่ได้ กรุณาลองอีกครั้ง",
};
export class ApiFailure extends Error {
  constructor(readonly code: string, readonly status: number) { super(errorMessages[code] ?? errorMessages.INTERNAL_ERROR); }
  get uncertain() { return this.status === 0 || this.status >= 500; }
}
export async function api<T>(path: string, schema: z.ZodType<T>, options: { body?: string; signal?: AbortSignal } = {}): Promise<T> {
  const timeout = AbortSignal.timeout(50000);
  try {
    const response = await fetch(path, {
      method: options.body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
      ...(options.body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: options.body }),
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    });
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = errorEnvelope.safeParse(value);
      const code = parsed.success && Object.hasOwn(errorMessages, parsed.data.error.code) ? parsed.data.error.code
        : response.status === 401 ? "UNAUTHENTICATED" : "INTERNAL_ERROR";
      throw new ApiFailure(code, response.status);
    }
    const parsed = successEnvelope(schema).safeParse(value);
    if (!parsed.success) throw new ApiFailure("INVALID_RESPONSE", 0);
    return parsed.data.data;
  } catch (error) {
    if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure("NETWORK_ERROR", 0);
  }
}

/** Snapshot the entire wire request once. A retry cannot replace ID, payload or revision. */
export class MutationAttempt {
  readonly body: string;
  constructor(readonly path: string, input: unknown) { this.body = JSON.stringify(input); }
}
