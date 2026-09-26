"use client";
import { useRef, useState } from "react";
import Link from "next/link.js";
import { useRouter } from "next/navigation.js";
import { quizAttempt, quizMutation, quizOverview } from "../public-api/quiz.js";
import type { PublicQuizAttempt } from "../public-api/quiz.js";
import { useMutation, useResource } from "./hooks.js";
import { MutationAttempt } from "./api.js";
import { Failure, Loading, Notice, PageIntro } from "./ui.js";

const modeLabel = (mode: string) => mode === "PRE_TEST" ? "Pre-test · ก่อนฝึก" : "Post-test · หลังฝึก";
const dateLabel = (at: number) => new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(at);
export function QuizHome() {
  const router = useRouter(); const resource = useResource("/api/quiz", quizOverview);
  const start = useMutation(quizMutation, reply => router.push("/quiz/" + encodeURIComponent(reply.attempt.id)));
  if (resource.loading) return <Loading />;
  if (resource.error) return <Failure error={resource.error} retry={() => void resource.reload()} />;
  const catalog = resource.data!;
  return <div className="space-y-6"><PageIntro eyebrow="QUIZ" title="ลองวัดความรู้ก่อนและหลังฝึก">
    ครั้งละ {catalog.questionsPerAttempt} ข้อ สุ่มจากคลัง {catalog.questionCount} ข้อ ครอบคลุม 7 หมวด พร้อมเฉลยและเหตุผลเมื่อส่งคำตอบครบ
  </PageIntro>
    {start.error && <Failure error={start.error} retry={start.retryable ? () => void start.retry() : undefined} />}
    <div className="quiz-mode-grid">{(["PRE_TEST", "POST_TEST"] as const).map(mode => <section className="panel" key={mode}>
      <p className="eyebrow">{mode === "PRE_TEST" ? "ก่อนเริ่มฝึก" : "หลังฝึกเสร็จ"}</p><h2 className="section-heading mt-3">{modeLabel(mode)}</h2>
      <p className="muted mt-3">{mode === "PRE_TEST" ? "เก็บผลเริ่มต้น แล้วกลับมาทำ Post-test หลังฝึกสถานการณ์" : "เปรียบเทียบกับ Pre-test ล่าสุดที่เสร็จก่อนเริ่มรอบนี้และใช้คลังรุ่นเดียวกัน"}</p>
      <button className="button mt-6" disabled={start.blocked} onClick={() => void start.run(new MutationAttempt("/api/quiz/attempts", { requestId: crypto.randomUUID(), mode }))}>{start.busy ? "กำลังเริ่ม…" : `เริ่ม ${mode === "PRE_TEST" ? "Pre-test" : "Post-test"}`}</button>
    </section>)}</div>
    <section className="panel"><h2 className="section-heading">หมวดข้อสอบในแต่ละรอบ</h2><ul className="quiz-categories mt-4">{catalog.categories.map(c => <li key={c.id}><span>{c.label}</span><span>{c.perAttempt} ข้อ</span></li>)}</ul>
      <p className="field-hint mt-4">ข้อสอบและลำดับตัวเลือกสุ่มใหม่ทุกครั้ง ผลเปรียบเทียบเป็นจำนวนข้อถูกในชุดที่สุ่มได้ ใช้ประกอบการทบทวนความรู้</p>
    </section>
    <section className="panel"><h2 className="section-heading">ประวัติ Quiz 50 รอบล่าสุด</h2>
      {!catalog.history.length ? <p className="muted mt-4">ยังไม่มีรอบ Quiz เริ่ม Pre-test เพื่อบันทึกผลแรกได้เลย</p> : <ul className="quiz-history mt-4">{catalog.history.map(a => <li key={a.id}>
        <div><strong>{modeLabel(a.mode)}</strong><p className="field-hint">{dateLabel(a.startedAt)}</p></div>
        <span>{a.result ? `${a.result.correct}/${a.result.total} ข้อ · ${a.result.percentage}%` : "กำลังทำ"}</span>
        <Link className="text-link" href={"/quiz/" + encodeURIComponent(a.id)}>{a.status === "ACTIVE" ? "ทำต่อ" : "ดูผลและเฉลย"} →</Link>
      </li>)}</ul>}
    </section>
  </div>;
}

function QuizFeedback({ attempt }: { attempt: PublicQuizAttempt }) {
  const result = attempt.result!;
  const review = result.categories.filter(c => c.correct < c.total);
  return <div className="space-y-6"><div className="result-summary"><div><p className="eyebrow">{modeLabel(attempt.mode)}</p><h1 className="section-heading mt-3">ผล Quiz ของคุณ</h1>
    <p className="muted mt-3">ตอบถูก {result.correct} จาก {result.total} ข้อ · {dateLabel(result.completedAt)}</p></div>
    <div className="total-score"><strong>{result.percentage}%</strong><span>สัดส่วนข้อที่ตอบถูก</span></div></div>
    {attempt.mode === "POST_TEST" && <section className="panel"><h2 className="section-heading">เทียบกับก่อนฝึก</h2>
      {result.baseline ? <><p className="mt-3">Pre-test {result.baseline.score.percentage}% → Post-test {result.percentage}%</p>
        <p className="mt-3">{result.changePercentagePoints === 0 ? "สัดส่วนข้อถูกเท่าเดิม" : `${result.changePercentagePoints! > 0 ? "เพิ่มขึ้น" : "ลดลง"} ${Math.abs(result.changePercentagePoints!)} จุดเปอร์เซ็นต์`}</p>
        <Link className="text-link mt-3" href={"/quiz/" + result.baseline.attemptId}>ดู Pre-test ที่ใช้เปรียบเทียบ →</Link>
        <p className="field-hint mt-3">เปรียบเทียบชุดที่สุ่มต่างกันจากคลังรุ่นเดียวกันและจำนวนข้อแต่ละหมวดเท่ากัน ความแตกต่างอาจมาจากข้อที่สุ่มได้ด้วย</p></>
        : <p className="muted mt-3">ไม่มี Pre-test ที่เสร็จก่อนเริ่มรอบนี้จากคลังรุ่นเดียวกัน จึงแสดงผลรอบนี้อย่างเดียว</p>}
    </section>}
    <section className="panel"><h2 className="section-heading">ข้อถูกแยกตามหมวด</h2><ul className="quiz-categories mt-4">{result.categories.map(c => <li key={c.id}><span>{c.label}</span><span>{c.correct}/{c.total}</span></li>)}</ul>
      <p className="muted mt-4">{review.length ? `หัวข้อที่ควรทบทวนจากรอบนี้: ${review.map(c => c.label).join(" · ")}` : "ตอบถูกครบทุกข้อในชุดนี้ ลองนำแนวทางตรวจสอบไปใช้ในการฝึกสถานการณ์ต่อ"}</p>
    </section>
    <section><h2 className="section-heading mb-4">เฉลยและเหตุผลทั้ง 20 ข้อ</h2><div className="space-y-4">{attempt.questions.map((q,i) => <article className="panel" key={q.id}>
      <p className="eyebrow">ข้อ {i+1} · {q.categoryLabel} · {q.review!.correct ? "ตอบถูก" : "ควรทบทวน"}</p><h3 className="quiz-prompt mt-3">{q.prompt}</h3>
      <p className="mt-4">คำตอบของคุณ: {q.options.find(o => o.id === q.review!.selectedOptionId)?.label ?? "ไม่ได้ตอบ"}</p>
      {!q.review!.correct && <p className="mt-3">คำตอบที่ถูก: {q.options.find(o => o.id === q.review!.correctOptionId)!.label}</p>}
      <p className="muted mt-3">{q.review!.explanation}</p><a className="text-link mt-3" href={q.review!.source.url} target="_blank" rel="noopener noreferrer">อ่านแนวทางเพิ่มเติม: {q.review!.source.title} ↗</a>
    </article>)}</div></section>
    <div className="flex flex-wrap gap-3"><Link className="button" href="/quiz">กลับไปหน้า Quiz</Link><Link className="button button-secondary" href="/scenarios">ฝึกสถานการณ์</Link></div>
  </div>;
}
export function QuizRound({ attemptId }: { attemptId: string }) {
  const path = "/api/quiz/attempts/" + encodeURIComponent(attemptId);
  const resource = useResource(path, quizAttempt);
  const [index, setIndex] = useState(0);
  const [localDraft, setLocalDraft] = useState<{ attemptId: string; answers: Record<string,string> } | null>(null);
  const nextIndex = useRef<number | null>(null);
  const mutation = useMutation(quizMutation, reply => {
    resource.setData(reply.attempt); setLocalDraft({ attemptId: reply.attempt.id, answers: reply.attempt.answers });
    if (nextIndex.current !== null) { setIndex(nextIndex.current); nextIndex.current = null; }
  }, async () => { nextIndex.current = null; await resource.reload(); setLocalDraft(null); });
  if (resource.loading) return <Loading />;
  if (resource.error) return <Failure error={resource.error} retry={() => void resource.reload()} />;
  const attempt = resource.data!;
  if (attempt.status === "COMPLETED") return <QuizFeedback attempt={attempt} />;
  // Read saved answers directly until the learner edits; no delayed initialization can overwrite a first click.
  const draft = localDraft?.attemptId === attemptId ? localDraft.answers : attempt.answers;
  const current = attempt.questions[index]!; const count = attempt.questions.filter(q => draft[q.id]).length;
  const saved = attempt.questions.every(q => draft[q.id] === attempt.answers[q.id]);
  function write(kind: "save" | "submit", goTo: number | null = null) {
    nextIndex.current = goTo;
    void mutation.run(new MutationAttempt(path + "/" + kind, { requestId: crypto.randomUUID(), expectedRevision: attempt.revision,
      answers: Object.entries(draft).map(([questionId, optionId]) => ({ questionId, optionId })) }));
  }
  return <div className="quiz-round space-y-6"><div className="training-heading"><div><p className="eyebrow">{modeLabel(attempt.mode)}</p><h1 className="mt-2">Quiz รู้ทันการหลอกลวง</h1></div><Link className="text-link" href="/quiz">ประวัติ Quiz</Link></div>
    <div><p className="muted mb-3">ตอบแล้ว {count}/20 ข้อ · <span role="status">{saved ? "คำตอบที่เลือกบันทึกแล้ว" : "มีคำตอบที่ยังไม่ได้บันทึก"}</span></p><progress aria-label="จำนวนข้อที่ตอบแล้ว" value={count} max={20} /></div>
    {mutation.error && <Failure error={mutation.error} retry={mutation.retryable ? () => void mutation.retry() : undefined} />}
    <nav className="quiz-question-nav" aria-label="เลือกข้อสอบ">{attempt.questions.map((q,i) => <button key={q.id} disabled={mutation.blocked} className={"quiz-number" + (draft[q.id] ? " answered" : "")}
      aria-current={index === i ? "step" : undefined} aria-label={`ไปข้อ ${i+1}${draft[q.id] ? " ตอบแล้ว" : " ยังไม่ตอบ"}`} onClick={() => setIndex(i)}>{i+1}</button>)}</nav>
    <section className="panel"><p className="eyebrow">ข้อ {index+1}/20 · {current.categoryLabel}</p><fieldset disabled={mutation.blocked} className="action-card mt-4">
      <legend className="quiz-prompt">{current.prompt}</legend><div className="space-y-3 mt-5">{current.options.map(o => <label className="action-option" key={o.id}>
        <input type="radio" name={current.id} value={o.id} checked={draft[current.id] === o.id} onChange={() => setLocalDraft(previous => ({ attemptId, answers: { ...(previous?.attemptId === attemptId ? previous.answers : attempt.answers), [current.id]: o.id } }))} /><span>{o.label}</span>
      </label>)}</div></fieldset>
      <div className="flex flex-wrap gap-3 mt-6"><button className="button button-secondary" disabled={index === 0 || mutation.blocked} onClick={() => setIndex(index-1)}>ข้อก่อนหน้า</button>
        <button className="button" disabled={!draft[current.id] || mutation.blocked} onClick={() => write("save", Math.min(19,index+1))}>{mutation.busy ? "กำลังบันทึก…" : index === 19 ? "บันทึกคำตอบ" : "บันทึกและไปข้อต่อไป"}</button></div>
    </section>
    <div className="panel"><h2 className="section-heading">ส่งคำตอบเมื่อพร้อม</h2><p className="muted mt-3">บันทึกไว้เพื่อกลับมาทำต่อได้ เมื่อส่งครบ 20 ข้อแล้วจะแก้คำตอบไม่ได้ และระบบจะแสดงผลพร้อมเฉลย</p>
      {!saved && <Notice>กดบันทึกก่อนออกจากหน้า เพื่อเก็บคำตอบที่เพิ่งเลือก</Notice>}
      <div className="flex flex-wrap gap-3 mt-4"><button className="button button-secondary" disabled={mutation.blocked || saved} onClick={() => write("save")}>บันทึกไว้ทำต่อ</button>
        <button className="button" disabled={count !== 20 || mutation.blocked} onClick={() => write("submit")}>{mutation.busy ? "กำลังดำเนินการ…" : "ส่งคำตอบและดูผล"}</button></div>
    </div>
  </div>;
}
