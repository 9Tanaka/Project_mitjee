"use client";
export default function PageError({ reset }: { reset: () => void }) {
  return <section className="panel terminal-panel"><h1>ไม่สามารถแสดงหน้านี้ได้</h1><p className="muted mt-3" role="alert">กรุณาลองอีกครั้ง ระบบจะไม่แสดงรายละเอียดข้อผิดพลาดภายใน</p><button className="button mt-6" onClick={reset}>ลองอีกครั้ง</button></section>;
}
