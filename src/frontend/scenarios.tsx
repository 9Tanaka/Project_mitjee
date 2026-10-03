"use client";
import { useState } from "react";
import { z } from "zod";
import Link from "next/link.js";
import { useRouter } from "next/navigation.js";
import { scenarioDto, mutationDto } from "../public-api/contracts.js";
import { useMutation, useResource } from "./hooks.js";
import { MutationAttempt } from "./api.js";
import { EmptyState, Failure, Icon, Loading, Notice, PageIntro, Shield } from "./ui.js";

const catalogSchema = z.array(scenarioDto);
const categories: Record<string, { label: string; icon: string; tone: string }> = {
  CALL_CENTER: { label: "การติดต่อทางโทรศัพท์", icon: "phone", tone: "coral" },
  INVESTMENT: { label: "การลงทุน", icon: "chart", tone: "amber" },
  ROMANCE: { label: "ความสัมพันธ์ออนไลน์", icon: "heart", tone: "violet" },
  ECOMMERCE: { label: "ซื้อขายออนไลน์", icon: "shop", tone: "blue" },
  SMS_PHISHING: { label: "SMS / Phishing", icon: "mail", tone: "mint" },
  TASK: { label: "ภารกิจออนไลน์", icon: "quiz", tone: "amber" },
  FAKE_LOAN: { label: "สินเชื่อออนไลน์", icon: "lock", tone: "blue" },
  RECOVERY: { label: "ติดตามเงินคืน", icon: "search", tone: "coral" },
  JOB: { label: "การสมัครงาน", icon: "briefcase", tone: "violet" },
};
function categoryInfo(category: string) { return categories[category] ?? { label: category, icon: "chat", tone: "violet" }; }
function Mode({ mode }: { mode: string }) { return <span className="tag tag-neutral">{mode === "TEXT_VOICE" ? "ข้อความ / เสียงจำลอง" : "ข้อความจำลอง"}</span>; }

export function ScenarioList() {
  const resource = useResource("/api/scenarios", catalogSchema);
  const [query, setQuery] = useState(""); const [category, setCategory] = useState("");
  if (resource.loading) return <Loading />;
  if (resource.error) return <Failure error={resource.error} retry={() => void resource.reload()} />;
  const catalog = resource.data ?? [];
  const shown = catalog.filter(s => (!category || s.category === category) && [s.title,s.description,categoryInfo(s.category).label,s.category].join(" ").toLocaleLowerCase("th").includes(query.trim().toLocaleLowerCase("th")));
  return <div className="space-y-6"><section className="catalog-intro"><span className="intro-symbol"><Shield /></span><div><h2>พื้นที่ปลอดภัยสำหรับลองตัดสินใจ</h2><p>เลือกเรื่องที่ใกล้ตัว อ่านบริบท แล้วเริ่มฝึกในสถานการณ์จำลอง</p></div></section>
    <div className="filter-bar"><div className="search-field"><Icon name="search" /><label className="sr-only" htmlFor="scenario-search">ค้นหาสถานการณ์</label><input id="scenario-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="ค้นหาสถานการณ์ที่อยากฝึก…" /></div><div className="filter-select"><label htmlFor="scenario-category">หมวดหมู่</label><select id="scenario-category" value={category} onChange={e=>setCategory(e.target.value)}><option value="">ทุกหมวดหมู่</option>{[...new Set(catalog.map(s=>s.category))].map(c=><option key={c} value={c}>{categoryInfo(c).label}</option>)}</select></div></div>
    <p className="muted text-sm" role="status">แสดง {shown.length} จาก {catalog.length} สถานการณ์</p>
    {!catalog.length ? <EmptyState title="ยังไม่มีสถานการณ์ที่เปิดให้ฝึก">กรุณากลับมาตรวจสอบภายหลัง</EmptyState> : !shown.length ? <EmptyState title="ไม่พบสถานการณ์ที่ค้นหา"><p>ลองเปลี่ยนคำค้นหรือหมวดหมู่</p><button className="button button-secondary mt-4" onClick={()=>{setQuery("");setCategory("");}}>ล้างตัวกรอง</button></EmptyState> : <div className="scenario-grid">{shown.map(s => <article key={s.id} className={"scenario-card tone-"+categoryInfo(s.category).tone}><div className="scenario-card-top"><span className="category-icon"><Icon name={categoryInfo(s.category).icon} /></span><Mode mode={s.communicationMode} /></div><div className="scenario-content"><p className="eyebrow">{categoryInfo(s.category).label}</p><h2>{s.title}</h2><p className="muted">{s.description}</p><Link className="button button-secondary mt-5" href={"/scenarios/"+encodeURIComponent(s.id)}>ดูรายละเอียด <Icon name="arrow" /></Link></div></article>)}</div>}
    <Notice>ใช้ข้อความฝึกได้ทุกประเภท ส่วนโหมดเสียง Call Center ต้องตั้งค่าบริการเสียงบนเซิร์ฟเวอร์ก่อนใช้งาน</Notice>
  </div>;
}

export function ScenarioDetail({ scenarioId }: { scenarioId: string }) {
  const resource = useResource("/api/scenarios/"+encodeURIComponent(scenarioId), scenarioDto);
  if (resource.loading) return <Loading />;
  if (resource.error) return <Failure error={resource.error} retry={()=>void resource.reload()} />;
  const s = resource.data; if (!s) return <EmptyState title="ไม่พบรายละเอียด">กลับไปเลือกสถานการณ์อื่นได้</EmptyState>;
  const info = categoryInfo(s.category);
  return <div className="space-y-6"><Link href="/scenarios" className="back-link">← กลับไปเลือกสถานการณ์</Link><article className={"panel scenario-detail tone-"+info.tone}><div className="detail-title"><span className="category-icon"><Icon name={info.icon}/></span><div><p className="eyebrow">{info.label}</p><h1>{s.title}</h1><div className="mt-3"><Mode mode={s.communicationMode}/></div></div></div><section className="detail-section"><h2>บริบทของสถานการณ์</h2><p className="muted mt-3">{s.description}</p></section><section className="detail-section"><h2>วัตถุประสงค์และทักษะที่ได้ฝึก</h2><ul className="objectives">{s.learningObjectives.map((o,i)=><li key={i}><Icon name="check"/>{o}</li>)}</ul></section><section className="detail-section"><h2>รูปแบบการฝึก</h2><p className="muted mt-3">อ่านบริบทและข้อมูล สนทนากับตัวละคร แล้วเลือกการกระทำจำลองตามขั้นตอนที่ระบบเปิดให้ เมื่อจบรอบจึงทบทวนผลการตัดสินใจ</p><p className="field-hint">ระดับความยากและเวลาโดยประมาณยังไม่มีในข้อมูลสถานการณ์ จึงไม่แสดงค่าคาดเดา</p></section><div className="detail-footer"><Link className="button" href={"/scenarios/"+encodeURIComponent(s.id)+"/prepare"}>เริ่มจำลองสถานการณ์ <Icon name="arrow"/></Link></div></article></div>;
}

export function ScenarioStart({ scenarioId }: { scenarioId: string }) {
  const router = useRouter(); const [accepted, setAccepted] = useState(false);
  const resource = useResource("/api/scenarios/"+encodeURIComponent(scenarioId), scenarioDto);
  const start = useMutation(mutationDto, reply => router.push("/training/"+encodeURIComponent(reply.session.sessionId)));
  if (resource.loading) return <Loading />;
  if (resource.error) return <Failure error={resource.error} retry={()=>void resource.reload()} />;
  if (!resource.data) return <Notice>ยังไม่มีข้อมูลสถานการณ์</Notice>;
  return <div className="prepare-page"><PageIntro eyebrow="BEFORE YOU BEGIN" title="ก่อนเริ่มสถานการณ์จำลอง">{resource.data.title}</PageIntro><section className="panel safety-card"><span className="safety-symbol"><Shield /></span><h2>คำเตือนก่อนเริ่มสถานการณ์</h2><p className="muted mt-3">อ่านคำแนะนำและยืนยันความเข้าใจก่อนเข้าสู่การฝึก</p><Notice>นี่คือสถานการณ์สมมติเพื่อการเรียนรู้ ไม่ใช่ธนาคาร ร้านค้า หรือผู้ให้บริการจริง</Notice><ul className="safety-list"><li>ไม่ใช้เงินจริง ไม่โอนเงิน และไม่ติดตั้งแอปตามบทสนทนา</li><li>ไม่กรอก OTP รหัสผ่าน เลขบัญชี หรือข้อมูลส่วนบุคคลจริง</li><li>การพิมพ์หรือพูดคุยไม่ใช่การยืนยันการกระทำ ต้องเลือกผ่านตัวควบคุมของระบบ</li><li>ออกจากรอบฝึกได้ แต่รอบที่ออกก่อนจบจะไม่มีผลประเมิน</li></ul><label className="action-option"><input type="checkbox" checked={accepted} disabled={start.blocked} onChange={e=>setAccepted(e.target.checked)} /><span>ฉันอ่านคำเตือนและเข้าใจว่าจะใช้ข้อมูลสมมติเท่านั้น</span></label></section>{start.error && <Failure error={start.error} retry={start.retryable ? ()=>void start.retry() : undefined} />}<div className="prepare-actions"><Link className="back-link" href={"/scenarios/"+encodeURIComponent(scenarioId)}>← กลับไปดูรายละเอียด</Link><button className="button" disabled={!accepted || start.blocked} onClick={()=>{if(accepted) void start.run(new MutationAttempt("/api/scenarios/"+encodeURIComponent(scenarioId)+"/start",{startId:crypto.randomUUID(),expectedRevision:0}));}}>{start.busy ? "กำลังเริ่มรอบฝึก…" : "เริ่มฝึกสถานการณ์"}<Icon name="arrow" /></button></div></div>;
}
