# MITJEE

## Project overview

โครงงานนี้พัฒนาระบบฝึกรับมือการหลอกลวงทางไซเบอร์ด้วยสถานการณ์จำลอง
โค้ดปัจจุบันเป็น backend library สำหรับ SMS / Phishing: สนทนากับ Mock Provider
สลับกับการตัดสินใจและการกระทำจำลอง จนได้ผลประเมินจากกฎของ Backend
ยังไม่มีเว็บหรือ HTTP server สำหรับผู้ใช้ปลายทาง

## Current implementation status

| Component | Status |
|---|---|
| Core Domain | Implemented |
| Scenario State Machine | Implemented |
| Rule-Based Scoring | Implemented |
| Mock Dialogue | Implemented |
| Repository abstraction | Implemented |
| Prisma/MySQL Persistence | Implemented |
| HTTP API | Planned / Not Implemented |
| Authentication / Auth.js | Planned / Not Implemented |
| Frontend UI | Planned / Not Implemented |
| Live AI Provider | Planned / Not Implemented |
| Voice / playable Call Center | Planned / Not Implemented |
| WebSocket | Planned / Not Implemented |

ประเภท Call Center และ variant มีใน schema แต่ยังไม่มี fixture/ระบบเสียง/ตัวเลือกแบบ seeded ที่เล่นได้
ขอบเขตที่ทำแล้วไม่เท่ากับขอบเขต Proposal ทั้งโครงงาน

## Architecture summary

```text
Client [FUTURE]
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
npm run typecheck
npm test
```

หากไม่ได้ตั้ง `MYSQL_TEST_DATABASE_URL`, MySQL tests จะเป็น skipped ไม่ใช่ผ่าน
เมื่อมีฐานข้อมูลทดสอบพร้อม ให้ตั้ง environment แบบส่วนตัวตาม [Persistence](docs/persistence.md)
แล้วใช้ `npm run test:mysql` ซึ่งจะ fail หากไม่มี URL
ผลตรวจวันที่ 17 กันยายน 2026: Prisma generate/validate และ typecheck ผ่าน;
`npm test` ผ่าน 132 tests ไม่มี skip รวม MySQL 24 กรณี และ `npm run test:mysql` ผ่าน 24/24
แก้ [MySQL authentication issue](docs/persistence.md#resolved-verification-issue) ด้วย trusted RSA public key
เฉพาะ loopback development/test; ผลนี้ไม่ใช่การยืนยัน production deployment
อย่า commit credentials, `.env`, `.local-mysql/` หรือ `node_modules/`

## Documentation

- [Architecture และแหล่งอ้างอิง](docs/architecture.md)
- [Scenario Engine และ domain model](docs/scenario-engine.md)
- [State Machine และ lifecycle](docs/state-machine.md)
- [Scoring และคำแนะนำ](docs/scoring.md)
- [AI Integration — Mock ทำแล้ว / Live ยังไม่ทำ](docs/ai-integration.md)
- [Persistence และ MySQL tests](docs/persistence.md)
- [API — Planned / Not Implemented](docs/api.md)
- [Security และข้อจำกัด](docs/security.md)
- [Demo Assumptions](docs/demo-assumptions.md)

เอกสารแยก Proposal Requirement, Demo Assumption, Implemented Technical Design
และ Planned / Not Implemented ตาม [เกณฑ์การอ้างอิง](docs/architecture.md#reference-policy)
มีหมายเหตุข้อขัดแย้งเรื่องชื่อ State ใน Proposal v4; ไม่แก้ Proposal หรือ `sources/`
Phase HTTP API + Authentication Boundary **ยังไม่ได้เริ่ม implementation**
