"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link.js";
import { usePathname } from "next/navigation.js";
import { useSession } from "next-auth/react";
import { AuthNavigation } from "./auth.js";
import { Brand, Icon } from "./ui.js";

const navigation = [
  { href: "/dashboard", label: "ภาพรวมการเรียนรู้", icon: "chart" },
  { href: "/scenarios", label: "สถานการณ์ AI", icon: "chat" },
  { href: "/quiz", label: "แบบทดสอบ", icon: "quiz" },
  { href: "/games", label: "เกมสืบสวน", icon: "search" },
  { href: "/knowledge", label: "คลังความรู้", icon: "book" },
  { href: "/settings", label: "ตั้งค่าบัญชี", icon: "user" },
  { href: "/faq", label: "คำถามที่พบบ่อย", icon: "help" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  const publicPage = pathname === "/" || pathname === "/login" || pathname === "/register";
  const active = navigation.find(item => pathname === item.href || pathname.startsWith(item.href + "/"))
    ?? (pathname.startsWith("/training/") ? navigation[1] : undefined);
  return <div className={publicPage ? "public-site" + (pathname === "/" ? " landing-site" : " auth-site") : "workspace"}>
    <a href="#main-content" className="skip-link">ข้ามไปยังเนื้อหา</a>
    {publicPage ? <header className="app-header"><div className="shell header-inner"><Brand /><AuthNavigation /></div></header> : <>
      <header className="mobile-header"><Brand /><button ref={menuButton} className="icon-button" aria-label={menuOpen ? "ปิดเมนู" : "เปิดเมนู"} aria-expanded={menuOpen} aria-controls="workspace-sidebar" onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? "close" : "menu"} /></button></header>
      <aside id="workspace-sidebar" className={"sidebar" + (menuOpen ? " is-open" : "")} onKeyDown={e => { if (e.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); } }}>
        <div className="sidebar-brand"><Brand /></div><p className="sidebar-caption">พื้นที่การเรียนรู้</p>
        <nav className="sidebar-nav" aria-label="เมนูพื้นที่เรียนรู้">{navigation.map(item => <Link key={item.href} href={item.href} aria-current={active?.href === item.href ? "page" : undefined} onClick={() => setMenuOpen(false)}><Icon name={item.icon} /><span>{item.label}</span></Link>)}</nav>
        <div className="sidebar-bottom"><div className="sidebar-account"><span className="avatar"><Icon name="user" /></span><div><strong>บัญชีผู้เรียน</strong><p>{session?.user?.email ?? "พื้นที่ฝึกของคุณ"}</p></div></div><AuthNavigation /><Link className="sidebar-home" href="/">← กลับหน้าแรก</Link></div>
      </aside>
    </>}
    <div className="workspace-body">
      {!publicPage && <header className="workspace-header"><nav aria-label="เส้นทางหน้า"><Link href="/">หน้าหลัก</Link><span aria-hidden="true"> / </span><span>{active?.label ?? "พื้นที่การเรียนรู้"}</span></nav><Link className="icon-button" href="/faq" aria-label="ความช่วยเหลือ"><Icon name="help" /></Link></header>}
      <main id="main-content" tabIndex={-1} className={publicPage ? "shell main-content" : "workspace-content"}>{children}</main>
      <footer className="app-footer"><div className={publicPage ? "shell footer-inner" : "footer-inner"}><p><strong>MITJEE</strong> · ฝึกคิดก่อนคลิก</p><p>พื้นที่จำลองเพื่อการเรียนรู้ · ไม่มีธุรกรรมจริง</p></div></footer>
    </div>
  </div>;
}
