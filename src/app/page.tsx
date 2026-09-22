import Link from "next/link.js";
import { Shield } from "../frontend/ui.js";
export default function Home() {
  return <div>
    <section className="hero"><div className="hero-copy"><span className="tag">พื้นที่ฝึกรู้ทันภัยไซเบอร์</span><h1>รู้ทันก่อนเชื่อ<br /><span>ฝึกคิดก่อนคลิก</span></h1><p className="hero-description">ลองรับมือกับการหลอกลวงในพื้นที่จำลอง<br className="hidden sm:block" />ฝึกสังเกต ตัดสินใจ และเลือกการตอบสนอง<br className="hidden sm:block" />ก่อนเจอสถานการณ์จริง</p>
      <div className="flex flex-wrap gap-3 mt-8"><Link href="/register" className="button">เริ่มต้นฝึกกับ MITJEE <span aria-hidden="true">→</span></Link><Link href="/login" className="button button-secondary">มีบัญชีแล้ว? เข้าสู่ระบบ</Link></div>
      <p className="field-hint mt-5">ฝึกด้วยข้อมูลสมมติ · เรียนรู้จากการตัดสินใจของตัวเอง</p></div>
      <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="hero-shield"><Shield /></div><div className="art-label art-label-one"><span>01</span> สังเกต</div><div className="art-label art-label-two"><span>02</span> ตรวจสอบ</div><div className="art-label art-label-three"><span>03</span> ตัดสินใจ</div><p className="art-caption">A SAFER CHOICE STARTS WITH YOU</p></div>
    </section>
    <section className="learning-strip" aria-label="แนวทางการฝึก">{[
      ["01", "เลือกสถานการณ์", "เริ่มจาก SMS / Phishing ที่เปิดให้ฝึกในขณะนี้"],
      ["02", "ลองตัดสินใจ", "โต้ตอบผ่านข้อความและเลือกการกระทำจำลอง"],
      ["03", "ทบทวนสิ่งที่ได้เรียนรู้", "ดูผลประเมินและคำแนะนำหลังสิ้นสุดรอบฝึก"],
    ].map(([number, title, description]) => <div key={number}><span className="step-number">{number}</span><h2>{title}</h2><p>{description}</p></div>)}</section>
    <div className="scope-note"><span className="status-dot" /> เวอร์ชันสาธิต: เปิดฝึกเฉพาะ SMS / Phishing ยังไม่มีเสียงหรือสถานการณ์ประเภทอื่น</div>
  </div>;
}
