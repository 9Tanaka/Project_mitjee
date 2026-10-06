"use client";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link.js";
import { z } from "zod";
import { sessionDto, mutationDto, messageDto } from "../public-api/contracts.js";
import { useMutation } from "./hooks.js";
import { MutationAttempt } from "./api.js";
import { ActionControl, type ActionPayload } from "./actions.js";
import { Failure, Icon } from "./ui.js";
import { VoiceControls } from "./voice.js";

type Session = z.infer<typeof sessionDto>;
type Phone = NonNullable<Session["phone"]>;
const replySchema = z.union([mutationDto, messageDto]);

export function PhoneShell({ children }: { children: ReactNode }) {
  return <section className="phone-shell" aria-label="โทรศัพท์จำลอง"><div className="phone-status-bar"><span>MITJEE</span><span>SIMULATION</span></div>
    <div className="phone-screen">{children}</div><div className="phone-home-indicator" aria-hidden="true" /></section>;
}
function CallerIdentity({ label }: { label: string }) {
  return <div className="phone-caller"><span className="phone-caller-icon" aria-hidden="true"><Icon name="phone" /></span><h2>{label}</h2><p>สายจำลอง · ไม่มีการโทรจริง</p></div>;
}
export function IncomingCallScreen({ session, blocked, action }: { session: Session; blocked: boolean; action: (id: string, payload: ActionPayload) => void }) {
  return <div className="phone-incoming"><p className="phone-kicker">สายเรียกเข้า</p><CallerIdentity label={session.phone!.callerLabel} />
    <div className="phone-answer-controls">{session.availableActions.map(a => <button key={a.id} className={a.label === "รับสาย" ? "phone-answer" : "phone-decline"}
      disabled={blocked} onClick={() => action(a.id, {})}><Icon name="phone" /><span>{a.label}</span></button>)}</div></div>;
}
export function CallTranscript({ messages }: { messages: Session["messages"] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "nearest" }); }, [messages.length]);
  return <div className="phone-transcript" role="log" aria-label="บทถอดเสียงสายจำลอง" aria-live="polite" aria-relevant="additions">
    {messages.map(m => <div className="phone-transcript-line" key={m.turnId + m.role}><span>{m.role === "character" ? "ผู้โทร" : "คุณ"}</span><p>{m.text}</p></div>)}<div ref={end} />
  </div>;
}
export function PhoneAppSwitcher({ apps, disabled, open }: { apps: Phone["availableInternalApps"]; disabled: boolean; open: (app: Phone["availableInternalApps"][number]) => void }) {
  return <nav className="phone-app-switcher" aria-label="แอปภายในโทรศัพท์">{apps.map(app => <button key={app.id} disabled={disabled} onClick={() => open(app)}>{app.label}</button>)}</nav>;
}
export function CallControls({ disabled, hasActions, showActions, quit }: { disabled: boolean; hasActions: boolean; showActions: () => void; quit: () => void }) {
  return <div className="phone-call-controls">{hasActions && <button className="button button-small" disabled={disabled} onClick={e => { e.currentTarget.focus(); showActions(); }}>ตัวเลือกขณะนี้</button>}
    <button className="phone-exit" disabled={disabled} onClick={quit}>ออกจากรอบฝึก</button></div>;
}
export function ContextualActionSheet({ session, blocked, submit, close }: { session: Session; blocked: boolean; submit: (id: string, payload: ActionPayload) => void; close: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  return <section ref={ref} className="phone-action-sheet" role="dialog" aria-label="ตัวเลือกในขั้นตอนปัจจุบัน" onKeyDown={e => { if (e.key === "Escape" && !blocked) close(); }}>
    <div className="phone-sheet-heading"><h3>{session.currentStatePublicLabel}</h3><button type="button" disabled={blocked} onClick={close} aria-label="ปิดตัวเลือก">×</button></div>
    <div className="phone-sheet-content">{session.availableActions.map(a => <ActionControl key={a.id + session.revision} definition={a} disabled={blocked} submit={p => submit(a.id, p)} />)}</div>
  </section>;
}
export function ActiveCallScreen({ session, blocked, text, setText, send, requestOpening, recovery, children }: {
  session: Session; blocked: boolean; text: string; setText: (value: string) => void; send: (e: FormEvent<HTMLFormElement>) => void; requestOpening: () => void; recovery: boolean; children: ReactNode;
}) {
  const pending = session.phone!.openingStatus === "PENDING";
  return <div className="phone-active"><p className="phone-kicker">{pending ? "กำลังเชื่อมต่อบทสนทนา" : "กำลังสนทนา"}</p><CallerIdentity label={session.phone!.callerLabel} />
    {pending ? <div className="phone-pending" role="status"><p>เชื่อมต่อสายแล้ว กำลังรอบทพูดจากผู้โทร</p>{recovery && <button className="button button-small mt-4" disabled={blocked} onClick={requestOpening}>ลองรับบทพูดผู้โทรอีกครั้ง</button>}</div> : <>
      <CallTranscript messages={session.messages} /><form className="phone-compose" onSubmit={send}><label htmlFor="phone-text">ตอบผู้โทรด้วยข้อความ</label>
        <textarea id="phone-text" rows={2} maxLength={8000} value={text} onChange={e => setText(e.target.value)} disabled={blocked} placeholder="พิมพ์สิ่งที่คุณต้องการพูด…" />
        <button className="button button-small" disabled={blocked || !text.trim()}>ส่งข้อความ</button></form>
    </>}{children}</div>;
}

export function PhoneSimulator({ session, onSession, reload }: { session: Session; onSession: (s: Session) => void; reload: () => Promise<void> }) {
  const connectedAt = useRef<number | null>(null);
  const connectedSession = useRef(session.sessionId);
  const [callSeconds, setCallSeconds] = useState(0);
  const [text, setText] = useState("");
  const [sheet, setSheet] = useState(false);
  const [internalApp, setInternalApp] = useState<Phone["availableInternalApps"][number] | null>(null);
  const [quitting, setQuitting] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const autoRequested = useRef<string | null>(null);
  const path = "/api/training/" + encodeURIComponent(session.sessionId);
  const mutation = useMutation(replySchema, reply => {
    onSession(reply.session); setSheet(false); setInternalApp(null); setQuitting(false);
    if ("turn" in reply) setText("");
  }, reload);
  const phone = session.phone!;
  useEffect(() => {
    if (connectedSession.current !== session.sessionId) { connectedSession.current = session.sessionId; connectedAt.current = null; setCallSeconds(0); }
    if (phone.callStatus !== "CONNECTED") return;
    connectedAt.current ??= Date.now();
    const tick = () => setCallSeconds(Math.floor((Date.now() - connectedAt.current!) / 1000));
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [phone.callStatus, session.sessionId]);
  const blocked = mutation.blocked || voiceBusy;
  const active = session.status === "ACTIVE";
  const terminal = !active;
  const pendingBeat = active && phone.callStatus === "CONNECTED" && phone.openingStatus === "PENDING";
  const requestOpening = () => {
    if (blocked) return;
    if (mutation.retryable) void mutation.retry();
    else void mutation.run(new MutationAttempt(path + "/opening", { expectedRevision: session.revision }));
  };
  useEffect(() => {
    const beatKey = `${session.sessionId}:${phone.state}`;
    if (!pendingBeat || blocked || mutation.error || autoRequested.current === beatKey) return;
    let cancelled = false;
    // Let StrictMode's rehearsal cleanup run before starting a real protected request.
    queueMicrotask(() => {
      if (cancelled) return;
      autoRequested.current = beatKey;
      void mutation.run(new MutationAttempt(path + "/opening", { expectedRevision: session.revision }));
    });
    return () => { cancelled = true; };
  }, [pendingBeat, blocked, mutation.error, mutation.run, path, phone.state, session.sessionId, session.revision]);
  function action(actionDefinitionId: string, payload: ActionPayload) {
    if (blocked) return;
    void mutation.run(new MutationAttempt(path + "/action", { actionId: crypto.randomUUID(), expectedRevision: session.revision, actionDefinitionId, payload }));
  }
  function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (blocked || !text.trim()) return;
    void mutation.run(new MutationAttempt(path + "/message", { turnId: crypto.randomUUID(), expectedRevision: session.revision, text }));
  }
  return <div className="phone-training" data-call-state={phone.state} data-caller-status={phone.openingStatus}><Link href="/scenarios" className="back-link">← สถานการณ์ฝึก</Link>
    <header className="phone-training-heading"><p className="eyebrow">INTERACTIVE PHONE SIMULATOR</p><h1>ฝึกรับสาย Call Center</h1>
      <p className="muted">ใช้ข้อมูลสมมติเท่านั้น ห้ามส่ง OTP รหัสผ่าน หรือข้อมูลส่วนบุคคลจริง</p></header>
    {mutation.error && <Failure error={mutation.error} retry={mutation.retryable ? () => void mutation.retry() : undefined} />}
    {mutation.busy && <p role="status" className="phone-request-status">กำลังบันทึกและเตรียมบทสนทนา…</p>}
    <PhoneShell>
      {terminal || phone.callStatus === "ENDING" ? <div className="phone-ending"><CallerIdentity label={phone.callerLabel} />
        <h2>{phone.callStatus === "DECLINED" ? "ปฏิเสธสายแล้ว" : session.status === "EXPIRED" ? "รอบฝึกหมดอายุแล้ว" : "สิ้นสุดสายจำลอง"}</h2>
        {session.status === "COMPLETED" || session.status === "FAILED" ? <Link className="button mt-6" href={"/training/" + encodeURIComponent(session.sessionId) + "/result"}>ดูผลการฝึก →</Link>
          : terminal ? <><p>รอบนี้ไม่มีผลประเมินอย่างเป็นทางการ</p><Link href="/scenarios" className="button button-secondary mt-6">เลือกสถานการณ์ใหม่</Link></>
            : session.availableActions.map(a => <button className="button mt-6" key={a.id} disabled={blocked} onClick={() => action(a.id, {})}>{a.label}</button>)}
      </div> : phone.callStatus === "RINGING" ? <IncomingCallScreen session={session} blocked={blocked} action={action} />
        : phone.activeApp && phone.activeApp !== "CALL" ? <div className="phone-internal-app">
          <h2>{phone.appData?.[phone.activeApp]?.title}</h2>{phone.appData?.[phone.activeApp]?.lines.map((line, index) => <p className="mt-3" key={index}>{line}</p>)}
          <p className="field-hint mt-4">ข้อมูลและการกระทำทั้งหมดอยู่ในแบบฝึก ไม่มีการโทร ส่ง SMS หรือทำธุรกรรมจริง</p>
          <div className="space-y-3 mt-5">{session.availableActions.map(a => <ActionControl key={a.id + session.revision} definition={a} disabled={blocked} submit={p => action(a.id, p)} />)}</div>
        </div>
        : internalApp && phone.availableInternalApps.some(a => a.id === internalApp.id) ? <div className="phone-internal-app"><button className="back-link" onClick={() => setInternalApp(null)}>← กลับสายสนทนา</button><h2>{internalApp.label}</h2><p>ไม่มีข้อมูลรายการในรอบฝึกนี้</p><p>หน้านี้ไม่ได้ยืนยันตัวตนหรือทำธุรกรรมจริง</p></div>
          : <ActiveCallScreen session={session} blocked={blocked} text={text} setText={setText} send={send}
            requestOpening={requestOpening} recovery={!!mutation.error}>
            <p className="phone-call-timer" aria-label="ระยะเวลาสายจำลอง">{String(Math.floor(callSeconds / 60)).padStart(2, "0")}:{String(callSeconds % 60).padStart(2, "0")}</p>
            {active && phone.callStatus === "CONNECTED" && <VoiceControls session={session} disabled={mutation.blocked || pendingBeat}
              onReply={r => onSession(r.session)} onBusy={setVoiceBusy} reload={reload} />}
            <PhoneAppSwitcher apps={phone.availableInternalApps} disabled={blocked} open={app => {
              if (!phone.activeApp) { setInternalApp(app); return; }
              const navigation = session.availableActions.find(a => a.navigationTarget === app.id);
              if (navigation) action(navigation.id, {});
            }} />
            <CallControls disabled={blocked} hasActions={session.availableActions.length > 0} showActions={() => setSheet(true)} quit={() => setQuitting(true)} />
            {sheet && session.availableActions.length > 0 && <ContextualActionSheet key={session.revision} session={session} blocked={blocked} submit={action} close={() => setSheet(false)} />}
            {quitting && <section className="phone-action-sheet" role="dialog" aria-label="ยืนยันออกจากรอบฝึก"><h3>ออกจากรอบฝึกนี้หรือไม่?</h3><p>รอบที่ออกก่อนจบไม่มีผลประเมินอย่างเป็นทางการ</p>
              <button className="button button-secondary mt-4" disabled={blocked} onClick={() => setQuitting(false)}>ฝึกต่อ</button>
              <button className="button mt-4" disabled={blocked} onClick={() => void mutation.run(new MutationAttempt(path + "/quit", { actionId: crypto.randomUUID(), expectedRevision: session.revision }))}>ยืนยันออกจากรอบฝึก</button></section>}
          </ActiveCallScreen>}
    </PhoneShell>
    <p className="phone-footnote">ข้อความและบทถอดเสียงไม่ใช่การยืนยันการกระทำ ระบบประเมินเฉพาะตัวเลือกที่คุณยืนยัน</p>
  </div>;
}
