# Architecture

STATUS: IMPLEMENTED TECHNICAL DESIGN — Core / Mock / Persistence / HTTP Boundary

[กลับ README](../README.md) · [Demo Assumptions](demo-assumptions.md)

## Reference policy

| ประเภทข้อมูล | ความหมาย |
|---|---|
| Proposal Requirement | สาระที่ตรวจพบใน Proposal v4; อาจยังไม่ได้ implement |
| Demo Assumption | รายละเอียด MVP ที่ผู้ใช้อนุมัติเพิ่ม ไม่ใช่ข้อกำหนดที่พิสูจน์จาก Proposal |
| Implemented Technical Design | พฤติกรรมที่อ่านยืนยันได้จากโค้ดปัจจุบัน |
| Planned / Not Implemented | งานอนาคต ไม่มี implementation ใน milestone นี้ |

อ้างอิง `Proposal_mitjee_revised_turnitin_v4.docx` ที่อยู่ใน `output/docx/`
ของ workspace ต้นทาง โดยไม่คัดลอกไฟล์เข้า code repository หรือแก้ไขไฟล์นั้น
ตรวจวันที่ 15 กันยายน 2026; SHA-256:
`A41018AE9DBB7F15C252F90128CCF61A8FEF1FA9A64C5D11EF07E2F6E0207EF5`
โฟลเดอร์ `sources/` ของ workspace ว่าง ณ วันที่ตรวจ จึงไม่มีไฟล์เพิ่มเติมให้ยืนยัน
ผู้ที่อ่านจาก GitHub ต้องเข้าถึง reference ต้นทางแยกต่างหาก ไม่ได้แนบ private Proposal ในเอกสารนี้

| สาระจาก Proposal v4 | ตำแหน่ง | สถานะใน MVP |
|---|---|---|
| D/W/S, น้ำหนัก 50/30/20, ผ่านตั้งแต่ 70, Critical Failure override | 4.1.4 และ 5.3.6 | Implemented |
| Backend กำกับลำดับและ AI ไม่มีสิทธิ์สร้าง State/ข้ามขั้นตอนเอง | 5.3.4 | Implemented ด้วย Demo State Model |
| แนะนำเนื้อหาจากทักษะต่ำสุด โดยไม่ปรับความยากอัตโนมัติ | 4.1.4 และ 5.3.6 | คืน recommendation metadata แล้ว; เนื้อหาเต็มยัง Planned |
| แนวโน้มคะแนนย้อนหลังไม่เกิน 3 ครั้ง | 4.1.4 และ 5.3.6 | Planned; Core คิดผลของ Session ปัจจุบันเท่านั้น |
| ระบบเว็บ, สถานการณ์ 9 ประเภท, ข้อความและเสียงเฉพาะ Call Center | 4.1.5 และขอบเขตโครงงาน | ทำเฉพาะ SMS fixture + Mock; ส่วนอื่น Planned |
| Moderation, การปิดบังข้อมูลและการทดสอบ Prompt Injection | 5.3.5 | มี local redaction/authority boundary บางส่วน ไม่ใช่ production implementation |

### ข้อขัดแย้งของแหล่งอ้างอิงที่รายงานแล้ว

คำสั่ง milestone นี้ให้จัดชื่อ enum ทั้งหกเป็น Demo Assumption และไม่อ้างว่า Proposal ระบุชื่อโดยตรง
แต่ไฟล์ v4 ที่ตรวจจริงในหัวข้อ 5.3.4 มีชื่อทั้งหกอยู่ในข้อความ
เอกสารนี้จึงคง **การจัดประเภทของ MVP ตามคำสั่งผู้ใช้** โดยไม่กล่าวอ้างว่าไฟล์ไม่มีชื่อเหล่านั้น
ดู [State Model](state-machine.md#demo-state-model); ต้องยืนยันฉบับอ้างอิงก่อนแก้ attribution ถาวร
ไม่มีการเปลี่ยน Proposal หรือ State Machine เพื่อแก้ความขัดแย้งนี้

## Component view

ลูกศรทึบแสดงการเรียกใช้/implementation ที่มีแล้ว; ลูกศรประแสดงส่วนที่ Planned
นี่คือมุมมอง module ภายใน backend และ Next.js API process ไม่ใช่ microservices ที่ deploy แยกกัน
ถ้า renderer ไม่รองรับ Mermaid ให้ใช้ตารางหน้าที่และ flow ข้อความด้านล่าง

```mermaid
flowchart LR
    futureClient["User / Frontend - PLANNED"] -.-> http["Next.js Route Handlers"]
    http --> auth["RequestAuthenticator / Strict DTO / Public Projection"]
    auth --> entry["Application Services"]
    tests["Tests / trusted caller"] --> entry
    entry --> dialogue["ScenarioDialogueOrchestrator"]
    entry --> core["TrainingCore"]
    dialogue --> provider["ScenarioModelProvider port"]
    provider --> mock["Mock Provider - IMPLEMENTED"]
    provider -.-> live["Live Provider - PLANNED"]
    dialogue --> core
    core --> validator["EventValidator / Critical rules"]
    core --> stateMachine["State Machine"]
    core --> scoring["Scoring Engine"]
    core --> repository["TrainingRepository port"]
    repository --> memory["InMemoryTrainingRepository"]
    repository --> prisma["PrismaTrainingRepository"]
    prisma --> mysql["MySQL"]
```

| Component | หน้าที่ / authority |
|---|---|
| Next.js Route Handlers | HTTP adapter; authenticate, validate transport, invoke application service, map safe errors |
| RequestAuthenticator | คืน verified identity; runtime default deny, deterministic adapter อยู่เฉพาะ tests |
| Application service / catalog | เลือก playable v2/DEFAULT, derive domain command จาก opaque public action ID; project public response |
| Composition root | lazy singleton ต่อ worker, ประกอบ Prisma → Repository → Core/Dialogue → Service และมี close/dispose |
| TrainingCore | start/resume, validate command, ประสาน Event/Opportunity/State/Result และ CAS commit |
| Template Validator | ตรวจ schema, graph, score mappings และ D/W/S บนทุก Safe Resolution path |
| EventValidator + Critical rules | ตรวจ explicit actions; candidate เป็น hint ไม่มีสิทธิ์สร้าง Event |
| State Machine | ตรวจ transition ID, required checkpoints และ event guards |
| Scoring Engine | คำนวณ D/W/S, outcome, weakestSkills และ recommendation |
| Dialogue Orchestrator | ตรวจ request/session, สร้าง context, รอ Provider, validate/sanitize/fallback แล้วส่งให้ Core commit |
| Model Provider | คืน AICharacterResponse เท่านั้น ไม่ได้รับ callback หรือ reference ไป Core |
| TrainingRepository | asynchronous port สำหรับ published versions และ Session aggregate |
| InMemory / Prisma adapters | คง ownership, identity, history และ atomic persistence semantics |

## Boundaries and data flow

HTTP request → RequestAuthenticator → strict Zod DTO → TrainingApplicationService
→ Core/Dialogue → repository → explicit public response projection
ownerId มาจาก authenticator เท่านั้น; catalog เป็น presentation/application policy ไม่ใช่ scoring rules
Template ไม่มี label ของ decision options จึงเพิ่ม label ใน catalog โดยไม่แก้ published configuration
คำขอเริ่มใช้ expectedRevision=0 และ startId; Session ใหม่เริ่ม revision 0 ตาม Core เดิม

Explicit action → Core.submit → parseAction → ownership/lifecycle/idempotency/revision
→ EventValidator → Opportunity/State Machine/Scoring → repository.save → result

Message → Orchestrator validation/sanitize → resume + version/state context
→ Provider → response schema/safety flags/sanitize หรือ fallback
→ Core.commitDialogueTurn → candidate inspection + FREE_TEXT validation → atomic save

Domain ไม่ import PrismaClient; port ใช้ types ของระบบเอง
อย่างไรก็ตาม Core อ้าง dialogue response schema และ persistence contract ใช้ sanitizer จาก dialogue
จึงไม่อ้างว่า package แยกขาดจากกันทุกทิศทาง ประเด็นที่แยกชัดคือไม่มี Prisma dependency ใน Core
Provider context ไม่มี transitions, answer keys หรือ scoring rules และถูก freeze แบบลึก
Repository ไม่ตัดสินคะแนนแทน Scoring Engine; trusted caller ต้องเรียกผ่าน Core

## Evidence and scope

- [Core](../src/core.ts), [Domain model](../src/domain/types.ts), [Template Validator](../src/domain/template-validator.ts)
- [Dialogue](../src/dialogue/orchestrator.ts), [Repository port](../src/domain/training-repository.ts)
- [Prisma adapter](../src/persistence/prisma-repository.ts), [shared repository tests](../tests/repository-contract.ts)

HTTP/API boundary implement แล้ว; UI/Auth.js/Live Provider/Voice/WebSocket ยังไม่ implement
ดู [API contract](api.md), [Security limitations](security.md) และ [Assumptions](demo-assumptions.md)
หลักฐานเพิ่ม: [Application](../src/application/training-service.ts), [Runtime](../src/application/runtime.ts),
[HTTP adapter](../src/http/handler.ts), [HTTP tests](../tests/http.integration.test.ts)
