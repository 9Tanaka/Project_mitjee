"use client";
import Link from "next/link.js";
import { resultDto } from "../public-api/contracts.js";
import { useResource } from "./hooks.js";
import { Failure, Loading, Notice, PageIntro } from "./ui.js";

const skills = { D: "การตัดสินใจ", W: "การสังเกตสัญญาณเตือน", S: "การตอบสนองอย่างปลอดภัย" };
const outcomes = {
  PASSED: { title: "ผ่านการฝึก", description: "คุณผ่านเกณฑ์ในรอบฝึกนี้ ลองทบทวนทักษะที่ยังพัฒนาได้เพื่อรับมืออย่างมั่นใจยิ่งขึ้น", tone: "passed" },
  NOT_PASSED: { title: "ยังไม่ผ่านเกณฑ์", description: "การฝึกเป็นพื้นที่สำหรับเรียนรู้ ทบทวนผลด้านล่างแล้วลองฝึกอีกครั้งได้", tone: "review" },
  CRITICAL_FAILURE: { title: "พบการกระทำที่มีความเสี่ยงสำคัญ", description: "ระบบจบรอบฝึกจากการกระทำจำลองที่มีความเสี่ยงสำคัญ ใช้ผลครั้งนี้เพื่อทบทวนการรับมืออย่างปลอดภัย", tone: "review" },
  NEEDS_PRACTICE: { title: "ควรฝึกเพิ่มเติม", description: "มีการตัดสินใจในเส้นทางที่พบซึ่งควรทบทวน ลองดูคำแนะนำแล้วฝึกใหม่", tone: "review" },
  UNASSESSED: { title: "ยังประเมินไม่ได้", description: "ยังมีการตัดสินใจที่ต้องยืนยันก่อนสรุปผลเส้นทางนี้", tone: "review" },
};
const recommendations = {
  DECISION_PRACTICE: "ฝึกการตัดสินใจ", WARNING_SIGN_LESSON: "ทบทวนสัญญาณเตือน",
  WARNING_SIGN_QUIZ: "ทบทวนการสังเกตสัญญาณเตือน", SAFE_ACTION_CONTENT: "ทบทวนการตอบสนองอย่างปลอดภัย",
  CRITICAL_FAILURE_REVIEW: "ทบทวนการกระทำที่มีความเสี่ยง",
  PATH_REFLECTION: "ทบทวนเส้นทางที่พบ",
};
const assessments = { SAFE: "ปลอดภัย", REVIEW: "ควรทบทวน", UNASSESSED: "ยังประเมินไม่ได้", CRITICAL: "ความเสี่ยงสำคัญ" };
export function Result({ sessionId }: { sessionId: string }) {
  const resource = useResource("/api/training/" + encodeURIComponent(sessionId) + "/result", resultDto);
  if (resource.loading) return <Loading text="กำลังโหลดผลการฝึก…" />;
  if (resource.error) return <div className="space-y-5"><Failure error={resource.error} retry={() => void resource.reload()} />{resource.error.code === "RESULT_NOT_FOUND" && <Link className="text-link" href={"/training/" + encodeURIComponent(sessionId)}>กลับไปดูรอบฝึก →</Link>}</div>;
  const result = resource.data; if (!result) return <Notice>ยังไม่มีผลการฝึก</Notice>;
  const outcome = outcomes[result.outcome];
  const decisionRules = result.evaluationMode === "DECISION_RULES_V1";
  return <div className="space-y-7">
    <PageIntro eyebrow="TRAINING REFLECTION" title="ผลการฝึกของคุณ">เรียนรู้จากการตัดสินใจ เพื่อรับมืออย่างปลอดภัยในครั้งต่อไป</PageIntro>
    <section className={"result-summary result-" + outcome.tone}><div><p className="eyebrow">ผลประเมินจากระบบ</p><h2>{outcome.title}</h2><p className="mt-3 max-w-xl">{decisionRules && result.outcome === "PASSED" ? "คุณผ่านเส้นทางที่พบในรอบนี้ ลองฝึกเส้นทางอื่นเพื่อเรียนรู้เพิ่มเติม" : outcome.description}</p></div>{decisionRules ? <div className="total-score"><p>จุดตัดสินใจที่ประเมินได้</p><strong>{(result.decisionSummary?.safe ?? 0) + (result.decisionSummary?.review ?? 0)}</strong><span>จากเส้นทางที่พบจริง</span></div> : <div className="total-score"><p>คะแนนรวมตามเกณฑ์เดิม</p><strong>{result.trainingScore === null ? "—" : result.trainingScore.toLocaleString("th-TH", { maximumFractionDigits: 2 })}</strong><span>{result.trainingScore === null ? "ยังไม่มีคะแนนรวม" : "จาก 100 คะแนน"}</span></div>}</section>
    {decisionRules ? <section aria-labelledby="decision-title"><h2 id="decision-title" className="section-heading mb-4">การตัดสินใจในเส้นทางนี้</h2><p className="muted">ปลอดภัย {result.decisionSummary?.safe ?? 0} · ควรทบทวน {result.decisionSummary?.review ?? 0} · ยังประเมินไม่ได้ {result.decisionSummary?.unassessed ?? 0}{(result.decisionSummary?.critical ?? 0) > 0 ? ` · ความเสี่ยงสำคัญ ${result.decisionSummary?.critical}` : ""}</p><p className="field-hint mt-2">การผ่านเส้นทางนี้ไม่ได้หมายถึงเชี่ยวชาญทุกประเภทของการหลอกลวง</p></section> : <section aria-labelledby="skill-title"><h2 id="skill-title" className="section-heading mb-4">ทักษะในรอบนี้</h2><div className="score-grid">{(["D", "W", "S"] as const).map(skill => <article key={skill} className="score-card"><span className="skill-letter">{skill}</span><h3>{skills[skill]}</h3><p className="skill-score">{result[skill] === null ? "—" : result[skill].toLocaleString("th-TH", { maximumFractionDigits: 2 })}<span>{result[skill] === null ? "ยังไม่มีคะแนน" : "/ 100"}</span></p>{result[skill] !== null && <progress value={result[skill]} max={100} aria-label={skills[skill]} />}</article>)}</div></section>}
    {decisionRules && !!result.decisionSummary?.checkpoints?.length && <section aria-labelledby="checkpoint-title"><h2 id="checkpoint-title" className="section-heading mb-4">เหตุผลของแต่ละจุดที่พบ</h2><ol className="space-y-3">{result.decisionSummary.checkpoints.map((item, index) => <li className="panel" key={item.ruleRef + index}><h3 className="font-semibold">{item.label} · {assessments[item.assessment]}</h3><p className="mt-2 muted">{item.explanation}</p><details className="field-hint mt-3"><summary>รหัสอ้างอิงกฎที่ใช้</summary><p>{item.ruleRef}</p></details></li>)}</ol></section>}
    <section className="panel recommendation"><p className="eyebrow">ก้าวต่อไปของคุณ</p><h2>คำแนะนำสำหรับการฝึกครั้งถัดไป</h2><p className="mt-4 font-semibold">{recommendations[result.recommendation.recommendationType]}</p><p className="mt-2 muted">{result.recommendation.reason}</p>
      {result.weakestSkills.length > 0 && <p className="mt-4 text-sm">ทักษะที่ระบบแนะนำให้พัฒนา: {result.weakestSkills.map(skill => skills[skill]).join(" · ")}</p>}
      <details className="field-hint mt-4"><summary>รหัสอ้างอิงคำแนะนำ</summary><p>{result.recommendation.recommendationKey}</p></details>
      <p className="field-hint mt-4">ขณะนี้แสดงคำแนะนำจากผลฝึกเท่านั้น บทเรียนและแบบทดสอบเพิ่มเติมยังไม่เปิดใช้งาน</p></section>
    <Link className="button" href="/scenarios">กลับไปเลือกสถานการณ์ <span aria-hidden="true">→</span></Link>
  </div>;
}
