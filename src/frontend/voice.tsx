"use client";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { sessionDto, messageDto } from "../public-api/contracts.js";
import { startMicrophone, type Recording } from "./microphone.js";
import { encodeAudio, httpVoice, httpSpeech, socketVoice, type VoiceRequest, type VoiceResponse } from "./call-transport.js";
import { ApiFailure } from "./api.js";
import { Icon } from "./ui.js";

export function VoiceControls({ session, disabled, onReply, onBusy, reload }: {
  session: z.infer<typeof sessionDto>; disabled: boolean; onReply: (reply: z.infer<typeof messageDto>) => void;
  onBusy: (busy: boolean) => void; reload: () => Promise<void>;
}) {
  const [phase, setPhase] = useState<"idle" | "opening" | "recording" | "sending">("idle");
  const [notice, setNotice] = useState(""); const [audioUrl, setAudioUrl] = useState<string>();
  const [retry, setRetry] = useState(false);
  const [speaker, setSpeaker] = useState(false), [audioBusy, setAudioBusy] = useState(false), [playing, setPlaying] = useState(false);
  const audioElement = useRef<HTMLAudioElement>(null), audioRequest = useRef<AbortController | null>(null);
  const spokenTurn = useRef<string | null>(null);
  const latestCharacter = session.messages.filter(m => m.role === "character").at(-1);
  const voicePhase = phase === "opening" ? "REQUESTING_PERMISSION" : phase === "recording" ? "RECORDING" : phase === "sending" ? "PROCESSING_STT"
    : playing ? "PLAYING_CALLER_AUDIO" : audioBusy ? "WAITING_FOR_CALLER" : notice.includes("ไม่ได้") || notice.includes("ไม่สามารถ") ? "ERROR" : "IDLE";
  const recorder = useRef<Recording | null>(null), controller = useRef<AbortController | null>(null);
  const pending = useRef<VoiceRequest | null>(null), mounted = useRef(true), url = useRef<string | null>(null);
  const finishRecording = useRef<() => void>(() => {});
  const busyCallback = useRef(onBusy); busyCallback.current = onBusy;
  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false; controller.current?.abort(); audioRequest.current?.abort(); audioElement.current?.pause(); recorder.current?.cancel(); pending.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    busyCallback.current(false);
  }; }, []);
  const displayAudio = (reply: Pick<VoiceResponse, "audioBase64" | "audioStatus">) => {
    audioElement.current?.pause(); setPlaying(false);
    if (url.current) URL.revokeObjectURL(url.current); url.current = null; setAudioUrl(undefined);
    if (reply.audioBase64) {
      const bytes = Uint8Array.from(atob(reply.audioBase64), c => c.charCodeAt(0));
      url.current = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" })); setAudioUrl(url.current);
    }
    setNotice(reply.audioStatus === "UNAVAILABLE" ? "ไม่สามารถเล่นเสียงได้ในขณะนี้ คุณยังสามารถอ่านบทสนทนาและฝึกต่อได้" : reply.audioStatus === "REPLAY" ? "โหลดบทสนทนาที่บันทึกไว้แล้ว" : "กดเล่นเพื่อฟังเสียงผู้โทร หรืออ่านข้อความและฝึกต่อได้");
  };
  async function loadCallerAudio(turnId: string) {
    audioRequest.current?.abort(); audioElement.current?.pause(); setPlaying(false);
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null; setAudioUrl(undefined);
    const abort = new AbortController(); audioRequest.current = abort;
    spokenTurn.current = turnId; setAudioBusy(true);
    try {
      const reply = await httpSpeech(session.sessionId, turnId, abort.signal);
      if (mounted.current && !abort.signal.aborted) displayAudio(reply);
    } catch {
      if (mounted.current && !abort.signal.aborted) setNotice("ไม่สามารถเล่นเสียงได้ในขณะนี้ คุณยังสามารถอ่านบทสนทนาและฝึกต่อได้");
    } finally { if (mounted.current && audioRequest.current === abort) setAudioBusy(false); }
  }
  useEffect(() => {
    audioRequest.current?.abort(); audioElement.current?.pause(); setPlaying(false); setAudioBusy(false);
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null; setAudioUrl(undefined);
  }, [session.phone?.state]);
  useEffect(() => {
    // Dialogue has already committed. This effect cannot issue an AI turn or action.
    if (!speaker || disabled || phase !== "idle" || !latestCharacter || spokenTurn.current === latestCharacter.turnId) return;
    void loadCallerAudio(latestCharacter.turnId);
  }, [speaker, disabled, phase, latestCharacter?.turnId, session.sessionId]);
  useEffect(() => {
    if (!speaker || !audioUrl) return;
    // Autoplay is best effort. Its rejection never blocks progress or removes replay.
    void audioElement.current?.play()?.catch(() => { if (mounted.current) setNotice("กดเล่นเสียงผู้โทรเมื่อพร้อม คุณยังอ่านบทสนทนาและฝึกต่อได้"); });
  }, [speaker, audioUrl]);
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
      spokenTurn.current = reply.dialogue.turn.turnId;
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
    let audio: Uint8Array;
    try { audio = await recording.stop(); }
    catch { setNotice("บันทึกเสียงไม่สำเร็จ ลองอีกครั้งหรือพิมพ์ข้อความแทน"); setPhase("idle"); onBusy(false); return; }
    if (!mounted.current) return;
    const input: VoiceRequest = { turnId: crypto.randomUUID(), expectedRevision: session.revision, mime: "audio/wav", audioBase64: encodeAudio(audio) };
    pending.current = input; await transmit(input);
  }
  finishRecording.current = () => { void stop(); };
  async function begin() {
    if (disabled || phase !== "idle") return;
    audioRequest.current?.abort(); setAudioBusy(false); audioElement.current?.pause(); setPlaying(false);
    setPhase("opening"); setNotice(""); setRetry(false); pending.current = null; onBusy(true);
    const abort = new AbortController(); controller.current = abort;
    try {
      const recording = await startMicrophone(() => { if (controller.current === abort) {
        setNotice("ครบ 30 วินาทีแล้ว หยุดบันทึกและกำลังประมวลผลเสียง คุณยังใช้ข้อความแทนได้"); finishRecording.current();
      } }, abort.signal);
      if (!mounted.current || abort.signal.aborted || controller.current !== abort) { recording.cancel(); return; }
      recorder.current = recording;
      setPhase("recording"); setNotice("พูดหนึ่งประโยคด้วยข้อมูลสมมติ แล้วกดหยุดและส่ง (ไม่เกิน 30 วินาที)");
    } catch (error) { if (mounted.current && controller.current === abort && !abort.signal.aborted) {
      const name = error && typeof error === "object" && "name" in error && typeof error.name === "string" ? error.name : "";
      setNotice(name === "NotAllowedError" ? "ไม่ได้รับอนุญาตใช้ไมโครโฟน ลองอีกครั้งหรือพิมพ์ข้อความแทน" : name === "NotFoundError" ? "ไม่พบไมโครโฟน พิมพ์ข้อความแทนหรือตรวจอุปกรณ์แล้วลองอีกครั้ง" : "เปิดไมโครโฟนไม่ได้ กรุณาตรวจสิทธิ์หรือใช้ช่องข้อความ");
      setPhase("idle"); onBusy(false);
    } }
  }
  function cancel() { controller.current?.abort(); recorder.current?.cancel(); recorder.current = null; pending.current = null; setRetry(false); setPhase("idle"); onBusy(false); setNotice("หยุดโหมดเสียงแล้ว สามารถพิมพ์ข้อความต่อได้"); }
  return <section className="phone-voice-controls space-y-3" aria-label="เสียง Call Center" data-phase={voicePhase}>
    <label className="phone-speaker-toggle"><input type="checkbox" checked={speaker} onChange={e => { setSpeaker(e.target.checked); if (!e.target.checked) { audioRequest.current?.abort(); audioElement.current?.pause(); setPlaying(false); setAudioBusy(false); } }} /> เปิดเสียงผู้โทร</label>
    <p className="voice-status" role="status">{phase === "idle" ? playing ? "กำลังเล่นเสียงผู้โทร" : audioBusy ? "กำลังเตรียมเสียงผู้โทร" : "ไมโครโฟนปิด · พร้อมเมื่อคุณเริ่ม" : phase === "opening" ? "กำลังขออนุญาตไมโครโฟน" : phase === "recording" ? "กำลังรับเสียงจากไมโครโฟน" : "กำลังถอดเสียงและรอคำตอบผู้โทร"}</p>
    <p className="field-hint">พูดครั้งละหนึ่งประโยค ไม่เกิน 30 วินาที หรือใช้ข้อความด้านบน ข้อความที่ถอดเสียงไม่ใช่การยืนยันการกระทำ</p>
    <div className="flex flex-wrap gap-2">
      {phase === "idle" && <button className="button button-secondary" disabled={disabled || retry} onClick={() => void begin()}><Icon name="phone" /> กดเพื่อพูด</button>}
      {phase === "recording" && <button className="button" onClick={() => void stop()}>หยุดและส่งเสียง</button>}
      {(phase === "recording" || phase === "opening") && <button className="text-button" onClick={cancel}>ยกเลิกการบันทึก</button>}
      {phase === "sending" && <span role="status">กำลังประมวลผลเสียง…</span>}
      {retry && <button className="button button-secondary" disabled={disabled} onClick={() => { if (pending.current) void transmit(pending.current); }}>ลองส่งรายการเดิมอีกครั้ง</button>}
      {retry && <button className="text-button" onClick={() => { cancel(); void reload(); }}>โหลดสถานะล่าสุดและใช้ข้อความ</button>}
    </div>
    {notice && <p role="status">{notice}</p>}
    {latestCharacter && <button className="text-button" disabled={disabled || phase !== "idle" || audioBusy} onClick={() => {
      if (audioUrl && spokenTurn.current === latestCharacter.turnId) { void audioElement.current?.play()?.catch(() => setNotice("กดเล่นในตัวควบคุมเสียง หรืออ่านข้อความแทน")); }
      else void loadCallerAudio(latestCharacter.turnId);
    }}>เล่นเสียงผู้โทรอีกครั้ง</button>}
    {audioUrl && <audio ref={audioElement} controls src={audioUrl} onPlay={() => {
      if (phase !== "idle") { audioElement.current?.pause(); return; }
      setPlaying(true);
    }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} aria-label="เสียงตอบจากตัวละคร" />}
  </section>;
}
