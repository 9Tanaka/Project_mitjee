"use client";
import { useState, type FormEvent } from "react";
import type { z } from "zod";
import type { actionRequest, publicActionDto } from "../public-api/contracts.js";

export type ActionPayload = z.infer<typeof actionRequest>["payload"];
export function ActionControl({ definition, disabled, submit }: {
  definition: z.infer<typeof publicActionDto>; disabled: boolean; submit: (payload: ActionPayload) => void;
}) {
  const [choice, setChoice] = useState("");
  const [evidence, setEvidence] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  if (definition.input === "NONE") return <button className="button button-secondary w-full" disabled={disabled} onClick={() => submit({})}>{definition.label}<span aria-hidden="true">→</span></button>;
  if (definition.input === "CONFIRM") return <div className="simulated-control">
    <button className="button button-warning w-full" disabled={disabled} onClick={() => setConfirm(true)}>{definition.label}</button>
    {confirm && <div className="confirmation" role="group" aria-label="ยืนยันการกระทำจำลอง">
      <p className="font-semibold">ยืนยันการกระทำจำลองนี้หรือไม่?</p>
      <p className="text-sm muted mt-2">การเลือกนี้มีผลต่อรอบฝึก ไม่ต้องกรอกรหัส OTP รหัสผ่าน หรือข้อมูลทางการเงินจริง</p>
      <div className="flex flex-wrap gap-2 mt-4"><button className="button button-warning" disabled={disabled} onClick={() => { setConfirm(false); submit({ confirmed: true }); }}>ยืนยันการกระทำจำลอง</button><button className="button button-secondary" disabled={disabled} onClick={() => setConfirm(false)}>ยกเลิก</button></div>
    </div>}
  </div>;
  const multiple = definition.input === "EVIDENCE";
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (disabled || (!multiple && !choice)) return;
    submit(multiple ? { selectedEvidenceIds: [...evidence] } : { choiceId: choice });
  }
  return <form onSubmit={onSubmit} className="action-card"><fieldset disabled={disabled}>
    <legend>{definition.label}</legend><p className="field-hint mt-1">{multiple ? "เลือกได้หลายข้อ แล้วกดยืนยันได้ครั้งเดียว" : "เลือกหนึ่งข้อ แล้วกดยืนยันคำตอบ"}</p>
    <div className="space-y-2 mt-4">{definition.options.map(option => <label className="action-option" key={option.id}>
      <input type={multiple ? "checkbox" : "radio"} name={definition.id} value={option.id}
        checked={multiple ? evidence.includes(option.id) : choice === option.id}
        onChange={e => multiple ? setEvidence(previous => e.target.checked ? [...previous, option.id] : previous.filter(id => id !== option.id)) : setChoice(option.id)} />
      <span>{option.label}</span></label>)}</div>
    <button className="button w-full mt-4" disabled={disabled || (!multiple && !choice)}>{multiple ? "ยืนยันหลักฐาน" : "ยืนยันคำตอบ"}</button>
  </fieldset></form>;
}
