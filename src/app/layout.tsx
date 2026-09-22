import type { ReactNode } from "react";
import { AuthNavigation, AuthProvider } from "../frontend/auth.js";
import { Brand } from "../frontend/ui.js";
import "./globals.css";

export const metadata = { title: { default: "MITJEE · ฝึกรู้ทันภัยไซเบอร์", template: "%s · MITJEE" }, description: "พื้นที่ฝึกรับมือการหลอกลวงทางไซเบอร์ผ่านสถานการณ์จำลอง" };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="th"><body><AuthProvider>
    <a href="#main-content" className="skip-link">ข้ามไปยังเนื้อหา</a>
    <header className="app-header"><div className="shell header-inner"><Brand /><AuthNavigation /></div></header>
    <main id="main-content" tabIndex={-1} className="shell main-content">{children}</main>
    <footer className="app-footer"><div className="shell footer-inner"><p><strong>MITJEE</strong> · ฝึกคิดก่อนคลิก</p><p>โหมดสถานการณ์จำลอง · ใช้ข้อมูลสมมติเท่านั้น · ผลประเมินกำหนดโดยระบบ</p></div></footer>
  </AuthProvider></body></html>;
}
