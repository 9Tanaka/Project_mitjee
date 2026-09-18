# MITJEE

## Project overview

โครงงานนี้พัฒนาระบบฝึกรับมือการหลอกลวงทางไซเบอร์ด้วยสถานการณ์จำลอง
โค้ดปัจจุบันเป็น backend พร้อม Next.js HTTP API สำหรับ SMS / Phishing: สนทนากับ Mock Provider
สลับกับการตัดสินใจและการกระทำจำลอง จนได้ผลประเมินจากกฎของ Backend
มี Authentication Boundary และตัวตรวจผู้ใช้สำหรับ tests; runtime ปกติปฏิเสธทุกคำขอ (401)
จนกว่าจะเชื่อมตัวตรวจ identity จริง ยังไม่มี Frontend UI หรือระบบ login
Auth.js boundary เตรียมแล้ว; Proposal ระบุ password/bcrypt แต่แหล่งบัญชีและ verifier ยังต้องอนุมัติ
ดู [AUTH PROVIDER DECISION REQUIRED](docs/authentication.md) — ไม่เลือก OAuth หรือเพิ่มฐานข้อมูลรหัสผ่านเอง

## Current implementation status

| Component | Status |
|---|---|
| Core Domain | Implemented |
| Scenario State Machine | Implemented |
| Rule-Based Scoring | Implemented |
| Mock Dialogue | Implemented |
| Repository abstraction | Implemented |
| Prisma/MySQL Persistence | Implemented |
| HTTP API / Public DTO | Implemented — 8 endpoints |
| Authentication Boundary | Implemented — injected authenticator; default deny |
| Auth.js integration boundary | Implemented — provider configuration NOT SELECTED; real login disabled |
| Frontend UI | Planned / Not Implemented |
| Live AI Provider | Planned / Not Implemented |
| Voice / playable Call Center | Planned / Not Implemented |
| WebSocket | Planned / Not Implemented |

ประเภท Call Center และ variant มีใน schema แต่ยังไม่มี fixture/ระบบเสียง/ตัวเลือกแบบ seeded ที่เล่นได้
ขอบเขตที่ทำแล้วไม่เท่ากับขอบเขต Proposal ทั้งโครงงาน

## Architecture summary

```text
Client [FUTURE]
  → Next.js Route Handler → Authentication → Strict DTO
    → Application / Dialogue Layer
    → TrainingCore
      → TrainingRepository
        ├─ InMemoryTrainingRepository (memory only)
        └─ PrismaTrainingRepository → MySQL

ScenarioDialogueOrchestrator → ScenarioModelProvider
                              ├─ Mock Provider [IMPLEMENTED]
                              └─ Live Provider [PLANNED]
```

ดูขอบเขตหน้าที่และ Mermaid ใน [Architecture](docs/architecture.md)

## Core safety invariant

AI does not own state transitions, scoring, critical failure, or pass/fail.
Backend domain rules are authoritative.

Free Text และ AI candidate ไม่สามารถสร้าง irreversible Critical Failure โดยตรง
ต้องเป็น Explicit Simulated Action ที่ผ่าน Backend validation
การคุยหลาย turn ไม่ทำให้ข้าม checkpoint หรือได้คะแนนเอง

## Development

Node.js 24 เป็น tested development environment ไม่ใช่ Proposal Requirement
เริ่มจากโฟลเดอร์นี้:

```sh
npm ci --ignore-scripts
npm run prisma:generate
npm run prisma:validate
npm run typecheck
npm test
npm run build
```

หากไม่ได้ตั้ง `MYSQL_TEST_DATABASE_URL`, MySQL tests จะเป็น skipped ไม่ใช่ผ่าน
เมื่อมีฐานข้อมูลทดสอบพร้อม ให้ตั้ง environment แบบส่วนตัวตาม [Persistence](docs/persistence.md)
แล้วใช้ `npm run test:mysql` ซึ่งจะ fail หากไม่มี URL
ผลตรวจวันที่ 17 กันยายน 2026: Prisma generate/validate และ typecheck ผ่าน;
Architecture/Auth boundary phase: `npm test` ผ่าน 246 tests ไม่มี skip รวม architecture 8 กรณี และ baseline MySQL 24 กรณี
และ HTTP + MySQL เพิ่ม 1 กรณี; `npm run test:http` ผ่าน 106/106 (HTTP เดิม 64 + Auth boundary/policy 42), `npm run test:mysql` ผ่าน 24/24
Next.js build ผ่าน และตรวจ server จริงครบ 8 endpoints ว่าคืน 401/no-store เมื่อยังไม่มี identity adapter
แก้ [MySQL authentication issue](docs/persistence.md#resolved-verification-issue) ด้วย trusted RSA public key
เฉพาะ loopback development/test; ผลนี้ไม่ใช่การยืนยัน production deployment
อย่า commit credentials, `.env`, `.local-mysql/` หรือ `node_modules/`

`npm run dev` หรือ `npm run build` แล้ว `npm start` เปิด API บน loopback
ทุก endpoint ต้อง authenticate; ไม่มี demo header ที่ใช้ impersonate ผู้ใช้ได้
ดู [API contract และ composition setup](docs/api.md) ก่อนเชื่อม identity adapter จริง

## Documentation

- [Architecture และแหล่งอ้างอิง](docs/architecture.md)
- [Scenario Engine และ domain model](docs/scenario-engine.md)
- [State Machine และ lifecycle](docs/state-machine.md)
- [Scoring และคำแนะนำ](docs/scoring.md)
- [AI Integration — Mock ทำแล้ว / Live ยังไม่ทำ](docs/ai-integration.md)
- [Persistence และ MySQL tests](docs/persistence.md)
- [HTTP API และ Authentication Boundary](docs/api.md)
- [Auth.js: identity policy, official references และ decision gate](docs/authentication.md)
- [Security และข้อจำกัด](docs/security.md)
- [Demo Assumptions](docs/demo-assumptions.md)

เอกสารแยก Proposal Requirement, Demo Assumption, Implemented Technical Design
และ Planned / Not Implemented ตาม [เกณฑ์การอ้างอิง](docs/architecture.md#reference-policy)
มีหมายเหตุข้อขัดแย้งเรื่องชื่อ State ใน Proposal v4; ไม่แก้ Proposal หรือ `sources/`
Phase Architecture Cleanup + Auth.js Integration Boundary ทำส่วนที่ไม่ต้องเลือก provider แล้ว
Application เป็นเจ้าของ contracts/errors; HTTP map/validate DTO และ status; runtime ย้ายไป src/server/
รออนุมัติ account verifier/store ก่อน real login; ยังไม่เริ่ม Frontend หรือ Live AI
