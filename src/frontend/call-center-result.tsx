"use client";
import Link from "next/link.js";
import type { z } from "zod";
import type { resultDto } from "../public-api/contracts.js";
import { PageIntro } from "./ui.js";
type ResultView = z.infer<typeof resultDto>;
type GuidanceView = NonNullable<ResultView["postDecisionGuidance"]>;

const assessments = { SAFE: "ปลอดภัย", REVIEW: "ควรทบทวน", UNASSESSED: "ยังประเมินไม่ได้", CRITICAL: "ความเสี่ยงสำคัญ" };
const outcomes = {
  PASSED: { title: "ผ่านการฝึก", explanation: "คุณผ่านเส้นทางที่พบในรอบนี้ ทบทวนสิ่งที่ทำได้ดีและแนวทางตรวจสอบสำหรับครั้งต่อไป", tone: "passed" },
  NEEDS_PRACTICE: { title: "ควรฝึกเพิ่มเติม", explanation: "เริ่มทบทวนจุดที่ระบุว่าควรทบทวน และเปรียบเทียบกับทางเลือกที่ปลอดภัยกว่า", tone: "review" },
  CRITICAL_FAILURE: { title: "พบการกระทำที่มีความเสี่ยงสำคัญ", explanation: "รอบฝึกจบจากการยืนยันการกระทำจำลองที่แสดงด้านล่าง คุณสามารถเรียนรู้และลองฝึกใหม่ได้", tone: "review" },
  UNASSESSED: { title: "ยังประเมินไม่ได้", explanation: "รอบนี้จบก่อนมีการตัดสินใจที่เพียงพอสำหรับประเมินเส้นทาง จึงยังสรุปผลการรับมือไม่ได้", tone: "review" },
  NOT_PASSED: { title: "ยังไม่ผ่านเกณฑ์", explanation: "ทบทวนการตัดสินใจที่ปรากฏในผล แล้วลองฝึกอีกครั้งได้", tone: "review" },
};
function TextList({ items }: { items: string[] }) {
  return <ul className="list-disc space-y-2 pl-5">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
}

/** Render only the safe public projection; no templates, trigger rules or text interpretation. */
export function CallCenterResult({ result, guidance }: { result: ResultView; guidance: GuidanceView }) {
  const outcome = outcomes[result.outcome];
  const summary = result.decisionSummary;
  return <div className="min-w-0 space-y-7 break-words">
    <PageIntro eyebrow="TRAINING REFLECTION" title="ผลการฝึกของคุณ">ทบทวนการตัดสินใจและแนวทางรับมือจากสายที่คุณพบจริง</PageIntro>
    <section className={"result-summary result-" + outcome.tone} aria-label="ผลการฝึก">
      <div><p className="eyebrow">ผลประเมินจากระบบ</p><h2>{outcome.title}</h2><p className="mt-3 max-w-xl">{outcome.explanation}</p></div>
      <div className="total-score"><p>จุดตัดสินใจที่ประเมินได้</p><strong>{(summary?.safe ?? 0) + (summary?.review ?? 0)}</strong><span>จากเส้นทางที่พบจริง</span></div>
    </section>

    <section className="panel space-y-5" aria-labelledby="call-decisions-title">
      <div><h2 id="call-decisions-title" className="section-heading">การตัดสินใจในเส้นทางนี้</h2>
        <p className="muted mt-2">ปลอดภัย {summary?.safe ?? 0} · ควรทบทวน {summary?.review ?? 0} · ยังประเมินไม่ได้ {summary?.unassessed ?? 0}{(summary?.critical ?? 0) > 0 ? ` · ความเสี่ยงสำคัญ ${summary?.critical}` : ""}</p>
        <p className="field-hint mt-2">การผ่านเส้นทางนี้ไม่ได้หมายถึงเชี่ยวชาญทุกประเภทของการหลอกลวง</p></div>
      {guidance.checkpoints.length ? <ol className="space-y-5">{guidance.checkpoints.map(item => <li key={item.ruleRef} className={"border-t pt-5 assessment-" + item.assessment}>
        <h3 className="font-semibold">{item.label} · {assessments[item.assessment]}</h3>
        <p className="mt-2"><span className="font-semibold">สิ่งที่คุณเลือก: </span>{item.selectedAction ?? "ยังไม่มีการยืนยันการเลือกที่จุดนี้"}</p>
        <p className="muted mt-2">{item.explanation}</p>
        <p className="mt-2"><span className="font-semibold">แนวทางสำหรับครั้งต่อไป: </span>{item.saferAlternative}</p>
      </li>)}</ol> : <p className="muted">ยังไม่มีจุดตัดสินใจที่ประเมินได้ในเส้นทางนี้</p>}
    </section>

    <section id="call-tutorial" tabIndex={-1} className="panel space-y-6" aria-labelledby="call-tutorial-title">
      <div><h2 id="call-tutorial-title" className="section-heading">บทเรียนจากสถานการณ์</h2><p className="muted mt-2">สิ่งที่ปรากฏในสายนี้</p></div>
      {guidance.tutorial.length ? guidance.tutorial.map(block => <article key={block.ref} className="space-y-3 border-t pt-5">
        <h3 className="font-semibold">{block.title}</h3><p>{block.explanation}</p>
        <div><h4 className="font-semibold mb-2">สิ่งที่ควรตรวจอย่างอิสระ</h4><TextList items={block.independentVerification} /></div>
        <div className="muted"><h4 className="font-semibold mb-2">ข้อที่ควรระวังในการตัดสินใจ</h4><TextList items={block.commonMistakes} /></div>
      </article>) : <p className="muted">รอบนี้จบก่อนมีข้อมูลจากจุดสำคัญเพียงพอสำหรับแสดงบทเรียนเฉพาะเส้นทาง</p>}
    </section>

    {guidance.recovery.length > 0 ? <section className="panel space-y-6" aria-labelledby="call-recovery-title">
      <h2 id="call-recovery-title" className="section-heading">ถ้าเหตุการณ์ลักษณะนี้เกิดขึ้นจริง</h2>
      <p className="muted">ด้านล่างเป็นแนวทางสำหรับเหตุการณ์จริงที่มีลักษณะเดียวกับการกระทำจำลอง แบบฝึกนี้ไม่ได้ทำธุรกรรมหรือเปิดเผยข้อมูลจริงแทนคุณ</p>
      {guidance.recovery.map(guide => <article className="space-y-5" key={guide.incidentType}>
        <h3 className="font-semibold">การกระทำจำลองที่ยืนยัน: {guide.confirmedAction}</h3>
        <div><h4 className="font-semibold mb-2">สิ่งที่ควรทำทันที</h4><TextList items={guide.immediateActions} /></div>
        <div><h4 className="font-semibold mb-2">หลักฐานที่ควรเก็บ</h4><TextList items={guide.evidenceToPreserve} /></div>
        <div><h4 className="font-semibold mb-2">การตรวจสอบและดูแลบัญชี</h4><TextList items={guide.accountRecoverySteps} /></div>
        <div><h4 className="font-semibold mb-2">ช่องทางช่วยเหลือทางการ</h4><ul className="space-y-2">{guide.officialHelp.map(help => <li key={help.category}><a className="text-link" href={help.url} target="_blank" rel="noopener noreferrer">{help.label} <span className="sr-only">(เปิดแท็บใหม่)</span></a></li>)}</ul></div>
        <p>{guide.retryRecommendation}</p>
        <details className="field-hint"><summary>แหล่งข้อมูลและวันที่ทบทวน</summary><ul className="mt-2 space-y-2">{guide.sources.map(source => <li key={source.url}><a className="text-link" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<span className="sr-only"> (เปิดแท็บใหม่)</span></a> · ทบทวน <time dateTime={source.reviewedAt}>{source.reviewedAt}</time></li>)}</ul></details>
      </article>)}
    </section> : null}

    <section className="panel space-y-4" aria-labelledby="call-next-title">
      <h2 id="call-next-title" className="section-heading">ครั้งหน้าควรทำอย่างไร</h2>
      <TextList items={guidance.nextTimePrevention} />
      <p className="muted">{result.recommendation.reason}</p>
      {result.callReflection ? <details className="field-hint"><summary>ลำดับการกระทำที่บันทึกไว้</summary><p className="mt-2">{result.callReflection.note}</p>
        <ol className="mt-2 space-y-2">{result.callReflection.behaviorTimeline.map((item, index) => <li key={index}><time>{String(Math.floor(item.elapsedSeconds / 60)).padStart(2, "0")}:{String(item.elapsedSeconds % 60).padStart(2, "0")}</time> · {item.label}</li>)}</ol>
      </details> : null}
    </section>
    <nav className="flex flex-wrap gap-3" aria-label="ขั้นตอนหลังฝึก">
      <Link className="button" href="/scenarios/call-center/prepare">ลองฝึก Call Center อีกครั้ง</Link>
      <Link className="button button-secondary" href="#call-tutorial" scroll={false}
        onClick={() => document.getElementById("call-tutorial")?.focus()}>ทบทวนบทเรียน</Link>
      <Link className="button button-secondary" href="/scenarios">กลับหน้าเลือกสถานการณ์</Link>
    </nav>
  </div>;
}
