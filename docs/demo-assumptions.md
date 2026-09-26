# Demo Assumptions

STATUS: MVP DECISIONS — NOT PROPOSAL REQUIREMENTS

[กลับ README](../README.md) · [Reference policy](architecture.md#reference-policy)

รายการนี้รวบรวมรายละเอียดที่ผู้ใช้อนุมัติเพิ่มสำหรับ MVP และ implementation choices
แยกสถานะการทำแล้วออกจาก target/planned; ไม่เพิ่ม feature หรือเปลี่ยนกฎใน documentation phase
น้ำหนัก D/W/S = 50/30/20 และเกณฑ์ >=70 ใช้กับผลเดิมของ template รุ่น 1–2 เท่านั้น; รุ่นใหม่ใช้ [Decision Evaluation](decision-evaluation.md) ตามข้อกำหนดที่อนุมัติภายหลัง
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
| Resume | ACTIVE อ่าน State/history เดิม ไม่รีเซ็ต idle | Implemented ใน library และ Frontend refresh ผ่าน API |
| Provider timeout | default 20 วินาทีต่อ attempt; constructor inject ค่าอื่นเพื่อ test ได้ | Implemented |
| Retry | retry once; รวมสอง attempts ยกเว้น SAFETY_BLOCKED ไม่ retry | Implemented |
| Cancellation | AbortSignal ต่อ attempt และ internal requestId=sessionId:turnId:attempt | Implemented; SDK signal forwarding + opaque HMAC correlation; real network NOT VERIFIED |
| Recent context | ล่าสุด 12 messages; ข้อความเก่าตัดที่ 2,000 code units | Implemented |
| Current text / response | สูงสุด 8,000 code units; Dialogue ต้องไม่ว่างหลัง trim/sanitize | Implemented |
| Mock echo | อ้างข้อความปัจจุบันสูงสุด 160 code units | Implemented; เป็น mock behavior ไม่ใช่ semantic model |
| Role length | characterRole สูงสุด 1,000 code units | Implemented schema |
| IDs / selections | Template IDs สูงสุด 120 พร้อม allowlist; turnId สูงสุด 100; warning selection สูงสุด 100 IDs | Implemented schema ไม่ใช่ Proposal numbers |
| Numeric confidence | finite number หรือ null; ไม่ fix 0–1 และไม่ใช้ threshold เพื่อยอมรับ Event | Implemented |
| Fault behavior | refusal/error/invalid/timeout/fallback ใช้ mock/fake Responses client | Implemented; real network NOT VERIFIED |

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
| Live network verification | Proposal model ผ่าน Responses API | Adapter implemented; network NOT RUN (ไม่มี private key) |

## Implemented platform choices

- Node.js 24 เป็น tested development environment ไม่ใช่ Proposal Requirement
- ใช้ versions/overrides ที่ล็อกใน [package.json](../package.json) และ package-lock.json
  bcrypt ถูกเพิ่มใน Phase บัญชี; OpenAI SDK 7.21.0 ใน Phase Live Provider; framework versions คงเดิม
- OpenAI adapter: explicit AI_PROVIDER, required private key/model, fixed official endpoint,
  store=false, non-streaming, max_output_tokens=1200; SDK retry=0 และ timeout 20 วินาที
  ตัวเลข token cap เป็น technical choice ยังไม่ verify กับ real model; ไม่ใช่ Proposal Requirement
- Adapter derives strict JSON schema จาก contract และ HMAC request ID; ไม่เพิ่ม Core authority หรือ business rules ใน prompt
- Async TrainingRepository port, detached snapshots, CAS และ append-only history เป็น technical design
- Prisma configuration อยู่ใน JSON version พร้อม SQL triggers; MySQL 8+ ใช้ utf8mb4_0900_bin
- MySQL 8.4.11 เป็น version ที่เคยทดสอบ ไม่ใช่ version ที่ Proposal บังคับ
- Prisma connectionLimit=8, UTC mapping, save timeout 10 วินาที และ isolation levels เป็น adapter choices
- Local sanitizer เป็น demonstration control ไม่ใช่ production PII detector

รายละเอียด implementation อยู่ใน [Persistence](persistence.md) และ [Security](security.md)
## HTTP phase application choices

- Next.js 16.3.5, React/React DOM 19.3.0 เป็น runtime dependencies สำหรับ Route Handlers และ Frontend ที่ implement แล้ว
- Authentication Boundary ใช้ verified Auth.js Credentials session แล้ว; invalid/missing identity ยังคง default deny
- SMS fixture v2/DEFAULT เป็น playable allowlist; catalog เพิ่ม public description/labels โดยไม่เปลี่ยน Template
- Start request ใช้ startId UUID + expectedRevision=0; idempotent retry ภายใต้ owner/scenario เดิม
- Public action/evidence IDs แยกจาก domain IDs; payload ไม่มี score, events หรือ target State
- Request body สูงสุด 64 KiB; error/owner isolation policy อยู่ใน [API](api.md)

## Account / Credentials choices — approved 18 September 2026

Proposal requires signup/login, Auth.js Session/Cookie, bcrypt hash/compare, Zod email/password
validation and MySQL user data. The user approved the local account implementation for this phase.

Implemented Technical Design: UserAccount, AccountRepository, AccountService, Prisma adapter,
PasswordHasher, Credentials provider, official Auth.js routes and stable UUID→JWT→session→ownerId.
No Training owner FK, Auth.js DB adapter or changes to scoring/state rules.

Demo assumptions (not Proposal numeric requirements):

- UUID v4 generated once server-side; immutable ID trigger.
- Email trim + lowercase, Zod format, maximum 254 characters.
- Password minimum 12 Unicode code points, maximum 72 UTF-8 bytes; no trim/character-class rules.
- Native bcrypt 6.0.0 cost 12; same cost in real cryptographic tests.
- Registration body 2 KiB, strict JSON, id-only 201 response; no auto-login.
- JWT session strategy, Auth.js standard cookie/session defaults; current-browser logout only.
- One random dummy hash per service for unknown-account compare; no claim of constant time.

Planned / Not Implemented: profile, account deletion, password reset/change, email
verification, MFA, recovery, production abuse controls/security review, OAuth, Voice/WebSocket.
See [Authentication](authentication.md) and [Security](security.md) for limitations.
