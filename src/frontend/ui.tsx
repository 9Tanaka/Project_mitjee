import type { ReactNode } from "react";
import Link from "next/link.js";
import type { ApiFailure } from "./api.js";

const iconPaths: Record<string, string> = {
  chat: "M4 4h16v12H9l-5 4V4Zm4 5h8M8 12h5", phone: "M7 3 4 5c-1 7 8 16 15 15l2-3-5-4-2 2-5-5 2-2-4-5Z",
  chart: "M4 3v17h17M8 15v-4m5 4V7m5 8V5", quiz: "M8 5H5v16h14V5h-3M8 3h8v4H8V3Zm0 9h8m-8 4h5",
  search: "M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z", book: "M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1Zm0 0v15",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a8 8 0 0 1 16 0v3",
  help: "M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  menu: "M4 6h16M4 12h16M4 18h16", close: "m6 6 12 12M6 18 18 6", arrow: "M4 12h16m-6-6 6 6-6 6",
  heart: "M12 21 3 12C-3 4 8-1 12 6c4-7 15-2 9 6l-9 9Z", shop: "M3 3h2l3 13h10l3-9H6M9 20h.1M18 20h.1",
  mail: "M3 5h18v14H3V5Zm0 1 9 7 9-7", briefcase: "M8 7V3h8v4M3 7h18v14H3V7Zm0 5h18m-9-2v5",
  lock: "M6 10V7a6 6 0 0 1 12 0v3M4 10h16v12H4V10Zm8 5v3", check: "m5 12 4 4L20 5",
};
export function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <svg className={"ui-icon " + className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconPaths[name] ?? iconPaths.chat} /></svg>;
}
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className="panel empty-state"><span className="empty-icon"><Icon name="book" /></span><h2>{title}</h2><div className="muted mt-3">{children}</div></div>;
}

export function Shield({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 4.5 6v5.6c0 4.4 3 7.8 7.5 9.4 4.5-1.6 7.5-5 7.5-9.4V6L12 3Z" stroke="currentColor" strokeWidth="1.7"/><path d="m8.5 12 2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
export function Brand() {
  return <Link href="/" className="brand" aria-label="MITJEE หน้าหลัก"><span className="brand-mark"><Shield /></span><span>MITJEE<span className="brand-sub">CYBER AWARENESS</span></span></Link>;
}
export function Loading({ text = "กำลังโหลดข้อมูล…" }: { text?: string }) {
  return <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" />{text}</div>;
}
export function Notice({ children, kind = "info" }: { children: ReactNode; kind?: "info" | "error" | "success" }) {
  return <div className={"notice notice-" + kind} role={kind === "error" ? "alert" : "status"}>{children}</div>;
}
export function Failure({ error, retry }: { error: ApiFailure; retry?: (() => void) | undefined }) {
  const terminal = [401, 403, 404, 410].includes(error.status);
  return <div className="space-y-4"><Notice kind="error">{error.message}</Notice>
    {retry && !terminal && <button className="button button-secondary" onClick={retry}>ลองอีกครั้ง</button>}
    {terminal && <Link className="text-link" href={error.status === 401 ? "/login" : "/scenarios"}>{error.status === 401 ? "เข้าสู่ระบบ" : "กลับไปเลือกสถานการณ์"} →</Link>}
  </div>;
}
export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <div className="page-intro"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{children && <div className="muted mt-3 max-w-2xl">{children}</div>}</div>;
}
