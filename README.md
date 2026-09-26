# MITJEE

## Project overview

โครงงานนี้พัฒนาระบบฝึกรับมือการหลอกลวงทางไซเบอร์ด้วยสถานการณ์จำลอง
โค้ดปัจจุบันเป็น Scenario Simulation module พร้อม Frontend และ Next.js HTTP API สำหรับ SMS / Phishing
ผลฝึกใหม่ใช้ Rule-Based Decision Evaluation แบบหมวดหมู่ตาม [กฎล่าสุด](docs/decision-evaluation.md)
ผลเก่าของ template รุ่น 1–2 ยังคงสูตรคะแนนเดิมและไม่ถูกคำนวณย้อนหลังใหม่
สนทนาผ่าน Mock หรือ OpenAI Responses API adapter ตาม configuration ของ server
สลับกับการตัดสินใจและการกระทำจำลอง จนได้ผลประเมินจากกฎของ Backend
มีบัญชีผู้ใช้ Email/Password, สมัครสมาชิกและล็อกอินผ่าน Auth.js Credentials แล้ว
Training API รับ UUID จาก verified session เท่านั้น; ไม่มีทางลัดผ่าน owner header
ดู [Authentication](docs/authentication.md) และ [Frontend](docs/frontend.md) — ยังไม่ใช่ production-ready

## Current implementation status

| Component | Status |
|---|---|
| Core Domain | Implemented |
| Scenario State Machine | Implemented |
| Rule-Based Decision Evaluation | Implemented for new SMS / Phishing sessions; historical weighted results preserved |
| Mock Dialogue | Implemented |
| Repository abstraction | Implemented |
| Prisma/MySQL Persistence | Implemented |
| HTTP API / Public DTO | Implemented — 8 endpoints |
| Authentication Boundary | Implemented — verified Auth.js session → opaque owner UUID |
| User Account / Auth.js Credentials | Implemented — MySQL accounts, bcrypt, registration, JWT/cookie login |
| Frontend UI | Implemented — registration/login, catalog, playable SMS / Phishing, result/logout |
| Live AI Provider | Implemented — OpenAI Responses API adapter; explicit Mock/OpenAI selection; **network verification NOT RUN** |
| Voice / playable Call Center | Planned / Not Implemented |
| WebSocket | Planned / Not Implemented |

ประเภท Call Center และ variant มีใน schema แต่ยังไม่มี fixture/ระบบเสียง/ตัวเลือกแบบ seeded ที่เล่นได้
ขอบเขตที่ทำแล้วไม่เท่ากับขอบเขต Proposal ทั้งโครงงาน

## Architecture summary

```text
Browser / React UI [IMPLEMENTED; public DTOs only]
  → Next.js Route Handler → Authentication → Strict DTO
    → Application / Dialogue Layer
    → TrainingCore
      → TrainingRepository
        ├─ InMemoryTrainingRepository (memory only)
        └─ PrismaTrainingRepository → MySQL

ScenarioDialogueOrchestrator → ScenarioModelProvider
                              ├─ Mock Provider [IMPLEMENTED]
                              └─ OpenAI Responses API Provider [IMPLEMENTED; network NOT VERIFIED]
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
ผลล่าสุด 22 กันยายน 2026 — Live AI Provider Integration:

- Prisma generate/validate, typecheck, production build และ client audit ผ่าน
- npm test: **415 passed, 0 skipped**; test:ai: 68 (provider 35, dialogue 24, HTTP 9)
- Dialogue เดิม 28; HTTP เดิม+runtime 131; Auth 81; Frontend 52; MySQL 28 — เป็น subsets ที่ทับซ้อนกัน
- Real Auth.js/MySQL smoke ผ่าน; browser E2E 3 ผ่านโดยใช้ Mock เพื่อคง deterministic regression
- Client audit: 43 JavaScript artifacts ผ่าน; npm audit ทั้งหมด/production-only: 0 known vulnerabilities
- **Real OpenAI network: NOT RUN** เพราะไม่มี private API key; ไม่อ้างว่า model/latency ผ่านจริง
- Core/Domain/Dialogue contract, State Machine, Scoring, Critical rules และ DB schema ไม่เปลี่ยน

ดู [รายงาน Phase และไฟล์ที่แก้](docs/live-ai-verification.md)

ผลก่อนหน้า 22 กันยายน 2026 — Frontend MVP (ก่อนเพิ่ม OpenAI adapter):

- Prisma generate/validate, typecheck และ production build ผ่าน
- npm test: 343 passed, 0 skipped; Frontend subset: 52 passed
- test:http: 128 passed; test:auth: 81 passed; test:mysql: 28 passed
- test:e2e: 3 passed — real Chromium + production Next + dedicated MySQL:
  register/login → multi-turn safe result → logout, critical/quit และ two-tab revision conflict
- test:auth:live ผ่าน; ไม่มีการลด Origin/CSRF/ownership checks
- Client audit: 43 JavaScript artifacts ผ่าน; architecture tests ตรวจ transitive imports
- ตรวจภาพมือถือ 375px / tablet 768px / desktop 1440px และ horizontal overflow ผ่าน
- npm audit ทั้งหมดและ production-only: 0 known vulnerabilities ณ วันที่ตรวจ

ดูคำสั่ง `test:frontend`, `test:e2e`, `audit:client` และข้อจำกัดใน [Frontend](docs/frontend.md)
Browser E2E แยกจาก npm test; screenshots/traces ไม่ถูก commit; ผลนี้ไม่ใช่ production certification

เมื่อมีฐานข้อมูลทดสอบพร้อม ให้ตั้ง environment แบบส่วนตัวตาม [Persistence](docs/persistence.md)
แล้วใช้ `npm run test:mysql` ซึ่งจะ fail หากไม่มี URL
ผลก่อนหน้า 18 กันยายน 2026 — User Account + Credentials:

- Prisma generate/validate, additive migration deploy, typecheck และ Next.js build ผ่าน
- npm test: 290 passed, 0 skipped รวม Core/Dialogue/Persistence/HTTP/Auth/Architecture
- test:http: 128 passed; test:auth: 81 passed; test:mysql: 28 passed (Training 24 + Account 4)
- test:auth:live: real Next + MySQL, registration → CSRF Credentials cookie → Training safe result
  พร้อมตรวจสองบัญชีแยกข้อมูลครบ 5 endpoints, UUID ใน DB, session update spoof, invalid CSRF,
  logout → 401 และ login ซ้ำยังได้ ID เดิม
- npm audit และ npm audit --omit=dev: 0 known vulnerabilities ณ วันที่ตรวจ
- Migration เพิ่ม UserAccount เท่านั้น; Sessions เดิม 290 และ Results เดิม 70 คงอยู่ครบก่อนทดสอบ

ตั้ง private test environment แล้วใช้ npm run test:auth:live หลัง npm run build
ใช้ canonical local origin http://localhost:<port> ให้ตรงกับ NextURL; ไม่ลด Origin/CSRF policy
ผลชุดย่อยเป็น subset ของ npm test ไม่ใช่จำนวน tests ใหม่เพิ่มกันทั้งหมด

Historical verification วันที่ 17 กันยายน 2026: Prisma generate/validate และ typecheck ผ่าน;
Architecture/Auth boundary phase: `npm test` ผ่าน 246 tests ไม่มี skip รวม architecture 8 กรณี และ baseline MySQL 24 กรณี
และ HTTP + MySQL เพิ่ม 1 กรณี; `npm run test:http` ผ่าน 106/106 (HTTP เดิม 64 + Auth boundary/policy 42), `npm run test:mysql` ผ่าน 24/24
Next.js build ผ่าน และตรวจ server จริงครบ 8 endpoints ว่าคืน 401/no-store เมื่อยังไม่มี identity adapter
แก้ [MySQL authentication issue](docs/persistence.md#resolved-verification-issue) ด้วย trusted RSA public key
เฉพาะ loopback development/test; ผลนี้ไม่ใช่การยืนยัน production deployment
อย่า commit credentials, `.env`, `.local-mysql/` หรือ `node_modules/`

`npm run dev` หรือ `npm run build` แล้ว `npm start` เปิด API บน loopback
Training endpoints ทุกตัวต้อง authenticate; registration และ Auth.js protocol routes เป็น public ตามหน้าที่
ตั้ง AUTH_SECRET และ AUTH_URL ผ่าน private environment; ไม่มี demo header ที่ใช้ impersonate ผู้ใช้ได้
ตั้ง `AI_PROVIDER=mock` อย่างชัดเจนเพื่อพัฒนาโดยไม่เรียก OpenAI; ไม่มี implicit Mock default อีกต่อไป
หากใช้ `AI_PROVIDER=openai` ต้องมี `OPENAI_API_KEY` และ `OPENAI_MODEL` ใน private server environment
Proposal v4 ระบุ `gpt-5.4-mini` และ final-test snapshot `gpt-5.4-mini-2026-03-17`;
ไม่มีการเปลี่ยน model ให้เอง ไม่มี browser selector และไม่มี arbitrary proxy URL
OpenAI adapter ใช้ SDK `openai@7.21.0`; รัน `npm run test:ai` โดย fake client ไม่เรียกเครือข่าย
`npm run test:ai:live` แยกต่างหากสำหรับข้อมูลสมมติหนึ่ง turn สูงสุดสอง requests
รอบนี้ไม่มี private API key: **Real OpenAI network verification: NOT RUN; model used: none**
ดู [AI integration](docs/ai-integration.md) สำหรับขอบเขตข้อมูล, timeout/retry และข้อจำกัด
ดู [API contract และ composition setup](docs/api.md) สำหรับ environment และ protocol

## Documentation

- [Architecture และแหล่งอ้างอิง](docs/architecture.md)
- [Scenario Engine และ domain model](docs/scenario-engine.md)
- [State Machine และ lifecycle](docs/state-machine.md)
- [Scoring และคำแนะนำ](docs/scoring.md)
- [Decision Evaluation รุ่นใหม่และความเข้ากันได้กับผลเก่า](docs/decision-evaluation.md)
- [AI Integration — Mock/OpenAI adapter ทำแล้ว; live network ยังไม่ตรวจ](docs/ai-integration.md)
- [Persistence และ MySQL tests](docs/persistence.md)
- [HTTP API และ Authentication Boundary](docs/api.md)
- [User accounts / Auth.js: identity policy, tests และข้อจำกัด](docs/authentication.md)
- [Frontend: routes, UX, retry/revision และ browser verification](docs/frontend.md)
- [Security และข้อจำกัด](docs/security.md)
- [Demo Assumptions](docs/demo-assumptions.md)

เอกสารแยก Proposal Requirement, Demo Assumption, Implemented Technical Design
และ Planned / Not Implemented ตาม [เกณฑ์การอ้างอิง](docs/architecture.md#reference-policy)
มีหมายเหตุข้อขัดแย้งเรื่องชื่อ State ใน Proposal v4; ไม่แก้ Proposal หรือ `sources/`
Phase User Account + Credentials Authentication เพิ่ม account store/registration/verifier ตามที่อนุมัติแล้ว
Application เป็นเจ้าของ contracts/errors; HTTP map/validate DTO; Core/scoring/state ไม่เปลี่ยน
Frontend Foundation + Authentication UI + Playable Training Flow ทำแล้วตาม backend ปัจจุบัน
ยังไม่เริ่ม Profile, อีก 8 fixtures, Pre/Post-test, Game, Knowledge Base, Dashboard, OAuth, Voice หรือ WebSocket
งานที่ยังเหลือและลำดับดำเนินการอยู่ใน [Implementation gap and phases](docs/implementation-roadmap.md)
