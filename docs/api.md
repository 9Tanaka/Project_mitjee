# HTTP API and Authentication Boundary

STATUS: IMPLEMENTED FOR DEMO — AUTH.JS BOUNDARY IMPLEMENTED; REAL LOGIN DISABLED

[README](../README.md) · [Architecture](architecture.md) · [Security](security.md)

HTTP phase baseline: c54726b7b71e685a11e77eeae37d6ba1d2d80426.
Architecture/Auth boundary baseline: d7eb841cd8d00782fd32d110c6f643bbb3be09d8.
Core, Dialogue และ Persistence semantics คงเดิม
Next.js Route Handlers ใช้ Node runtime และ request/response ปกติ ไม่มี Frontend, streaming หรือ Live AI

## Authentication and composition

Client → Route Handler → RequestAuthenticator → strict DTO → Application Service
→ TrainingCore / ScenarioDialogueOrchestrator → TrainingRepository → Prisma → MySQL

RequestAuthenticator.authenticate(Request) คืน { id } หรือ null
ทุก endpoint ต้อง authenticate; ownerId ใช้ id จาก boundary เท่านั้น
body/query ที่ส่ง ownerId ถูก reject; header/cookie ไม่มี authority โดยตัวเอง
foreign Session และ missing Session ตอบ 404 SESSION_NOT_FOUND เหมือนกันทุก endpoint

Runtime ใช้ AuthJsRequestAuthenticator ผ่าน server-side resolveAuthJsSession
configuration ยังไม่มี provider จึงคืน null/401 โดยไม่เปิด Prisma; ไม่มี test-token header หรือ environment switch
HTTP regression tests ใช้ WeakMap identity เฉพาะ tests; Auth tests เพิ่ม verified-session resolver mocks ผ่าน adapter จริง
Auth.js integration boundary implemented; Identity Provider configuration: NOT SELECTED / REQUIRES DECISION
Proposal ระบุ password/bcrypt แต่ยังไม่มี account store/verifier ที่อนุมัติ; real cookie/login flow ยังไม่เปิด
รายละเอียด strategy, ID source, package และ official references อยู่ใน [Authentication](authentication.md)

src/server/runtime.ts เป็น composition root เดียว มีหนึ่ง lazy initialization promise/pool ต่อ worker
เรียกหลัง authentication และ transport validation เท่านั้น; initialization ล้มเหลว dispose client แล้ว retry ครั้งถัดไปได้
เก็บ runtime ข้าม development module reload; close() ใช้ teardown เมื่อ caller ควบคุม lifecycle
Next process ใช้ pool จน process ปิด; ยังไม่มี graceful deployment shutdown hook
ไม่มีการสร้าง Core/Repository/Provider ใหม่ทุก request และไม่มี session aggregate cache ใน HTTP layer

Configuration ผ่าน private environment:

- AUTH_SECRET — private secret สำหรับ Auth.js ในอนาคต; ตั้งค่าอย่างเดียวไม่เปิด login หากยังไม่มี approved provider
- Provider variables ยังไม่กำหนด; ไม่สร้าง credentials หรือบัญชีตัวอย่าง
- DATABASE_URL — credentials ไม่อยู่ใน repository
- DATABASE_TLS_CA_PATH — trusted CA file สำหรับ remote; อ่าน content ส่งให้ helper เดิม
- DATABASE_LOOPBACK_RSA_PUBLIC_KEY_PATH — optional trusted public key สำหรับ local Demo
- MySQL tests ยังคงใช้ MYSQL_TEST_DATABASE_URL / MYSQL_TEST_RSA_PUBLIC_KEY_PATH ตาม [Persistence](persistence.md)

Remote ต้องมี trusted CA, rejectUnauthorized=true; allowPublicKeyRetrieval=false ทุกกรณี
ไม่มีการเปลี่ยน MySQL plugin, pool limits, CAS หรือ transaction policy

## Endpoints

| Method / path | Input / success |
|---|---|
| GET /api/scenarios | รายการ Public Scenario |
| GET /api/scenarios/:scenarioId | Public Scenario หนึ่งรายการ |
| POST /api/scenarios/:scenarioId/start | startId (UUID), expectedRevision: 0 → 201; retry → 200 |
| GET /api/training/:sessionId | Public Session พร้อม revision |
| POST /api/training/:sessionId/message | turnId, expectedRevision, text → Session + public Turn + duplicate |
| POST /api/training/:sessionId/action | actionId, expectedRevision, actionDefinitionId, payload → Session + duplicate |
| POST /api/training/:sessionId/quit | actionId, expectedRevision → Session + duplicate |
| GET /api/training/:sessionId/result | Official Public Result หรือ 404 RESULT_NOT_FOUND |

Success envelope คือ { "data": ... }; error คือ { "error": { "code": "...", "message": "..." } }
Session response มี sessionId, scenario, status, currentStatePublicLabel, revision, messages และ availableActions
Mutation response ใช้ { session, duplicate }; message เพิ่ม { turn: { turnId, committedRevision, characterMessage } }
revision ปัจจุบันอยู่ที่ session.revision; committedRevision เป็น revision ของ receipt เดิมเมื่อ replay
ทุก response ของ handlers ใช้ Cache-Control: no-store และ X-Content-Type-Options: nosniff
unsupported methods/unknown routes อาจได้ response ของ Next เอง ไม่ใช่ API envelope นี้

## Request validation

Zod strict schemas ตรวจ path/query/body และ response DTO/envelope
ไม่รองรับ query parameters; unknown fields ถูก reject รวม authoritative fields ทุกระดับ
public IDs ใช้ a-z/A-Z/0-9/underscore/hyphen ยาว 1–100; revision เป็น nonnegative safe integer
message text หลัง trim ยาว 1–8,000 UTF-16 code units ตาม Dialogue contract
JSON body สูงสุด 64 KiB ตรวจทั้ง Content-Length และ byte stream จริง รวม request ที่ไม่ส่ง Content-Length
รองรับ application/json (รวม charset) เท่านั้น; ไม่รองรับ compressed request body
POST ที่ส่ง Origin ต่างจาก request origin ถูก reject; ไม่เปิด CORS allow-origin
นี่ไม่ใช่ full production CSRF/session security หรือ rate-limit infrastructure

## Public scenario and action projection

Scenario มี id/category/title/description/learningObjectives/communicationMode=TEXT เท่านั้น
Backend กำหนด SMS / Phishing version 2, DEFAULT เป็น playable policy; client เลือก version/variant เองไม่ได้
Catalog เพิ่ม label/description สำหรับ presentation เพราะ published Template เดิมไม่มีข้อความตัวเลือก D/S
ไม่เพิ่ม score, Event, State guard หรือกฎใหม่ใน catalog

availableActions มาจาก pinned Template และ current Session: แสดงเฉพาะ State ปัจจุบันและ opportunity ที่ยังเปิด
public definition มี id, label, input, options เท่านั้น; IDs เช่น a01/o1 ไม่ใช่ internal rule/choice IDs

| input | payload |
|---|---|
| CHOICE | { "choiceId": "o1" } |
| EVIDENCE | { "selectedEvidenceIds": ["o1", "o2"] } |
| CONFIRM | { "confirmed": true } (explicit simulated action; ห้ามส่งรหัสจริง) |
| NONE | {} (ขอเดินหน้าผ่าน Core) |

ตัวอย่าง initial action: actionDefinitionId=a01, payload={choiceId:"o1"}; ต้องใช้ actionId ใหม่และ revision ที่อ่านมา
NONE เป็นคำขอไปต่อ ไม่รับ target State; Core ยังบังคับ checkpoints/event guards
progress control อาจแสดงก่อน checkpoint ครบ แล้ว Core ตอบ 422 INVALID_STATE เมื่อยังไปต่อไม่ได้
ไม่มี endpoint สำหรับ direct transition/scoring/Event CRUD/Opportunity CRUD/Result creation
ไม่คืน scores ก่อนตอบ, answer flags, event codes, rule IDs, target State, hidden opportunities/transitions,
prompts, fallback configuration, candidate confidence หรือ provider error metadata
Terminal result คืน D/W/S normalized, Training Score, Outcome, weakestSkills และ recommendation type/key/reason เท่านั้น
ไม่มี internal event/rule mapping หรือเฉลยของ Session ที่ยังเล่นอยู่

## Revision, retry and lifecycle

Start เป็นกรณีพิเศษ: ยังไม่มี Session revision จึงต้องส่ง 0 และได้ Session revision 0 ตาม Core
Session ID มาจาก hash ของ authenticated owner/scenario/startId; startId ซ้ำไม่สร้าง Session อีก
ห้ามนำข้อมูลส่วนบุคคลมาใช้เป็น startId/actionId/turnId

message/action/quit ใหม่ใช้ expectedRevision ปัจจุบันและ commit เพิ่ม revision ผ่าน Core CAS
stale request ตอบ 409 โดยไม่เพิ่ม Action/Event/score/opportunity/transition/message/result
expiry เป็น lifecycle operation ของ Core: resume อาจบันทึก EXPIRED และเพิ่ม revision ได้เองตาม baseline
HTTP ทุก endpoint ของ expired Session ตอบ 410; quit ได้ ABANDONED และไม่มี Official Result
new mutation หลัง completed/failed/abandoned ตอบ 422; valid idempotent retries ยังคง replay ตาม Core

Action mapping ค้นจาก pinned version ทั้งชุด เพื่อให้ retry หลังเปลี่ยน State/finalize แล้วยังแปลง command เดิมได้
actionId เดิม + domain fingerprint เดิม → duplicate=true; เปลี่ยน payload → 409
turnId เดิม + sanitized text เดิม → public receipt เดิม, ไม่เรียก Provider เพิ่มเมื่อ receipt มีอยู่แล้ว
Session ใน retry response อาจใหม่กว่า receipt; ใช้ session.revision สำหรับคำขอถัดไป
concurrent duplicates อาจเรียก Provider หลายครั้ง แต่ Core commit receipt ได้ครั้งเดียว
ชื่อ idempotency key สงวน prefix dialogue: ใน Core; public ID format ไม่ยอมให้ colon

## Central error mapping

| HTTP | Public code |
|---|---|
| 400 | INVALID_REQUEST |
| 401 | UNAUTHENTICATED |
| 403 | INVALID_ORIGIN |
| 404 | SCENARIO_NOT_FOUND / SESSION_NOT_FOUND / RESULT_NOT_FOUND |
| 409 | REVISION_CONFLICT / IDEMPOTENCY_CONFLICT |
| 410 | SESSION_EXPIRED |
| 413 | PAYLOAD_TOO_LARGE |
| 422 | INVALID_ACTION / INVALID_STATE / SESSION_NOT_ACTIVE |
| 503 | PROVIDER_UNAVAILABLE (reserved; current Mock fallback ไม่สร้าง error นี้) |
| 500 | INTERNAL_ERROR |

Known action/transition/lifecycle errors map ตามหมวด; unexpected errors ใช้ข้อความคงที่
ไม่ echo Zod issues, raw input, SQL, Prisma errors, stack trace หรือ provider raw output
Mock failure ที่ fallback สำเร็จเป็น HTTP 200 ตาม Dialogue contract ไม่ใช่ 503
HTTP layer ไม่มี raw request/response/error logging

## Verification and limitations

17 กันยายน 2026: prisma generate/validate, typecheck และ Next.js production build ผ่าน
npm test: 246 passed, 0 skipped; npm run test:http: 106 passed; npm run test:mysql: 24 passed
106 กรณีคือ HTTP regression 64 + Auth boundary/policy 42; architecture เพิ่ม 8 กรณีใน npm test
HTTP regression รวม 1 กรณีเชื่อม MySQL จริงจาก Route Handlers → Service → Core → Prisma พร้อม persisted resume
tests เรียก exported Route Handlers ด้วย Web Request/Response และ injected test identity ภายใน process
เพิ่มเติมเปิด Next server จริงบน loopback ตรวจ 8 endpoints ได้ 401/no-store ตาม default-deny policy
ไม่ได้อ้างว่าทดสอบ authenticated traffic ผ่าน deployed identity provider แล้ว

Real login/provider verification, Frontend, Live AI, Voice, WebSocket, streaming, production moderation/rate limits และ distributed deployment ยัง Planned
Public messages คืน sanitized history ทั้ง Session; pagination และ response-size budget ยังไม่ได้กำหนด
local sanitizer เป็น Demo control เท่านั้น ไม่ใช่ production-grade PII detector

Evidence: [routes](../src/app/api/scenarios/route.ts), [DTOs](../src/http/dto.ts),
[handler](../src/http/handler.ts), [services](../src/application/training-service.ts),
[catalog](../src/application/catalog.ts), [runtime](../src/server/runtime.ts),
[HTTP tests](../tests/http.integration.test.ts), [lifecycle tests](../tests/http.runtime.test.ts)

Framework reference: [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)

## Application / HTTP contract ownership

HTTP retains strict route/query/request/response Zod schemas and envelopes in dto.ts.
The handler maps parsed JSON through mapping.ts into application-owned plain inputs.
Application service/catalog/projections use their own contracts and semantic errors only;
HTTP maps ApplicationError/DomainError to the unchanged public error table above.
Responses remain explicit public projections validated at the HTTP boundary, with no
raw aggregate/template serialization. All eight route paths and payload contracts are unchanged.
