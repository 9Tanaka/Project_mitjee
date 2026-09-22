import { AuthForm } from "../../../frontend/auth.js";
export const metadata = { title: "สมัครสมาชิก" };
export default function RegisterPage() {
  return <><p className="eyebrow">เริ่มต้นเรียนรู้</p><h1>สร้างบัญชีของคุณ</h1><p className="muted mt-3 mb-7">สมัครสมาชิกเพื่อเริ่มฝึกสถานการณ์จำลอง</p><AuthForm mode="register" /></>;
}
