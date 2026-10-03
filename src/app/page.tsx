import Link from "next/link.js";
import { Icon } from "../frontend/ui.js";
export default function Home() {
  return <div className="landing-content">
    <section className="hero">
      <div className="hero-copy"><p className="eyebrow">SAFE SIMULATION ENVIRONMENT</p><h1>ฝึกจับสัญญาณ<br />ก่อนมิจฉาชีพ<br /><span>จะใช้มันกับคุณ</span></h1><p className="hero-description">เรียนรู้ผ่านบทสนทนา ลองตัดสินใจ และทบทวนผล<br className="hidden sm:block" />ในพื้นที่จำลอง ก่อนเจอสถานการณ์จริง</p><div className="hero-links"><Link href="/scenarios" className="button button-mint">เริ่มฝึกกับ MITJEE <Icon name="arrow" /></Link><Link href="/login" className="hero-login">มีบัญชีแล้ว? เข้าสู่ระบบ</Link></div><p className="hero-note">ไม่มีธุรกรรมจริง · ใช้ข้อมูลสมมติเท่านั้น</p></div>
      <div className="hero-preview" aria-label="ตัวอย่างหน้าตาบทสนทนา ไม่ใช่รอบฝึกจริง"><div className="preview-heading"><span>SCENARIO PREVIEW</span><span className="tag tag-light">ตัวอย่างหน้าจอ</span></div><div className="preview-contact"><span className="avatar"><Icon name="chat" /></span><div><strong>ข้อความจากผู้ติดต่อ</strong><p>ตัวละครและเหตุการณ์สมมติ</p></div></div><div className="preview-bubble">สวัสดีค่ะ ติดต่อมาเรื่องรายการที่คุณต้องตรวจสอบค่ะ</div><div className="preview-bubble preview-user">ขอทราบรายละเอียดเพิ่มเติมได้ไหมคะ?</div><div className="preview-decision"><p className="eyebrow">YOUR NEXT MOVE</p><h2>หยุดคิด แล้วเลือกวิธีตอบสนอง</h2><p>สังเกตบริบท พิจารณาหลักฐาน<br />และตัดสินใจด้วยตัวเอง</p><div className="preview-steps"><span>01 สังเกต</span><span>02 ตรวจสอบ</span><span>03 ตัดสินใจ</span></div></div><p className="preview-caption">ข้อความตัวอย่างเพื่อแนะนำ UI ไม่ใช่ผลการประเมิน</p></div>
      <div className="hero-categories">CALL CENTER <span>·</span> PHISHING <span>·</span> INVESTMENT <span>·</span> ROMANCE <span>·</span> และอีก 5 หมวด</div>
    </section>
    <section className="learning-section"><div className="section-heading-row"><div><p className="eyebrow">LEARN. PRACTICE. REFLECT.</p><h2>เรียนรู้ในแบบที่เหมาะกับคุณ</h2></div><Link href="/faq" className="text-link">รู้จัก MITJEE →</Link></div><div className="learning-mode-grid">{[
      { icon: "chat", title: "สถานการณ์จำลอง AI", text: "ฝึกโต้ตอบและตัดสินใจจาก 9 หมวดใกล้ตัว พร้อมทบทวนผลหลังจบ", href: "/scenarios", ready: true },
      { icon: "quiz", title: "แบบทดสอบ", text: "ทำ Pre-test / Post-test บันทึกคำตอบ ทำต่อ และดูเฉลยจากรอบของคุณ", href: "/quiz", ready: true },
      { icon: "search", title: "เกมสืบสวน", text: "แนวทางฝึกพิจารณาหลักฐานและสืบหาความจริงในคดีจำลอง", href: "/games", ready: false },
      { icon: "book", title: "คลังความรู้", text: "พื้นที่สำหรับบทเรียนและเนื้อหาทบทวนทักษะรับมือการหลอกลวง", href: "/knowledge", ready: false },
    ].map(item => <article className="learning-mode" key={item.href}><span className="category-icon"><Icon name={item.icon} /></span><span className={"tag " + (item.ready ? "tag-active" : "tag-neutral")}>{item.ready ? "เปิดใช้งาน" : "กำลังพัฒนา"}</span><h3>{item.title}</h3><p>{item.text}</p><Link href={item.href}>{item.ready ? "เข้าใช้งาน" : "ดูสถานะและตัวอย่าง UI"} <Icon name="arrow" /></Link></article>)}</div></section>
    <section className="learning-strip" aria-label="แนวทางการฝึก">{[["01", "เลือกสถานการณ์", "อ่านบริบทและคำเตือนก่อนเริ่ม"], ["02", "ลองตัดสินใจ", "พิมพ์สนทนาและเลือกการกระทำจำลอง"], ["03", "ทบทวนสิ่งที่เรียนรู้", "ดูผลจากระบบและเลือกฝึกเพิ่มเติม"]].map(([number,title,description]) => <div key={number}><span className="step-number">{number}</span><h2>{title}</h2><p>{description}</p></div>)}</section>
  </div>;
}
