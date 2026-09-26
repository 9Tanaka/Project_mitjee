"use client";
import { z } from "zod";
import { useRouter } from "next/navigation.js";
import { scenarioDto, mutationDto } from "../public-api/contracts.js";
import { useMutation, useResource } from "./hooks.js";
import { MutationAttempt } from "./api.js";
import { Failure, Loading, Shield } from "./ui.js";

const catalogSchema = z.array(scenarioDto);
export function ScenarioList() {
  const router = useRouter();
  const resource = useResource("/api/scenarios", catalogSchema);
  const start = useMutation(mutationDto, reply => router.push("/training/" + encodeURIComponent(reply.session.sessionId)));
  if (resource.loading) return <Loading />;
  if (resource.error) return <Failure error={resource.error} retry={() => void resource.reload()} />;
  return <div className="space-y-6">
    {start.error && <Failure error={start.error} retry={start.retryable ? () => void start.retry() : undefined} />}
    {!resource.data?.length ? <div className="panel empty-state"><h2>ยังไม่มีสถานการณ์ที่เปิดให้ฝึก</h2><p className="muted">กรุณากลับมาตรวจสอบภายหลัง</p></div> :
      <div className="scenario-grid">{resource.data.map(scenario => <article key={scenario.id} className="scenario-card">
        <div className="scenario-visual" aria-hidden="true"><div className="visual-grid" /><div className="message-symbol"><span className="message-dots">•••</span><span className="mini-shield"><Shield /></span></div><span className="visual-caption">หยุดคิด · ตรวจสอบ · ตัดสินใจ</span></div>
        <div className="scenario-content"><div className="flex flex-wrap gap-2"><span className="tag">ฝึกผ่านข้อความ</span><span className="tag tag-neutral">{scenario.category}</span></div>
          <h2>{scenario.title}</h2><p className="muted">{scenario.description}</p>
          <h3 className="mt-6 text-sm font-semibold">สิ่งที่จะได้ฝึก</h3>
          <ul className="objectives">{scenario.learningObjectives.map((objective, i) => <li key={i}><span aria-hidden="true">✓</span>{objective}</li>)}</ul>
          <button className="button mt-7 w-full" disabled={start.blocked} onClick={() => void start.run(new MutationAttempt("/api/scenarios/" + encodeURIComponent(scenario.id) + "/start", { startId: crypto.randomUUID(), expectedRevision: 0 }))}>{start.busy ? "กำลังเริ่มรอบฝึก…" : "เริ่มฝึกสถานการณ์"}<span aria-hidden="true">→</span></button>
        </div>
      </article>)}</div>}
    <p className="muted text-sm">สถานการณ์ทั้งเก้าประเภทเล่นผ่านข้อความจำลองได้ ระบบเสียง Call Center ยังอยู่ระหว่างพัฒนา</p>
  </div>;
}
