import { AuthForm } from "../../../frontend/auth.js";
export const metadata = { title: "เข้าสู่ระบบ" };
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <><p className="eyebrow">ยินดีต้อนรับกลับ</p><h1>เข้าสู่ระบบ MITJEE</h1><p className="muted mt-3 mb-7">กลับมาฝึกทักษะรับมือภัยไซเบอร์ไปด้วยกัน</p><AuthForm mode="login" registered={query.registered === "1"} /></>;
}
