# State Machine and Session Lifecycle

STATUS: IMPLEMENTED TECHNICAL DESIGN; ชื่อ State ใช้การจัดประเภท Demo Assumption ของ MVP

[กลับ README](../README.md) · [Scenario Engine](scenario-engine.md)

## Demo State Model

**Demo State Model derived from the scenario progression described in Proposal v4.**
ชื่อ enum ด้านล่างจัดเป็น **Demo Assumption** ตามข้อตกลง MVP ไม่ใช้เป็นข้ออ้างว่าเป็น
Proposal Requirement ที่ยืนยันแล้วใน milestone นี้

ข้อขัดแย้งที่รายงานก่อนแก้เอกสาร: ไฟล์ v4 ในเครื่องหัวข้อ 5.3.4 มีชื่อ enum เหล่านี้จริง
จึงไม่สามารถยืนยันประโยคว่า “Proposal ไม่ได้ระบุชื่อโดยตรง” กับไฟล์ฉบับนี้ได้
คงการจัดประเภทตามคำสั่งผู้ใช้และรอยืนยันฉบับอ้างอิง โดยไม่แก้ไฟล์อ้างอิงหรือ logic
ดู [Reference policy](architecture.md#reference-policy)

| State | บทบาทใน SMS fixture | Opportunities ที่เปิดเมื่อเข้า State |
|---|---|---|
| contact | เริ่มรับ SMS และพิจารณาผู้ส่ง | d1 |
| build_trust | ตรวจหลักฐานของข้อความ | w1 |
| create_pressure | path เสริมที่เพิ่มแรงกดดัน | w-extra (optional) |
| request_action | ตัดสินใจต่อคำขอข้อมูลจำลอง | d2 |
| user_verification | ตรวจสอบและยุติการติดต่อ | d3, s1 |
| end_scenario | State สิ้นสุด | ไม่มี opportunity ใหม่ |

## Transition graph of the fixture

| From | transitionId | To |
|---|---|---|
| contact | review-sms | build_trust |
| build_trust | inspect-link | request_action |
| build_trust | extra-message | create_pressure |
| create_pressure | continue-link | request_action |
| request_action | verify-and-close | user_verification |
| user_verification | resolve | end_scenario |

Main path ไม่ผ่าน create_pressure; path เสริมผ่าน State นี้ก่อน request_action
การสนทนาซ้ำใน State เดิมไม่ใช่ transition และไม่สร้าง opportunity ใหม่
Template progression ของ MVP เป็น acyclic แต่จำนวน dialogue turns ไม่ได้ถูก fix ตาม graph

## Guards and ownership

Backend เท่านั้นที่เรียก advanceState; AI ไม่มี authority เปลี่ยน State
XState ใช้ pure transition จาก snapshot ไม่ใช่ long-running actor ที่เก็บ Session แทน repository
ก่อน PROGRESS ต้อง:

1. Session ยัง ACTIVE และ transitionId มีใน State ปัจจุบัน
2. finalize ทุก opportunity ที่ required ใน State ปัจจุบัน
3. finalize รายการเพิ่มเติมใน edge.requiresFinalized
4. มี Backend-validated events ครบตาม edge.requiresEvents

ขาด transition ได้ INVALID_TRANSITION; ขาด checkpoint/event ได้ CHECKPOINT_OR_EVENT_REQUIRED
แม้ลบ redundant edge guard ก็ยังข้าม required checkpoint ของ State ไม่ได้
resolve ของ SMS fixture ต้อง finalize d1/w1/d2/d3/s1 และมี END_CONTACT
การตอบ D อย่างเดียวไม่ทำให้ PROGRESS อัตโนมัติ

Safe-resolution edge ต้องไป end_scenario และเปลี่ยน status เป็น COMPLETED
Core คิด TrainingResult ต่อ; COMPLETED ไม่ได้หมายถึง PASSED เสมอ ดู [Scoring](scoring.md)
Critical Failure เป็นเส้นทางจบที่ Core กำหนดแยกจาก safe-resolution edge หลัง explicit validation

## Session lifecycle

| เหตุการณ์ | Status / ผล |
|---|---|
| start | ACTIVE, revision 0, initial opportunities |
| safe resolution | COMPLETED, Official TrainingResult อาจ PASSED หรือ NOT_PASSED |
| explicit critical action ผ่าน validation | FAILED, outcome CRITICAL_FAILURE, state=end_scenario |
| QUIT_SESSION | ABANDONED, result=null |
| ไม่มีกิจกรรมครบ 30 นาทีเมื่อ resume ตรวจพบ | EXPIRED, result=null |

ABANDONED และ EXPIRED คง State ก่อนหยุดไว้ ไม่ถูกบังคับย้ายไป end_scenario
Idle timeout เป็น Demo Assumption; ไม่มี background expiry job
resume ไม่ต่อเวลา idle แต่สามารถบันทึก EXPIRED และเพิ่ม revision เมื่อครบเวลา
คำสั่ง/ข้อความที่ commit สำเร็จปรับ lastActivityAt; duplicate replay ไม่ใช่กิจกรรมใหม่

## Revision, CAS and resume

คำสั่งใหม่ต้องใช้ expectedRevision ปัจจุบัน; atomic save เพิ่ม revision ครั้งละหนึ่ง
สำหรับ request คนละรายการที่แข่งบน revision เดียวกัน มีเพียงหนึ่งรายการ commit ได้
ผู้แพ้ได้ REVISION_CONFLICT และไม่ทิ้ง Action/Event/Opportunity/Transition บางส่วนไว้
ข้อยกเว้นคือ idempotent retry ของรายการเดิม: คืนผลที่ commit แล้วแทนการคิดคะแนนซ้ำ
ดูรายละเอียด [Persistence](persistence.md)

refresh ในอนาคตใช้ resume คืน State/Version/Revision/history ที่เก็บไว้ ไม่เริ่มใหม่
InMemory ต้องใช้ repository instance เดิม; Prisma โหลดผ่าน client/process ใหม่ได้
HTTP GET /api/training/:sessionId เรียก resume ผ่าน authenticated application service แล้ว
Frontend refresh UI ยัง Planned; HTTP boundary คืน 410 สำหรับ EXPIRED ตาม lifecycle เดิม

Evidence: [State Machine](../src/domain/state-machine.ts), [Core](../src/core.ts),
[Template Validator](../src/domain/template-validator.ts), [concurrency tests](../tests/core-hardening.test.ts)
