import type { ReactNode } from "react";
import Link from "next/link.js";
import type { ApiFailure } from "./api.js";

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
