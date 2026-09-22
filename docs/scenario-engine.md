# Scenario Engine

STATUS: IMPLEMENTED TECHNICAL DESIGN

[กลับ README](../README.md) · [Reference policy](architecture.md#reference-policy)

## Domain model

| Model | ความหมายและข้อมูลสำคัญ |
|---|---|
| TrainingAction | สิ่งที่ผู้ใช้ทำ; record เก็บ id/session/kind/fingerprint, State, revision ก่อน commit, เวลาและ validationStatus |
| AICandidateEvent | AI interpretation / hint; eventCode, opportunityId, sourceMessageId, confidence ไม่มี authority |
| TrainingEvent | Backend validated event; อ้าง Action/Opportunity/Rule, State, code, critical และ authority BACKEND_VALIDATED |
| SessionOpportunity | โอกาสที่เปิดจริงใน path; definitionId, skill, eligibleMaximum, earned, เวลาเปิด/finalize และคำตอบ W |
| TrainingSession | aggregate รวม identity/owner/version/variant, State/Status/Revision, actions/events/opportunities/messages/receipts/result |
| TrainingResult | Scoring Engine output; D/W/S, trainingScore, outcome, weakestSkills และ recommendation |
| ScenarioTemplateVersion | configuration ของ Template ที่ publish ด้วย id/version/variant; แก้ย้อนหลังไม่ได้ |

ใน TypeScript ใช้ `ScenarioTemplate` สำหรับ configuration ตาม version
ส่วน `ScenarioTemplateVersion` เป็นชื่อ Prisma entity ไม่ใช่ class TypeScript แยกอีกตัว
`DialogueTurn` เป็น domain receipt; persistence เก็บเป็น `DialogueTurnReceipt`
การมี entity/table ไม่ได้แปลว่ามี HTTP endpoint สำหรับ entity นั้น

TrainingAction ≠ AICandidateEvent ≠ TrainingEvent ≠ TrainingResult
ความแตกต่างนี้ป้องกันไม่ให้ข้อความจากโมเดลกลายเป็นการยืนยันจากผู้ใช้หรือคะแนนโดยตรง

## Template registration and session start

`await TrainingCore.create(templates, repository, clock?)` ตรวจ Template ทั้งชุดก่อน publish ทีละ version
การ publish ทั้งชุดไม่ใช่ batch transaction เดียว; แต่ละ version มี publication semantics ของ repository
`start` โหลด id/version/variant ที่ลงทะเบียนแล้ว สร้าง ACTIVE Session revision 0 และเปิด opportunities ของ contact
ทุก Safe Resolution path ต้องมี eligible D/W/S อย่างน้อยประเภทละหนึ่งรายการก่อนเปิดให้เล่น
Template validation ปฏิเสธ cycle, unreachable state, invalid mappings และ guard ที่อ้าง opportunity นอก path

ทุก fixture ใช้ข้อมูลสมมติ `fictionalOnly: true`; ปัจจุบันมี SMS / Phishing:

- [Version 1](../src/fixtures/sms-phishing.ts): Core-only configuration
- [Version 2](../src/fixtures/sms-phishing-dialogue.ts): เพิ่ม characterRole โดยไม่แก้ Version 1

Version 1 ใช้ Dialogue โดยตรงไม่ได้และจะได้ DIALOGUE_ROLE_NOT_CONFIGURED
จำนวน 3 Decision Checkpoints เป็น Demo Assumption ของ fixture ไม่ใช่จำนวน fix สำหรับทุก Template

## Action processing

| ActionInput.kind | การทำงาน |
|---|---|
| DECISION | ตรวจ choice ของ D opportunity ปัจจุบัน แล้วให้คะแนนตาม Template |
| WARNING_FINALIZE | ตรวจ Evidence IDs, เก็บรายการถูก/ผิด และ finalize W ได้ครั้งเดียว |
| SAFE_ACTION | ตรวจ action ของ S opportunity แล้วใช้คะแนน/events ที่กำหนด |
| SIMULATED_ACTION | ยืนยันการกระทำจำลองตาม Critical Failure Rule ที่ Template อนุญาต |
| PROGRESS | ขอ transition โดยไม่ข้าม required checkpoint/event guards |
| QUIT_SESSION | จบเป็น ABANDONED ไม่มี Official Result |
| FREE_TEXT | ไม่มีคะแนนหรือ Event จากข้อความ; plan เป็น CLARIFICATION_REQUIRED |

`validateAction` คืน ValidatedPlan แล้ว Core จึงสร้าง TrainingEvent/finalize Opportunity
ไม่รับคะแนนหรือ credential จริงเป็น field ของ ActionInput และไม่สร้าง UI button ใน milestone นี้
HTTP action endpoint แปลง public definition/payload เป็น explicit command แล้ว; Frontend render ปุ่ม/ตัวเลือกจาก Public Actions โดยไม่รู้ domain mapping
availableActions เป็น presentation projection ของ current State/opportunities ไม่ใช่การส่งกฎภายในให้ client

## Event Registry and candidate validation

Registry จำแนก reusable event codes ไม่ใช่ตัวประมวลผลคะแนน:

- ปกติ: VERIFY_SOURCE, IDENTIFY_WARNING_SIGN, REFUSE_SENSITIVE_INFO, REFUSE_OTP,
  REFUSE_TRANSFER, END_CONTACT, REPORT_INCIDENT
- Critical: DISCLOSE_OTP, CONFIRM_UNVERIFIED_TRANSFER, ENTER_PASSWORD_SUSPICIOUS_LINK,
  INSTALL_UNTRUSTED_APP, GRANT_REMOTE_CONTROL

แต่ละ State มี allowedEventCodes; การมี code ใน Registry ไม่ได้ทำให้ใช้ได้ทุก State
SMS fixture เปิดใช้ Critical Rules สองรายการเกี่ยวกับ simulated OTP/password เท่านั้น
ไม่อ้างว่ามีสถานการณ์เล่นครบสำหรับ Critical Codes ทั้งห้าแล้ว

`inspectCandidate` เป็น read-only: malformed/disallowed ได้ REJECTED, ไม่มี code ได้ NO_EVENT,
hint ที่ยังเข้าเงื่อนไขได้ CLARIFICATION_REQUIRED โดยไม่สร้าง Event
confidence ไม่ถูกอ่านเพื่อตัดสิน ไม่มี threshold ยอมรับอัตโนมัติ
`TrainingCore.inspectAI` เรียก resume ก่อน จึงอาจบันทึก EXPIRED ตาม lifecycle ได้
การ expire นั้นไม่ใช่อำนาจของ candidate และไม่ใช่ Critical Failure

## Explicit critical failure validation

Free-text interpretation and AI candidate events must never directly produce an irreversible Critical Failure.

Backend ต้องตรวจ SIMULATED_ACTION, confirmed=true, Rule ที่มีจริงใน Template,
State ปัจจุบันตรง Rule, code อยู่ใน allowedEventCodes, Opportunity เปิดและยังไม่ finalize
รวมถึงไม่มี Event ที่ขัดกับ requiresAbsentEvents
เมื่อผ่านจึงสร้าง Critical Event และ Core จบ Session เป็น FAILED พร้อม TrainingResult
คำบอกเล่า ความกำกวม หรือ AI confidence สูงไม่เข้ากระบวนการนี้

## Persistence and duplicate protection

Action IDs ใช้ idempotency ภายใน Session; prefix `dialogue:` สงวนให้ Core
คำขอซ้ำและ fingerprint เดิมคืน duplicate โดยไม่ให้คะแนนซ้ำ; payload เปลี่ยนได้ IDEMPOTENCY_CONFLICT
FREE_TEXT ที่ส่งเข้า Core โดยตรงใช้ fingerprint คงที่และไม่เก็บข้อความ
Dialogue path เก็บเฉพาะ sanitized content และ receipt ตาม [Dialogue contract](ai-integration.md)
ทั้งหมด commit ร่วมกับ revision ผ่าน [Persistence](persistence.md)

Evidence: [types](../src/domain/types.ts), [action schema](../src/domain/training-action.ts),
[EventValidator](../src/domain/event-validator.ts), [Critical rules](../src/domain/critical-failure.ts),
[Core tests](../tests/core.test.ts)
