"use client";
import { useState } from "react";
import Link from "next/link.js";
import { useSession } from "next-auth/react";
import { quizOverview } from "../public-api/quiz.js";
import { useResource } from "./hooks.js";
import { EmptyState, Failure, Icon, Loading, Notice, PageIntro } from "./ui.js";

const dateLabel = (at: number) => new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(at);
export function LearningDashboard() {
  const resource = useResource("/api/quiz", quizOverview);
  if (resource.loading) return <Loading />;
  if (resource.error) return <Failure error={resource.error} retry={()=>void resource.reload()} />;
  const history = resource.data?.history ?? [];
  const completed = history.filter(a=>a.status === "COMPLETED" && a.result).sort((a,b)=>b.result!.completedAt-a.result!.completedAt);
  const latest = completed[0];
  return <div className="space-y-6"><PageIntro eyebrow="YOUR LEARNING JOURNEY" title="ภาพรวมการเรียนรู้">ทบทวนผลของคุณ แล้วเลือกก้าวต่อไปในการฝึก</PageIntro>
    <Notice>หน้านี้ใช้ประวัติ Quiz สูงสุด 50 รอบจากระบบจริง ยังไม่รวมประวัติสถานการณ์ เกม หรือคะแนนความเชี่ยวชาญรวม</Notice>
    <div className="stat-grid"><article className="stat-card"><p>Quiz ที่เสร็จในประวัติที่โหลด</p><strong>{completed.length}</strong><p>รอบ</p></article><article className="stat-card"><p>ผล Quiz รอบล่าสุด</p><strong>{latest?.result ? latest.result.percentage+"%" : "—"}</strong><p>{latest ? (latest.mode === "PRE_TEST" ? "Pre-test" : "Post-test")+" · "+dateLabel(latest.result!.completedAt) : "ยังไม่มีผลการทำแบบทดสอบ"}</p></article><article className="stat-card"><p>Quiz ที่ยังทำไม่จบในประวัติ</p><strong>{history.filter(a=>a.status === "ACTIVE").length}</strong><Link className="text-link" href="/quiz">ดูรอบที่บันทึกไว้ →</Link></article></div>
    {!completed.length ? <EmptyState title="เส้นทางการเรียนรู้เริ่มได้จากรอบแรก"><p>เมื่อทำแบบทดสอบเสร็จ ผลจริงจะแสดงที่นี่ ไม่มีการสร้างคะแนนตัวอย่าง</p><Link href="/quiz" className="button mt-5">เริ่มแบบทดสอบ</Link></EmptyState> : <div className="dashboard-columns"><section className="panel"><h2>ผล Quiz 6 รอบล่าสุด</h2><p className="field-hint mb-5">แสดงแต่ละรอบตามวันที่ ไม่ใช่คะแนนพัฒนาการรวม ชุดคำถามสุ่มอาจแตกต่างกัน</p><ol className="trend-list">{completed.slice(0,6).reverse().map(a=><li key={a.id}><div className="trend-label"><Link className="text-link" href={"/quiz/"+encodeURIComponent(a.id)}>{a.mode === "PRE_TEST" ? "Pre-test" : "Post-test"} · {dateLabel(a.result!.completedAt)}</Link><span>{a.result!.correct}/{a.result!.total} ข้อ · {a.result!.percentage}%</span></div><progress value={a.result!.percentage} max={100} aria-label={"สัดส่วนข้อถูก "+dateLabel(a.result!.completedAt)} /></li>)}</ol></section><section className="panel"><h2>หัวข้อที่ควรทบทวนจากรอบล่าสุด</h2><p className="field-hint mt-3">อ้างอิงเฉพาะข้อที่ตอบผิดใน Quiz รอบล่าสุด ไม่ใช่ผลวัดทักษะจากสถานการณ์</p><ul className="objectives">{latest!.result!.categories.filter(c=>c.correct<c.total).map(c=><li key={c.id}><Icon name="book"/><span>{c.label} · ตอบถูก {c.correct}/{c.total}</span></li>)}</ul>{latest!.result!.categories.every(c=>c.correct===c.total) && <p className="muted mt-4">ตอบถูกครบในชุดนี้ ลองฝึกสถานการณ์เพื่อทบทวนการนำไปใช้</p>}<Link className="button button-secondary mt-5" href="/scenarios">เลือกสถานการณ์ฝึก</Link></section></div>}
    <section className="panel"><h2>ผลการฝึกสถานการณ์</h2><p className="muted mt-3">ดูผลได้ที่หน้าสรุปเมื่อจบรอบฝึก ระบบยังไม่มี API สำหรับรวมประวัติสถานการณ์บนแดชบอร์ดนี้</p><Link href="/scenarios" className="text-link mt-4">ไปฝึกสถานการณ์ →</Link></section>
  </div>;
}

export function AccountSettings() {
  const { data, status } = useSession();
  if (status === "loading") return <Loading />;
  return <div className="space-y-6"><PageIntro eyebrow="YOUR ACCOUNT" title="ตั้งค่าบัญชี">ข้อมูลบัญชีและความสามารถที่เปิดใช้งานในรุ่นนี้</PageIntro><section className="panel"><div className="detail-title"><span className="category-icon"><Icon name="user" /></span><h2>ข้อมูลบัญชี</h2></div><dl className="account-details mt-6"><dt>อีเมลจาก session</dt><dd>{data?.user?.email ?? "ระบบไม่ได้ส่งอีเมลในข้อมูล session"}</dd><dt>สถานะ</dt><dd>{status === "authenticated" ? "เข้าสู่ระบบแล้ว" : "ยังไม่ได้เข้าสู่ระบบ"}</dd><dt>ช่องทางเข้าสู่ระบบ</dt><dd>อีเมลและรหัสผ่าน</dd></dl></section><section className="panel"><h2>การแก้ไขข้อมูลและความปลอดภัย</h2><p className="muted mt-3">การแก้ไขโปรไฟล์ เปลี่ยนอีเมล เปลี่ยนรหัสผ่าน และลบบัญชียังไม่เปิดใช้งาน จึงไม่มีฟอร์มบันทึกที่ไม่เชื่อมกับระบบจริง</p><Link href="/faq" className="button button-secondary mt-5">ดูคำถามเกี่ยวกับบัญชี</Link></section><Notice>ออกจากระบบได้จากเมนูบัญชีด้านข้าง บนอุปกรณ์มือถือให้เปิดเมนูด้านบนก่อน</Notice></div>;
}

const questions = [
  { group: "การใช้งาน", q: "MITJEE คืออะไร?", a: "พื้นที่เรียนรู้และฝึกตัดสินใจรับมือการหลอกลวงออนไลน์ผ่านสถานการณ์สมมติ ตัวละครและธุรกรรมในบทฝึกไม่ใช่บริการจริง" },
  { group: "การใช้งาน", q: "เริ่มฝึกสถานการณ์อย่างไร?", a: "สมัครสมาชิกและเข้าสู่ระบบ เลือกสถานการณ์ อ่านรายละเอียดและคำเตือน จากนั้นยืนยันก่อนเริ่มฝึก คุณสามารถพิมพ์สนทนาและเลือกการกระทำตามขั้นตอนที่ระบบเปิดให้" },
  { group: "สถานการณ์", q: "การพิมพ์หรือพูดคุยมีผลต่อการประเมินโดยตรงหรือไม่?", a: "ไม่มีผลตัดสินโดยตรง ผลการฝึกมาจากการกระทำจำลองที่ผ่านการตรวจของ Backend ไม่ใช้ความมั่นใจของ AI มาตัดสินคะแนนหรือความผิดพลาดร้ายแรง" },
  { group: "สถานการณ์", q: "ใช้เสียงได้ทุกสถานการณ์หรือไม่?", a: "เสียงรองรับเฉพาะ Call Center และต้องตั้งค่าบริการเสียงบนเซิร์ฟเวอร์ เมื่อกดเริ่มโหมดเสียงระบบจึงขอสิทธิ์ไมโครโฟน หากใช้ไม่ได้ยังพิมพ์ข้อความต่อได้ ไม่มีการโทรหาบุคคลจริง" },
  { group: "สถานการณ์", q: "ออกจากรอบฝึกหรือรีเฟรชหน้าได้ไหม?", a: "รีเฟรชแล้วกลับมาทำรอบ ACTIVE เดิมได้ตามข้อมูลที่บันทึกไว้ การกดยืนยันออกก่อนจบจะไม่มีผลประเมินอย่างเป็นทางการ และรอบที่ไม่มีการใช้งาน 30 นาทีจะหมดอายุ" },
  { group: "แบบทดสอบ", q: "Pre-test กับ Post-test ต่างกันอย่างไร?", a: "Pre-test เก็บผลก่อนฝึก ส่วน Post-test ใช้ทบทวนหลังฝึก ระบบเปรียบเทียบกับ Pre-test ที่เสร็จก่อนเริ่มรอบและใช้คลังรุ่นเดียวกัน ครั้งละ 20 ข้อ บันทึกไว้ทำต่อและดูเฉลยหลังส่งได้" },
  { group: "บัญชี", q: "เข้าสู่ระบบด้วย Google หรือรีเซ็ตรหัสผ่านได้หรือยัง?", a: "รุ่นนี้รองรับอีเมลและรหัสผ่านเท่านั้น Google login และการรีเซ็ตรหัสผ่านยังไม่เปิดใช้งาน จึงไม่แสดงปุ่มที่ใช้งานไม่ได้" },
  { group: "บัญชี", q: "ควรใช้ข้อมูลแบบไหนในสถานการณ์?", a: "ใช้ข้อมูลสมมติเท่านั้น ห้ามส่ง OTP รหัสผ่าน เลขบัญชี หรือข้อมูลส่วนบุคคลจริง ระบบลดการเก็บข้อมูลอ่อนไหว แต่ไม่ควรถือว่าเป็นการรับประกันว่าจะตรวจพบข้อมูลส่วนบุคคลได้ทุกชนิด" },
  { group: "การใช้งาน", q: "เกมสืบสวนและคลังความรู้เปิดใช้แล้วหรือยัง?", a: "ยังไม่มีระบบคดีและคลังบทเรียนที่เผยแพร่ในรุ่นนี้ หน้าที่มีป้ายตัวอย่าง UI ใช้ดูโครงหน้าเท่านั้น ไม่บันทึกคะแนนหรือความก้าวหน้า" },
];
export function FAQ() {
  const [query,setQuery]=useState(""); const [group,setGroup]=useState("ทั้งหมด");
  const shown=questions.filter(q=>(group === "ทั้งหมด" || q.group===group) && (q.q+q.a).includes(query.trim()));
  return <div className="space-y-6"><PageIntro eyebrow="HELP CENTER" title="คำถามที่พบบ่อย">คำตอบเกี่ยวกับการฝึก การประเมิน และบัญชีของคุณ</PageIntro><div className="search-field"><Icon name="search"/><label className="sr-only" htmlFor="faq-search">ค้นหาคำถาม</label><input id="faq-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="ค้นหา เช่น เสียง คะแนน รหัสผ่าน" /></div><div className="filter-chips" aria-label="หมวดคำถาม">{["ทั้งหมด",...new Set(questions.map(q=>q.group))].map(g=><button key={g} aria-pressed={group===g} onClick={()=>setGroup(g)}>{g}</button>)}</div><p className="muted text-sm" role="status">พบ {shown.length} คำถาม</p>{shown.length ? <div className="faq-list">{shown.map(q=><details key={q.q}><summary>{q.q}</summary><p>{q.a}</p></details>)}</div> : <EmptyState title="ไม่พบคำถามที่ตรงกัน">ลองเปลี่ยนคำค้นหรือเลือกหมวดทั้งหมด</EmptyState>}</div>;
}
