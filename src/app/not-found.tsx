import Link from "next/link.js";
export default function NotFound() {
  return <section className="panel terminal-panel"><p className="eyebrow">ไม่พบหน้า</p><h1>หน้านี้ไม่พร้อมใช้งาน</h1><p className="muted mt-3">กลับไปยังหน้าหลักเพื่อเริ่มต้นใหม่</p><Link href="/" className="button mt-6">กลับหน้าหลัก →</Link></section>;
}
