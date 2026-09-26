"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import Link from "next/link.js";
import { sessionDto, mutationDto, messageDto } from "../public-api/contracts.js";
import { useMutation, useResource } from "./hooks.js";
import { MutationAttempt } from "./api.js";
import { ActionControl, type ActionPayload } from "./actions.js";
import { Failure, Loading, Notice } from "./ui.js";

const replySchema = z.union([mutationDto, messageDto]);
export function Training({ sessionId }: { sessionId: string }) {
  const path = "/api/training/" + encodeURIComponent(sessionId);
  const resource = useResource(path, sessionDto);
  const [text, setText] = useState(""); const [quitting, setQuitting] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const mutation = useMutation(replySchema, reply => {
    resource.setData(reply.session); setQuitting(false);
    if ("turn" in reply) setText("");
  }, resource.reload);
  const s = resource.data;
  useEffect(() => { end.current?.scrollIntoView?.({ block: "nearest" }); }, [s?.messages.length]);
  if (resource.loading) return <Loading text="กำลังโหลดรอบฝึก…" />;
  if (resource.error) return <Failure error={resource.error} retry={() => void resource.reload()} />;
  if (!s) return <Notice>ยังไม่มีข้อมูลรอบฝึก</Notice>;
  if (s.status === "ABANDONED" || s.status === "EXPIRED") return <div className="panel terminal-panel">
    <p className="eyebrow">สถานะรอบฝึก</p><h1>{s.status === "ABANDONED" ? "ออกจากรอบฝึกแล้ว" : "รอบฝึกหมดอายุแล้ว"}</h1>
    <p className="muted mt-4">รอบนี้ยังประเมินไม่ได้เพราะยังไม่จบด้วยการกระทำที่ประเมินได้ คุณสามารถเลือกเริ่มสถานการณ์ใหม่ได้</p><Link className="button mt-6" href="/scenarios">กลับไปเลือกสถานการณ์ →</Link></div>;
  if (s.status === "COMPLETED" || s.status === "FAILED") return <div className="panel terminal-panel">
    <span className="tag">สิ้นสุดรอบฝึก</span><h1 className="mt-5">พร้อมทบทวนผลการฝึก</h1>
    <p className="muted mt-4">ระบบบันทึกรอบฝึกแล้ว ดูผลประเมินและคำแนะนำจากการตัดสินใจของคุณ</p>
    <Link className="button mt-6" href={"/training/" + encodeURIComponent(sessionId) + "/result"}>ดูผลการฝึก →</Link></div>;
  const blocked = mutation.blocked;
  function action(actionDefinitionId: string, payload: ActionPayload) {
    if (!s || blocked) return;
    void mutation.run(new MutationAttempt(path + "/action", { actionId: crypto.randomUUID(), expectedRevision: s.revision, actionDefinitionId, payload }));
  }
  function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!s || blocked || !text.trim()) return;
    void mutation.run(new MutationAttempt(path + "/message", { turnId: crypto.randomUUID(), expectedRevision: s.revision, text }));
  }
  return <div className="space-y-5">
    <Link href="/scenarios" className="back-link">← สถานการณ์ฝึก</Link>
    <div className="training-heading"><div><p className="eyebrow">พื้นที่ฝึกสถานการณ์จำลอง</p><h1>{s.scenario.title}</h1></div><span className="tag tag-active"><span className="status-dot" />กำลังฝึก</span></div>
    <Notice>ใช้ข้อมูลสมมติเท่านั้น ห้ามส่ง OTP รหัสผ่าน หรือข้อมูลส่วนบุคคลจริง การสนทนาไม่ใช่การยืนยันการกระทำ</Notice>
    {mutation.error && <Failure error={mutation.error} retry={mutation.retryable ? () => void mutation.retry() : undefined} />}
    <div className="training-grid">
      <section className="chat-panel" aria-label="บทสนทนา">
        <div className="chat-header"><span className="avatar" aria-hidden="true">ม</span><div><h2>ตัวละครในสถานการณ์</h2><p className="text-xs muted">บทสนทนาจำลองสำหรับการฝึก</p></div><span className="tag tag-neutral ml-auto">ข้อความ</span></div>
        <div className="chat-log" role="log" aria-label="ประวัติการสนทนา" aria-live="polite" aria-relevant="additions">
          {s.messages.length === 0 && <div className="chat-empty"><span className="chat-empty-symbol" aria-hidden="true">“</span><h3>เริ่มจากการสังเกต</h3><p>พิจารณาตัวเลือกในขั้นตอนนี้ หรือส่งข้อความเพื่อโต้ตอบกับตัวละครจำลอง</p></div>}
          {s.messages.map(message => <div className={"message message-" + message.role} key={message.turnId + message.role}><span className="message-role">{message.role === "user" ? "คุณ" : "ตัวละครจำลอง"}</span><p>{message.text}</p></div>)}
          <div ref={end} />
        </div>
        <form onSubmit={send} className="chat-compose"><label className="sr-only" htmlFor="chat-text">ข้อความของคุณ</label>
          <textarea id="chat-text" value={text} onChange={e => setText(e.target.value)} maxLength={8000} rows={2} disabled={blocked} placeholder="พิมพ์ข้อความเพื่อฝึกรับมือ…" aria-describedby="chat-help" />
          <div className="flex items-center justify-between gap-3"><p id="chat-help" className="field-hint">ใช้ข้อมูลสมมติ · ไม่เกิน 8,000 อักขระ</p><button className="button button-small" disabled={blocked || !text.trim()}>{mutation.busy ? "กำลังส่ง…" : "ส่งข้อความ"}<span aria-hidden="true">↑</span></button></div>
        </form>
      </section>
      <aside className="action-panel" aria-label="ขั้นตอนและการกระทำ">
        <div className="action-panel-heading"><p className="eyebrow">ขั้นตอนปัจจุบัน</p><h2>{s.currentStatePublicLabel}</h2><p className="field-hint mt-2">เลือกการตอบสนองด้วยตัวเอง ระบบจะประเมินหลังสิ้นสุดรอบฝึก</p></div>
        <div className="space-y-4">{s.availableActions.length ? s.availableActions.map(definition => <ActionControl key={definition.id + ":" + s.revision} definition={definition} disabled={blocked} submit={payload => action(definition.id, payload)} />) : <Notice>ไม่มีการกระทำที่เปิดให้เลือกในขณะนี้</Notice>}</div>
        <div className="quit-area"><button className="text-button" disabled={blocked} onClick={() => setQuitting(true)}>ออกจากสถานการณ์</button>
          {quitting && <div className="confirmation" role="group" aria-label="ยืนยันออกจากสถานการณ์"><p>ต้องการออกจากรอบฝึกนี้หรือไม่? รอบที่ออกก่อนจบจะไม่มีผลประเมิน</p><div className="flex flex-wrap gap-2 mt-3"><button className="button button-secondary" disabled={blocked} onClick={() => setQuitting(false)}>ฝึกต่อ</button><button className="button button-warning" disabled={blocked} onClick={() => void mutation.run(new MutationAttempt(path + "/quit", { actionId: crypto.randomUUID(), expectedRevision: s.revision }))}>ยืนยันออกจากสถานการณ์</button></div></div>}
        </div>
      </aside>
    </div>
  </div>;
}
