import type { ReactNode } from "react";
import { Shield } from "../../frontend/ui.js";
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="auth-layout"><aside className="auth-aside"><span className="tag tag-light">MITJEE / LEARNING SPACE</span><h2>ความมั่นใจ<br />เริ่มจากการฝึก</h2><p>เรียนรู้วิธีสังเกตและรับมือ<br />กับการหลอกลวงทางไซเบอร์<br />ทีละการตัดสินใจ</p><div className="auth-shield" aria-hidden="true"><Shield /></div><p className="auth-aside-note">พื้นที่จำลองสำหรับการเรียนรู้<br />ไม่มีการทำธุรกรรมจริง</p></aside><section className="auth-card">{children}</section></div>;
}
