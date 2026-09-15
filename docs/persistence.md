# Prisma / MySQL Persistence

STATUS: IMPLEMENTED TECHNICAL DESIGN

[กลับ README](../README.md) · [Architecture](architecture.md)

## Port and adapters

TrainingCore → TrainingRepository → InMemoryTrainingRepository หรือ PrismaTrainingRepository
เฉพาะ Prisma adapter ติดต่อ MySQL; InMemory ไม่ผ่านฐานข้อมูล
Core ไม่มี import PrismaClient และ port ไม่มี Prisma-specific types
port รองรับ async publish, getTemplate, create, get, save โดย save เป็น atomic aggregate CAS

InMemory ใช้ detached snapshots ใน Map; synchronous CAS ภายใน async method เป็น atomic ใน process นี้
ข้อมูลหายเมื่อ process ปิด และไม่แชร์ข้าม process
Prisma map aggregate ลง relational tables และ JSON columns; client ใหม่โหลดข้อมูลเดิมได้
InMemorySessionRepository เป็น alias เดิมของ InMemoryTrainingRepository
ทุกการตัดสินใจทางธุรกิจยังเป็นของ Core ไม่ใช่ adapter

## Entities and constraints

| Entity | ข้อมูล / คีย์สำคัญ |
|---|---|
| Scenario | id เป็น PK และ category; parent ของ Versions |
| ScenarioTemplateVersion | PK(templateId, version, variant), configuration JSON, publishedAt; FK ไป Scenario |
| TrainingSession | id เป็น PK, ownerId, State/Status/Revision/timestamps; compound FK ไป Version |
| TrainingAction | PK(sessionId, id), unique(sessionId, revision), fingerprint, validationStatus; FK ไป Session |
| SessionOpportunity | PK(sessionId, definitionId), eligibility/score/finalization, correct/incorrect IDs; FK ไป Session/Action ที่ finalize |
| TrainingEvent | PK(sessionId, id), code/rule/authority/critical; FK ไป Session/Action/Opportunity |
| DialogueTurnReceipt | PK(sessionId, id), unique(sessionId, actionId), inputKey/response/revisions/attempts; FK ไป Session/Action |
| TrainingMessage | PK(sessionId, id), unique(sessionId, turnId, role), sanitized text; FK ไป Session/receipt |
| TrainingResult | sessionId เป็น PK/FK จึงมีไม่เกินหนึ่ง Official Result ต่อ Session |

turnId ใน domain map เป็น DialogueTurnReceipt.id ภายใน Session
ScenarioTemplateVersion เก็บ config ของ version ที่ publish แล้ว ไม่ใช่ draft editor
TrainingResult มี template metadata แต่ใช้ Session เป็น FK หลัก ไม่อ้างว่าทุก metadata column มี FK แยก
Event/Opportunity/Message มี position รักษาลำดับเมื่อ timestamp เท่ากัน
Action เรียงตาม revision และ receipt ตาม committedRevision
เวลาถูกแปลงระหว่าง UTC milliseconds ของ domain กับ DateTime ในฐานข้อมูล
Migration ใช้ utf8mb4_0900_bin ของ MySQL 8+ เพื่อรักษา case/trailing-space identity เหมือน InMemory

## Transactions and CAS

create บันทึก Session/children ใน transaction เดียว
save ตรวจ next revision = expectedRevision + 1 แล้วทำตามลำดับ:

1. Conditional UPDATE ด้วย id + expectedRevision เพื่อ increment revision และถือ row lock
2. ถ้าไม่พบแถวตรง revision ให้ REVISION_CONFLICT
3. โหลด current aggregate ตรวจ immutable identity, append-only history, finalized opportunities และ result
4. เขียน State/Status/times, Action, Opportunity, Event, receipts, Messages และ Result
5. commit ทุกส่วนพร้อมกัน; error ที่ขั้นใด rollback รวม revision

save ใช้ ReadCommitted และ transaction timeout 10 วินาที เป็นค่าทางเทคนิคของ adapter
Prisma P2034 ถูกแปลงเป็น REVISION_CONFLICT; ไม่ได้ซ่อน DB errors ทุกชนิดด้วย fallback
beforeCommit เป็น fault-injection seam สำหรับ tests ไม่ใช่ callback สำหรับ business rules
get ใช้ RepeatableRead transaction เพราะ include อาจใช้หลาย SELECT และต้องคืน snapshot เดียว
get ตรวจ ownerId; save ตรวจ immutable ownerId หลัง CAS ภายใน transaction เดียว หากผิดจะ rollback

## Idempotency and immutability

Request ใหม่ที่ revision เก่า reject โดยไม่ทิ้ง partial write
แต่ retry ของ Action เดิม/fingerprint เดิมคืน committed state พร้อม duplicate=true
Core ตรวจ retry ก่อน apply และอ่านผู้ชนะซ้ำได้เมื่อเกิด CAS conflict
Dialogue ใช้ turnId/receipt พร้อม Action ID ที่สงวนไว้; concurrent duplicates ไม่สร้างข้อความซ้ำ
payload เปลี่ยนแต่ใช้ ID เดิมได้ IDEMPOTENCY_CONFLICT
DB unique constraints เป็นการป้องกันชั้นเพิ่ม ไม่ใช่สิ่งแทน domain idempotency checks

Version ทุกตัวที่ลงทะเบียนเป็น published และ immutable แม้ยังไม่มี Session อ้างอิง
publish configuration เดิมซ้ำเป็น no-op; เปลี่ยน config ต้องใช้ version ใหม่
adapter เปรียบเทียบ canonical JSON ซึ่งไม่ขึ้นกับลำดับ object keys
Migration มี triggers ปฏิเสธ UPDATE/DELETE ของ ScenarioTemplateVersion และ FK ป้องกัน reference ที่ไม่มีจริง
Session ไม่เปลี่ยน owner/templateId/templateVersion/variant/startedAt ย้อนหลัง
ประวัติเป็น append-only และ Result/Opportunity ที่ finalize แล้วแก้ไม่ได้ผ่าน repository save
ผู้มีสิทธิ์ DBA เปลี่ยน schema/trigger อยู่นอก authority boundary ของ Core

## Sanitized storage and trust

Dialogue path sanitize ข้อความก่อนเรียก Provider และก่อนเก็บ/คืนคำตอบ
ทั้งสอง adapter ตรวจ sanitized content contract ซ้ำ และ Prisma เขียนเฉพาะ column ที่ map ไว้
ไม่เก็บ raw invalid provider output หรือ provider error body
FREE_TEXT ผ่าน Core โดยตรงเก็บ fingerprint คงที่ ไม่เก็บ text
Dialogues เก็บเฉพาะ sanitized text/inputKey/response ตาม contract
sanitizer เป็น local pattern redaction เท่านั้น ไม่รับรอง PII protection ครบทุกประเภท
ห้ามใช้ข้อมูลจริงในการทดสอบ; ดู [Security](security.md)

## Development setup

ใช้ Node.js 24 ที่เคยทดสอบและ dependencies จาก package-lock.json
สร้าง MySQL database/user เฉพาะก่อนใช้ migration; ห้ามใช้ฐานข้อมูล production สำหรับ tests
ตั้ง DATABASE_URL และ MYSQL_TEST_DATABASE_URL ผ่าน environment ส่วนตัวหรือ secret manager
เอกสารนี้ไม่ใส่ connection URL หรือรหัสผ่านจริง

```sh
npm ci --ignore-scripts
npm run prisma:generate
npm run prisma:validate
npm run db:deploy
npm run typecheck
npm test
npm run test:mysql
```

prisma.config.ts อ่าน DATABASE_URL แต่ไม่โหลด .env อัตโนมัติ
fallback URL ใน config เป็น invalid placeholder ไม่ใช่ credential ใช้งานได้
Runtime client รับ URL ผ่าน createPrismaClient โดยตรง แล้ว inject PrismaTrainingRepository เข้า TrainingCore.create
ผู้สร้าง client ต้องเรียก $disconnect เมื่อเลิกใช้ ไม่มี global client ใน Core
helper ยอม non-TLS เฉพาะ loopback; remote ต้องส่ง tlsCa และตรวจ certificate
URL ที่มี query/hash ถูก reject แทนการ ignore options; remote TLS ยังไม่ถูกยืนยันด้วย tests ปัจจุบัน

## Verification coverage

MYSQL_TEST_DATABASE_URL ต้องชี้ dedicated database ชื่อ mitjee_test หรือ mitjee_test_<suffix>
หากไม่มี URL, npm test skip MySQL suite; npm run test:mysql จะ fail เพื่อไม่รายงานผ่านลวง
ตั้ง URL แล้วแต่ server/auth/schema ไม่พร้อม ถือว่า test environment fail ไม่ใช่ผ่าน
Tests ใช้ IDs แยกสำหรับ session และบาง template แต่ republish fixture versions เดิมด้วย config เดิม
มีการทดสอบ version 3 ของ fixture ด้วย จึงใช้เฉพาะฐานข้อมูลทดสอบ
ไม่มี test ล้างฐานข้อมูลทั้งหมด; ข้อมูลสมมติที่สร้างจะคงอยู่

- [Shared contract](../tests/repository-contract.ts) ใช้กับ [InMemory](../tests/persistence.memory.test.ts) และ Prisma
- [MySQL tests](../tests/persistence.mysql.test.ts) ตรวจ safe path, critical failure, duplicate action/turn,
  revision conflict, immutability, resume, FK/unique constraints และ rollback หลังการเขียนแต่ละกลุ่ม
- เปรียบเทียบ aggregate ระหว่าง InMemory/MySQL หลังทุก action/dialogue turn

ผลรอบ Persistence วันที่ 13 กันยายน 2026 เคยผ่าน 123 tests รวม MySQL จริง 24 กรณี
บน MySQL 8.4.11 แบบ local; เป็น historical verification ไม่ใช่ผลทดสอบ production
ผลรอบ Documentation Refactor รายงานแยกในข้อความส่งมอบ ไม่แก้ tests เพื่อให้ตัวเลขเท่าเดิม

### Known verification blocker

ตรวจวันที่ 15 กันยายน 2026

หลังเริ่ม portable MySQL ใหม่ npm run test:mysql ล้มเหลว 24/24 กรณี:
เริ่มจาก test timeout และตามด้วย Unable to start a transaction in the given time
ตรวจแบบอ่านอย่างเดียวพบ server ตอบ ping ได้ แต่ direct MariaDB driver connection ได้
ER_CANNOT_RETRIEVE_RSA_KEY ขณะยืนยันตัวตนกับบัญชีที่ใช้ caching_sha2_password
ข้อความ error ระบุว่าไม่มี RSA public key ฝั่ง client

client helper ปัจจุบันไม่ได้ตั้ง cachingRsaPublicKey หรือ allowPublicKeyRetrieval
การทดสอบนี้จึงติดที่ connection/authentication readiness ไม่ได้พิสูจน์ว่า domain transaction rules เปลี่ยน
ไม่แก้ adapter, credentials, DB authentication settings หรือ test timeouts ใน documentation phase
ต้อง review วิธีเชื่อมต่อที่ปลอดภัยในงานแยกก่อนยืนยัน DB suite อีกครั้ง
ผลผ่านวันที่ 13 กันยายนข้างต้นยังเป็น historical result ไม่ใช่ผลผ่านของรอบนี้

Retention cleanup, production operations และ performance benchmarks ยัง Planned
dependency overrides ปัจจุบันอยู่ใน package.json; อย่าสรุปจาก audit ในอดีตว่าปลอดช่องโหว่ตลอดไป

Evidence: [port](../src/domain/training-repository.ts), [InMemory](../src/domain/repository.ts),
[Prisma adapter](../src/persistence/prisma-repository.ts), [client](../src/persistence/prisma-client.ts),
[schema](../prisma/schema.prisma), [migration](../prisma/migrations/202609130001_persistence/migration.sql)
