import type { ReactNode } from "react";
import { AuthProvider } from "../frontend/auth.js";
import { AppShell } from "../frontend/shell.js";
import "./globals.css";
import "./design-system.css";
import "./phone-simulator.css";

export const metadata = { title: { default: "MITJEE · ฝึกรู้ทันภัยไซเบอร์", template: "%s · MITJEE" }, description: "พื้นที่ฝึกรับมือการหลอกลวงทางไซเบอร์ผ่านสถานการณ์จำลอง" };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="th"><body><AuthProvider>
    <AppShell>{children}</AppShell>
  </AuthProvider></body></html>;
}
