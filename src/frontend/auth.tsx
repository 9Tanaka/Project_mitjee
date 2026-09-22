"use client";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { SessionProvider, signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation.js";
import Link from "next/link.js";
import { z } from "zod";
import { accountInput } from "../public-api/account-policy.js";
import { api, ApiFailure } from "./api.js";
import { Loading, Notice } from "./ui.js";

export function AuthProvider({ children }: { children: ReactNode }) {
  return <SessionProvider refetchInterval={0} refetchOnWindowFocus>{children}</SessionProvider>;
}
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useSession(); const router = useRouter();
  useEffect(() => { if (status === "unauthenticated") router.replace("/login"); }, [status, router]);
  if (status !== "authenticated") return <Loading text={status === "loading" ? "กำลังตรวจสอบการเข้าสู่ระบบ…" : "กำลังพาไปหน้าเข้าสู่ระบบ…"} />;
  return children;
}
export function AuthNavigation() {
  const { status } = useSession(); const router = useRouter();
  const lock = useRef(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  async function logout() {
    if (lock.current) return; lock.current = true; setBusy(true); setError(false);
    try { await signOut({ redirect: false, redirectTo: "/login" }); router.replace("/login"); router.refresh(); }
    catch { setError(true); }
    finally { lock.current = false; setBusy(false); }
  }
  if (status === "loading") return <span className="nav-status" role="status">กำลังตรวจสอบบัญชี…</span>;
  return <nav aria-label="เมนูหลัก" className="nav">
    {status === "authenticated" ? <>
      <Link href="/scenarios" className="nav-link">สถานการณ์ฝึก</Link>
      <button className="nav-logout" onClick={() => void logout()} disabled={busy}>{busy ? "กำลังออก…" : "ออกจากระบบ"}</button>
      {error && <span role="alert" className="field-error">ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง</span>}
    </> : <><Link href="/login" className="nav-link">เข้าสู่ระบบ</Link><Link href="/register" className="button button-small">สมัครสมาชิก</Link></>}
  </nav>;
}
const registrationResult = z.strictObject({ user: z.strictObject({ id: z.uuid() }) });
export function AuthForm({ mode, registered = false }: { mode: "login" | "register"; registered?: boolean }) {
  const router = useRouter(); const { status } = useSession();
  const lock = useRef(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [invalid, setInvalid] = useState(false);
  useEffect(() => { if (status === "authenticated") router.replace("/scenarios"); }, [status, router]);
  const registering = mode === "register";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return;
    const form = event.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const passwordField = form.elements.namedItem("password") as HTMLInputElement;
    const confirmation = form.elements.namedItem("confirmPassword") as HTMLInputElement | null;
    const password = passwordField.value, confirm = confirmation?.value;
    const parsed = accountInput.safeParse({ email, password });
    passwordField.value = ""; if (confirmation) confirmation.value = ""; // Never retain submitted passwords in UI.
    setError(""); setInvalid(false);
    if (!parsed.success || (registering && password !== confirm)) {
      setInvalid(true);
      setError(registering && password !== confirm ? "รหัสผ่านทั้งสองช่องไม่ตรงกัน กรุณากรอกใหม่"
        : registering ? "กรุณาตรวจสอบอีเมล และใช้รหัสผ่านอย่างน้อย 12 ตัวอักษร ไม่เกิน 72 ไบต์" : "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      return;
    }
    lock.current = true; setBusy(true);
    try {
      if (registering) {
        await api("/api/auth/register", registrationResult, { body: JSON.stringify(parsed.data) });
        form.reset(); router.replace("/login?registered=1");
      } else {
        const result = await signIn("credentials", { ...parsed.data, redirect: false, redirectTo: "/scenarios" });
        if (result.error || !result.ok) setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
        else { form.reset(); router.replace("/scenarios"); router.refresh(); }
      }
    } catch (e) {
      setError(registering && e instanceof ApiFailure ? e.message : "ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง");
    } finally { lock.current = false; setBusy(false); }
  }
  return <form onSubmit={submit} noValidate className="auth-form">
    {registered && !registering && <Notice kind="success">สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ</Notice>}
    {error && <div id="auth-error"><Notice kind="error">{error}</Notice></div>}
    <div className="field"><label htmlFor="email">อีเมล</label><input id="email" name="email" type="email" autoComplete="email" inputMode="email" maxLength={254} required disabled={busy} aria-invalid={invalid} aria-describedby={error ? "auth-error" : undefined} placeholder="กรอกอีเมลของคุณ" /></div>
    <div className="field"><label htmlFor="password">รหัสผ่าน</label><input id="password" name="password" type="password" autoComplete={registering ? "new-password" : "current-password"} required disabled={busy} aria-invalid={invalid} aria-describedby={"password-help" + (error ? " auth-error" : "")} placeholder={registering ? "สร้างรหัสผ่านสำหรับบัญชีนี้" : "กรอกรหัสผ่าน"} />
      <p id="password-help" className="field-hint">อย่างน้อย 12 ตัวอักษร ไม่เกิน 72 ไบต์ UTF-8 (ภาษาไทยใช้หลายไบต์ต่อตัวอักษร) ช่องว่างนับเป็นส่วนหนึ่งของรหัสผ่าน</p></div>
    {registering && <div className="field"><label htmlFor="confirmPassword">ยืนยันรหัสผ่าน</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required disabled={busy} aria-invalid={invalid} aria-describedby={error ? "auth-error" : undefined} placeholder="กรอกรหัสผ่านอีกครั้ง" /></div>}
    <button type="submit" className="button w-full" disabled={busy}>{busy ? "กำลังดำเนินการ…" : registering ? "สร้างบัญชี" : "เข้าสู่ระบบ"}<span aria-hidden="true">→</span></button>
    <p className="text-center muted text-sm">{registering ? "มีบัญชีแล้ว?" : "ยังไม่มีบัญชี?"} <Link className="text-link" href={registering ? "/login" : "/register"}>{registering ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}</Link></p>
  </form>;
}
