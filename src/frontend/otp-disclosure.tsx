"use client";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { mutationDto, sessionDto } from "../public-api/contracts.js";
import { api, ApiFailure, MutationAttempt } from "./api.js";

type Session = z.infer<typeof sessionDto>;
/** One explicit consent, then existing backend-projected phone actions. No text or code is sent. */
export function useOtpDisclosure(session: Session, onSession: (s: Session) => void, reload: () => Promise<void>, completed: () => void) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const running = useRef(false), snapshot = useRef(session), attempt = useRef<MutationAttempt | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function begin() {
    if (running.current || !session.phone?.otpMessage || session.status !== "ACTIVE") return;
    snapshot.current = session; attempt.current = null; setError(null); setUncertain(false); setOpen(true);
  }
  function cancel() {
    if (running.current || uncertain) return;
    setOpen(false); setError(null);
    requestAnimationFrame(() => document.getElementById("phone-text")?.focus());
  }
  async function confirm() {
    if (running.current) return;
    if (!attempt.current && (session.sessionId !== snapshot.current.sessionId || session.revision !== snapshot.current.revision)) {
      setError(new ApiFailure("REVISION_CONFLICT", 409)); await reload(); return;
    }
    running.current = true; setBusy(true); setError(null);
    controller.current = new AbortController();
    try {
      // At most return-to-call, open Messages, view, prepare, confirm. Targets come from Backend.
      for (let step = 0; step < 5; step++) {
        const current = snapshot.current, next = current.phone?.otpMessage?.nextAction;
        if (!next || current.status !== "ACTIVE") throw new ApiFailure("INVALID_ACTION", 422);
        attempt.current ??= new MutationAttempt(`/api/training/${encodeURIComponent(current.sessionId)}/action`, {
          actionId: crypto.randomUUID(), expectedRevision: current.revision, actionDefinitionId: next.id,
          payload: next.confirmed ? { confirmed: true } : {},
        });
        const reply = await api(attempt.current.path, mutationDto, { body: attempt.current.body, signal: controller.current.signal });
        attempt.current = null; snapshot.current = reply.session; onSession(reply.session); setUncertain(false);
        if (reply.session.phone?.criticalEnding) { setOpen(false); completed(); return; }
      }
      throw new ApiFailure("INVALID_STATE", 422);
    } catch (cause) {
      if (controller.current?.signal.aborted) return;
      const failure = cause instanceof ApiFailure ? cause : new ApiFailure("NETWORK_ERROR", 0);
      setError(failure); setUncertain(failure.uncertain);
      if (!failure.uncertain) { attempt.current = null; await reload(); }
    } finally { running.current = false; setBusy(false); }
  }
  return { open, busy, error, uncertain, begin, cancel, confirm };
}

export function OtpDisclosureDialog({ flow }: { flow: ReturnType<typeof useOtpDisclosure> }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return <section ref={ref} tabIndex={-1} className="phone-action-sheet phone-otp-confirmation" role="dialog" aria-modal="true" aria-labelledby="otp-confirm-title"
    onKeyDown={e => {
      if (e.key === "Escape") flow.cancel();
      if (e.key === "Tab") {
        const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
        const first = buttons[0], last = buttons.at(-1);
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first?.focus(); }
      }
    }}>
    <h3 id="otp-confirm-title">คุณกำลังจะบอกรหัส OTP จำลองแก่ผู้โทร</h3>
    <p>ในเหตุการณ์จริง รหัส OTP เป็นข้อมูลยืนยันที่ไม่ควรบอกแก่ผู้ที่ติดต่อเข้ามา</p>
    <p className="field-hint">รายการนี้ใช้เฉพาะรหัสจำลองใน MITJEE ไม่มีการส่งรหัสจริง</p>
    {flow.error && <p role="alert">{flow.error.message}</p>}
    {flow.busy && <p role="status">กำลังบันทึกการยืนยัน…</p>}
    <button className="button button-secondary mt-4" disabled={flow.busy || flow.uncertain} onClick={flow.cancel}>กลับไปแก้ข้อความ</button>
    <button className="button mt-4" disabled={flow.busy || (!!flow.error && !flow.uncertain)} onClick={() => void flow.confirm()}>
      {flow.uncertain ? "ตรวจสอบคำยืนยันเดิมอีกครั้ง" : "ยืนยันบอกรหัสจำลอง"}</button>
  </section>;
}
