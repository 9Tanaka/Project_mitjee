# Demo Assumptions

STATUS: MVP DECISIONS — NOT PROPOSAL REQUIREMENTS

[กลับ README](../README.md) · [Reference policy](architecture.md#reference-policy)

รายการนี้รวบรวมรายละเอียดที่ผู้ใช้อนุมัติเพิ่มสำหรับ MVP และ implementation choices
แยกสถานะการทำแล้วออกจาก target/planned; ไม่เพิ่ม feature หรือเปลี่ยนกฎใน documentation phase
น้ำหนัก D/W/S = 50/30/20, เกณฑ์ >=70 และ Critical Failure override ไม่ใช่รายการ assumption
เพราะตรวจพบใน Proposal v4 ดู [Scoring](scoring.md)

## Scenario and scoring decisions

| Assumption / technical choice | ค่า / ขอบเขต | Status / evidence |
|---|---|---|
| Demo State enum names | contact, build_trust, create_pressure, request_action, user_verification, end_scenario | Implemented; [หมายเหตุ attribution](state-machine.md#demo-state-model) |
| First fixture | SMS / Phishing มี 3 D checkpoints; จำนวนเป็นของ Template ไม่ fix ทั้งระบบ | Implemented, [fixture](../src/fixtures/sms-phishing.ts) |
| D checkpoint rubric | maxScore=10; safe=10, partially_safe=5, risky=0 | Implemented, [schema](../src/domain/schema.ts) |
| S fixture rubric | เต็ม 10, ตัวเลือก 10/5/0; S schema รับ rubric ตาม Template | Implemented |
| Warning evidence/choices/content | ข้อมูลคงที่และสมมติทั้งหมด รวม optional w-extra | Implemented |
| Eligible opportunity | เปิดด้วย STATE_ENTRY เท่านั้น; ไม่อนุมาน exposure จาก AI | Implemented |
| Empty denominator | normalized=null; ทุก Official Safe Resolution path ต้องมี D/W/S ครบ | Implemented |
| Warning finalize | ครั้งเดียว เก็บ correctWarningSignIds / incorrectEvidenceIds | Implemented |
| Warning false-positive penalty | ไม่มีสูตรหักคะแนน; เลือกทุกหลักฐานอาจได้ W เต็ม | Intentionally not implemented; ห้ามเพิ่มเอง |
| Explicit critical action | FREE_TEXT/candidate ไม่มีอำนาจ; Backend ตรวจ SIMULATED_ACTION confirmation | Implemented |
| Event Code names | reusable domain registry + State allowed events | Implemented; SMS ใช้ Critical Rules สองรายการ |
| Acyclic progression | ไม่มี cycle ใน Template graph; ยังสนทนาซ้ำใน State เดิมได้ | Implemented |
| Weakest skill tie | เก็บ array, recommendation เดียวใช้ D → W → S; tolerance <1e-10 | Implemented, [Scoring Engine](../src/domain/scoring.ts) |
| Recommendation scope | คืน type/key/reason เท่านั้น ไม่ทำ Quiz/Knowledge Base เต็ม | Metadata implemented; content Planned |

ชื่อ State จัดประเภทเป็น Demo Assumption ตามคำสั่งผู้ใช้
แต่ reference v4 ที่ตรวจใน 5.3.4 มีรายชื่อเดียวกัน จึงมี unresolved source-attribution discrepancy
ไม่กล่าวอ้างว่าไฟล์ไม่มีชื่อเหล่านี้ และไม่แก้ Proposal เพื่อให้ตรงกับการจัดประเภท

## Lifecycle and dialogue decisions

| Assumption / technical choice | ค่า / ขอบเขต | Status / evidence |
|---|---|---|
| Idle timeout | 30 นาที ตรวจเมื่อ resume/submit ไม่มี background timer | Implemented |
| Session completion | Safe resolution → calculate result; Critical → fail; quit → ABANDONED; idle → EXPIRED | Implemented |
| Resume | ACTIVE อ่าน State/history เดิม ไม่รีเซ็ต idle | Implemented ใน library; UI refresh Planned |
| Provider timeout | default 20 วินาทีต่อ attempt; constructor inject ค่าอื่นเพื่อ test ได้ | Implemented |
| Retry | retry once; รวมสอง attempts ยกเว้น SAFETY_BLOCKED ไม่ retry | Implemented |
| Cancellation | AbortSignal ต่อ attempt และ requestId=sessionId:turnId:attempt | Implemented; real network forwarding Planned |
| Recent context | ล่าสุด 12 messages; ข้อความเก่าตัดที่ 2,000 code units | Implemented |
| Current text / response | สูงสุด 8,000 code units; Dialogue ต้องไม่ว่างหลัง trim/sanitize | Implemented |
| Mock echo | อ้างข้อความปัจจุบันสูงสุด 160 code units | Implemented; เป็น mock behavior ไม่ใช่ semantic model |
| Role length | characterRole สูงสุด 1,000 code units | Implemented schema |
| IDs / selections | Template IDs สูงสุด 120 พร้อม allowlist; turnId สูงสุด 100; warning selection สูงสุด 100 IDs | Implemented schema ไม่ใช่ Proposal numbers |
| Numeric confidence | finite number หรือ null; ไม่ fix 0–1 และไม่ใช้ threshold เพื่อยอมรับ Event | Implemented |
| Fault behavior | refusal/error/invalid/timeout/fallback ใช้ mock ไม่มี network | Implemented |

ความยาวข้างต้นเป็น JavaScript string/code-unit limits ไม่ใช่จำนวนคำ ตัวอักษรที่ผู้ใช้มองเห็น หรือ tokens
FREE_TEXT เข้า Core ตรงต่างจาก Dialogue: ไม่เก็บ text และไม่ใช้ข้อความเป็น fingerprint
ดู [AI Integration](ai-integration.md) สำหรับ contract ที่ใช้งานจริง

## Planned assumptions and unverified targets

| Assumption / target | ค่า | Status |
|---|---|---|
| Call Center variants | NORMAL_CALL / SCAM_CALL; seeded selection 50/50 | Variant schema implemented; selection และ playable fixture Planned |
| Non-AI backend response target | <1 วินาที | Target เท่านั้น ยังไม่มี benchmark รับรอง |
| AI interaction target | <10 วินาทีใน test environment | Target เท่านั้น; Mock ไม่พิสูจน์ live latency |
| Concurrent demo | 20 active sessions | Functional isolation test มีแล้ว; ไม่ใช่ production/load benchmark |
| Demo retention | DEMO_DATA_RETENTION_DAYS=30 แบบ configurable | Planned; ไม่มีการอ่านค่านี้หรือ cleanup job ใน code ปัจจุบัน |
| Live AI | เปลี่ยน provider ผ่าน port ในอนาคต | Planned; ยังไม่มี OpenAI adapter |

## Implemented platform choices

- Node.js 24 เป็น tested development environment ไม่ใช่ Proposal Requirement
- ใช้ versions/overrides ที่ล็อกใน [package.json](../package.json) และ package-lock.json
  ไม่เพิ่มหรืออัปเกรด dependency ใน documentation phase นี้
- Async TrainingRepository port, detached snapshots, CAS และ append-only history เป็น technical design
- Prisma configuration อยู่ใน JSON version พร้อม SQL triggers; MySQL 8+ ใช้ utf8mb4_0900_bin
- MySQL 8.4.11 เป็น version ที่เคยทดสอบ ไม่ใช่ version ที่ Proposal บังคับ
- Prisma connectionLimit=8, UTC mapping, save timeout 10 วินาที และ isolation levels เป็น adapter choices
- Local sanitizer เป็น demonstration control ไม่ใช่ production PII detector

รายละเอียด implementation อยู่ใน [Persistence](persistence.md) และ [Security](security.md)
HTTP API, Authentication, Frontend, Voice และ WebSocket ยัง Planned ทั้งหมด
