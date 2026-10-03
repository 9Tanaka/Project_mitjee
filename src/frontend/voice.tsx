"use client";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { sessionDto, messageDto } from "../public-api/contracts.js";
import { startMicrophone, type Recording } from "./microphone.js";
import { encodeAudio, httpVoice, socketVoice, type VoiceRequest, type VoiceResponse } from "./call-transport.js";
import { ApiFailure } from "./api.js";

export function VoiceControls({ session, disabled, onReply, onBusy, reload }: {
  session: z.infer<typeof sessionDto>; disabled: boolean; onReply: (reply: z.infer<typeof messageDto>) => void;
  onBusy: (busy: boolean) => void; reload: () => Promise<void>;
}) {
  const [phase, setPhase] = useState<"idle" | "opening" | "recording" | "sending">("idle");
  const [notice, setNotice] = useState(""); const [audioUrl, setAudioUrl] = useState<string>();
  const [retry, setRetry] = useState(false);
  const recorder = useRef<Recording | null>(null), controller = useRef<AbortController | null>(null);
  const pending = useRef<VoiceRequest | null>(null), mounted = useRef(true), url = useRef<string | null>(null);
  const finishRecording = useRef<() => void>(() => {});
  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false; controller.current?.abort(); recorder.current?.cancel(); pending.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
  }; }, []);
  const displayAudio = (reply: VoiceResponse) => {
    if (url.current) URL.revokeObjectURL(url.current); url.current = null; setAudioUrl(undefined);
    if (reply.audioBase64) {
      const bytes = Uint8Array.from(atob(reply.audioBase64), c => c.charCodeAt(0));
      url.current = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" })); setAudioUrl(url.current);
    }
    setNotice(reply.audioStatus === "UNAVAILABLE" ? "บันทึกข้อความตอบแล้ว แต่สร้างเสียงไม่ได้ สามารถอ่านข้อความและฝึกต่อได้" : reply.audioStatus === "REPLAY" ? "โหลดบทสนทนาที่บันทึกไว้แล้ว" : "บันทึกบทสนทนาแล้ว กดเล่นเพื่อฟังเสียงตอบ");
  };
  async function transmit(input: VoiceRequest) {
    setPhase("sending"); setRetry(false); onBusy(true);
    const abort = new AbortController(); controller.current = abort;
    try {
      let reply: VoiceResponse;
      try { reply = await socketVoice(session.sessionId, input, abort.signal, r => { if (mounted.current) onReply(r); }); }
      catch (error) {
        if (abort.signal.aborted || (error instanceof ApiFailure && !error.uncertain)) throw error;
        if (mounted.current) setNotice("การเชื่อมต่อสดขัดข้อง กำลังส่งคำขอเดิมผ่าน HTTP");
        reply = await httpVoice(session.sessionId, input, abort.signal);
      }
      if (!mounted.current) return;
      onReply(reply.dialogue); displayAudio(reply); pending.current = null;
    } catch (error) {
      if (!mounted.current || abort.signal.aborted) return;
      const failure = error instanceof ApiFailure ? error : new ApiFailure("NETWORK_ERROR", 0);
      setNotice(failure.message); setRetry(failure.uncertain || failure.code === "VOICE_BUSY");
      if (failure.code === "REVISION_CONFLICT" || failure.code === "IDEMPOTENCY_CONFLICT") { pending.current = null; await reload(); }
      else if (!failure.uncertain && failure.code !== "VOICE_BUSY") pending.current = null;
    } finally { if (mounted.current) { setPhase("idle"); onBusy(pending.current !== null); } }
  }
  async function stop() {
    const recording = recorder.current; recorder.current = null;
    if (!recording) return;
    const audio = await recording.stop();
    if (!mounted.current) return;
    const input: VoiceRequest = { turnId: crypto.randomUUID(), expectedRevision: session.revision, mime: "audio/wav", audioBase64: encodeAudio(audio) };
    pending.current = input; await transmit(input);
  }
  finishRecording.current = () => { void stop(); };
  async function begin() {
    if (disabled || phase !== "idle") return;
    setPhase("opening"); setNotice(""); setRetry(false); pending.current = null; onBusy(true);
    const abort = new AbortController(); controller.current = abort;
    try {
      const recording = await startMicrophone(() => { if (controller.current === abort) finishRecording.current(); }, abort.signal);
      if (!mounted.current || abort.signal.aborted || controller.current !== abort) { recording.cancel(); return; }
      recorder.current = recording;
      setPhase("recording"); setNotice("พูดหนึ่งประโยคด้วยข้อมูลสมมติ แล้วกดหยุดและส่ง (ไม่เกิน 30 วินาที)");
    } catch { if (mounted.current && controller.current === abort && !abort.signal.aborted) { setNotice("เปิดไมโครโฟนไม่ได้ กรุณาตรวจสิทธิ์หรือใช้ช่องข้อความ"); setPhase("idle"); onBusy(false); } }
  }
  function cancel() { controller.current?.abort(); recorder.current?.cancel(); recorder.current = null; pending.current = null; setRetry(false); setPhase("idle"); onBusy(false); setNotice("หยุดโหมดเสียงแล้ว สามารถพิมพ์ข้อความต่อได้"); }
  return <section className="panel space-y-3" aria-label="เสียง Call Center">
    <h2>โหมดเสียง Call Center</h2><p className="field-hint">กดเริ่มก่อนอนุญาตไมโครโฟน พูดครั้งละหนึ่งประโยค ข้อความที่ถอดเสียงยังไม่ใช่การยืนยันการกระทำ</p>
    <div className="flex flex-wrap gap-2">
      {phase === "idle" && <button className="button button-secondary" disabled={disabled || retry} onClick={() => void begin()}>เริ่มโหมดเสียง</button>}
      {phase === "recording" && <button className="button" onClick={() => void stop()}>หยุดและส่งเสียง</button>}
      {(phase === "recording" || phase === "opening") && <button className="text-button" onClick={cancel}>ยกเลิกการบันทึก</button>}
      {phase === "sending" && <span role="status">กำลังประมวลผลเสียง…</span>}
      {retry && <button className="button button-secondary" disabled={disabled} onClick={() => { if (pending.current) void transmit(pending.current); }}>ลองส่งรายการเดิมอีกครั้ง</button>}
      {retry && <button className="text-button" onClick={() => { cancel(); void reload(); }}>โหลดสถานะล่าสุดและใช้ข้อความ</button>}
    </div>
    {notice && <p role="status">{notice}</p>}
    {audioUrl && <audio controls src={audioUrl} aria-label="เสียงตอบจากตัวละคร" />}
  </section>;
}
