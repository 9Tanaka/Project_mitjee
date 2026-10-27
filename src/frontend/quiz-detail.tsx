"use client";
import Link from "next/link.js";
import { useRouter } from "next/navigation.js";
import { quizOverview, quizMutation } from "../public-api/quiz.js";
import { useMutation, useResource } from "./hooks.js";
import { MutationAttempt } from "./api.js";
import { Failure, Icon, Loading, PageIntro } from "./ui.js";

export function QuizDetail({ mode }: { mode: "PRE_TEST" | "POST_TEST" }) {
  const router=useRouter();
  const resource=useResource("/api/quiz",quizOverview);
  const start=useMutation(quizMutation,reply=>router.push("/quiz/"+encodeURIComponent(reply.attempt.id)));
  if(resource.loading) return <Loading/>;
  if(resource.error) return <Failure error={resource.error} retry={()=>void resource.reload()}/>;
  const catalog=resource.data!;
  return <div className="quiz-detail space-y-6"><Link className="back-link" href="/quiz">← กลับหน้ารวมแบบทดสอบ</Link><section className="panel"><span className="category-icon"><Icon name="quiz"/></span><PageIntro eyebrow="QUIZ DETAILS" title={mode === "PRE_TEST" ? "Pre-test · ก่อนฝึก" : "Post-test · หลังฝึก"}>{mode === "PRE_TEST" ? "บันทึกผลความรู้เริ่มต้น เพื่อใช้ทบทวนหลังฝึก" : "ทบทวนความรู้หลังฝึก และเปรียบเทียบกับ Pre-test ที่เข้าเงื่อนไข"}</PageIntro><div className="stat-grid"><div className="stat-card"><p>จำนวนคำถามต่อรอบ</p><strong>{catalog.questionsPerAttempt}</strong><p>ข้อ</p></div><div className="stat-card"><p>คลังข้อสอบปัจจุบัน</p><strong>{catalog.questionCount}</strong><p>ข้อ</p></div><div className="stat-card"><p>ครอบคลุมเนื้อหา</p><strong>{catalog.categories.length}</strong><p>หมวด</p></div></div></section><section className="panel"><h2>รายละเอียดแบบทดสอบ</h2><ul className="objectives"><li>เลือกคำตอบหนึ่งข้อในแต่ละคำถาม บันทึกไว้ทำต่อได้</li><li>ส่งคำตอบครบแล้วจึงดูผล เฉลย และเหตุผลได้</li><li>หลังส่งคำตอบแล้วไม่สามารถแก้ไขรอบนั้นได้</li><li>ไม่แสดงเวลาโดยประมาณ เพราะระบบยังไม่มีค่าที่กำหนดไว้</li></ul><h3 className="mt-6">หมวดข้อสอบ</h3><ul className="quiz-categories mt-4">{catalog.categories.map(c=><li key={c.id}><span>{c.label}</span><span>{c.perAttempt} ข้อ</span></li>)}</ul></section>{start.error && <Failure error={start.error} retry={start.retryable ? ()=>void start.retry() : undefined}/>}<button className="button" disabled={start.blocked} onClick={()=>void start.run(new MutationAttempt("/api/quiz/attempts",{requestId:crypto.randomUUID(),mode}))}>{start.busy ? "กำลังเริ่ม…" : "เริ่มทำแบบทดสอบ"}<Icon name="arrow"/></button></div>;
}
