# Prisma / MySQL Persistence

The additive `202609250001_decision_rules` migration adds checkpoint assessment and result evaluation-mode/decision-summary columns. Existing `TrainingResult` rows receive the database default `LEGACY_WEIGHTED_V1`; no historical result is recalculated. Categorical templates (SMS v3/v4 and eight other scenarios at v1) keep legacy numeric columns for storage compatibility with zero opportunity values and null aggregate score. Public feedback lives in the decision-summary JSON column. See [Decision Evaluation](decision-evaluation.md). Real migration deployment still requires a dedicated MySQL environment and has not been verified in this branch.

### Assessment round-trip recovery — 26 September 2026

The adapter previously discarded checkpoint assessments for every template version below 3.
Version numbers are scenario-local and do not identify evaluation semantics: all eight additional
categorical templates are version 1. Reads now include the pinned immutable template configuration,
use its explicit evaluationMode to preserve unanswered assessment:null, and always preserve a
non-null persisted assessment. Legacy null assessments remain omitted to retain the original
aggregate shape. No historical rows, scoring policy, schema or migration files are rewritten.

Decoder regression tests exercise categorical versions 1, 2, 3, 4 and 30 with SAFE, REVIEW,
UNASSESSED and unanswered null; legacy versions 1, 2 and 30 keep their old shape. These use a
fake read client and are not MySQL verification. Ten conditional real-MySQL cases cover all eight
additional scenarios plus SMS v3/v4, recreate a client after every explicit action, compare entire
aggregates and require PASSED with review=0, unassessed=0 and trainingScore=null.
Current external status: NOT RUN — MYSQL_TEST_DATABASE_URL unavailable.

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
| UserAccount | UUID PK, normalized email unique, private bcrypt hash, server timestamps; immutable-ID trigger; no Training owner FK |
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

สำหรับ local MySQL ที่ใช้ caching_sha2_password โดยไม่ใช้ TLS ให้ตั้ง
`MYSQL_TEST_RSA_PUBLIC_KEY_PATH` ผ่าน environment เป็น absolute path ไปยัง **public key ของ server ที่เชื่อถือได้**
tests ส่ง path นี้เข้า `createPrismaClient(url, { loopbackRsaPublicKey })` รวมถึง client ที่ใช้ทดสอบ resume
รับ key จาก local server filesystem ที่ควบคุมได้; ตรวจว่าเป็น key ของ instance นั้นก่อนใช้
ห้ามใช้ private key และห้าม commit key files; หาก server เปลี่ยน key ต้องปรับ trusted path ตามจริง
ไม่ตั้งค่า environment นี้ให้อัตโนมัติ และไม่ใส่ URL/credentials ลง repository
driver รองรับทั้ง path และ PEM content แต่ test setup ใช้ path เท่านั้น
ตัวเลือกนี้ถูกปฏิเสธบน remote host แม้ส่ง tlsCa มาด้วย; remote ยังคงใช้ trusted CA และ certificate verification
`allowPublicKeyRetrieval` เป็น false เสมอ; RSA ป้องกัน password exchange ไม่ได้เข้ารหัส session traffic ทั้งหมด

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

### Resolved verification issue

ตรวจวันที่ 15 กันยายน 2026

หลังเริ่ม portable MySQL ใหม่ npm run test:mysql ล้มเหลว 24/24 กรณี:
เริ่มจาก test timeout และตามด้วย Unable to start a transaction in the given time
ตรวจแบบอ่านอย่างเดียวพบ server ตอบ ping ได้ แต่ direct MariaDB driver connection ได้
ER_CANNOT_RETRIEVE_RSA_KEY ขณะยืนยันตัวตนกับบัญชีที่ใช้ caching_sha2_password
ข้อความ error ระบุว่าไม่มี RSA public key ฝั่ง client

แก้และตรวจซ้ำวันที่ 17 กันยายน 2026:

- **Root cause:** MySQL 8.4.11 / test account ใช้ caching_sha2_password;
  Prisma adapter 7.10.0 ใช้ MariaDB driver 3.5.4 ตาม lockfile/override
  helper เดิมไม่ส่ง TLS หรือ RSA public key สำหรับ loopback จึงทำ full authentication หลัง restart ไม่ได้
  pool ยังคง connectionLimit=8, timezone=Z; transaction/test timeout ไม่เปลี่ยน
- **Why previous tests worked:** ทดลองรอบนี้พบ cold/no-key → ER_CANNOT_RETRIEVE_RSA_KEY,
  pinned-key → connected, warm/no-key → connected จึงพิสูจน์กลไก authentication cache ได้
  ผลเก่าวันที่ 13 กันยายนสอดคล้องกับ cache ที่อุ่นแล้ว แต่ไม่มี log ยืนยันว่า client ใดเติม cache ในวันนั้น
- **Why portable MySQL failed:** restart ทำให้ต้อง full authentication ใหม่;
  server ตอบ ping ได้ไม่ได้แปลว่าบัญชี test ผ่าน authentication แล้ว
- **Chosen fix:** เพิ่ม loopbackRsaPublicKey ที่ composition-root helper ส่งให้ driver เป็น cachingRsaPublicKey
  อ่าน path จาก MYSQL_TEST_RSA_PUBLIC_KEY_PATH ใน test setup; ไม่เปลี่ยน user/plugin/credentials หรือ repository semantics
- **Safety/scope:** ใช้ public key ที่ได้จาก local filesystem ของ instance ที่เชื่อถือได้;
  ไม่ขอ key จากเครือข่ายอัตโนมัติ และไม่ลด certificate verification สำหรับ remote
  นี่เป็น configuration เฉพาะ local Demo/test ไม่ใช่การรับรอง production security

Verification ณ Mini-Phase MySQL Recovery (ก่อน HTTP phase):

| Check | ผล |
|---|---|
| npm run prisma:generate | ผ่าน |
| npm run prisma:validate | ผ่าน |
| npm run typecheck | ผ่าน |
| npm test พร้อม dedicated DB และ pinned key | 132 passed, 0 skipped |
| npm run test:mysql | 24 passed, 0 skipped |

132 กรณีรวม MySQL 24 กรณีและ connection-configuration tests ใหม่ 9 กรณี;
การรัน test:mysql เป็นการตรวจซ้ำ subset เดิม ไม่ใช่อีก 24 กรณีใหม่
ได้ทดสอบหลัง restart ก่อน test account เติม cache และทดสอบซ้ำหลัง cache อุ่นแล้ว
ใช้ dedicated database mitjee_test_verification เท่านั้น
ครอบคลุม shared repository contract, safe/critical path, duplicate action/turn, CAS/revision conflict,
template immutability, resume, atomic rollback และ FK/unique constraints
remote TLS มี unit test ยืนยัน configuration แต่ยังไม่ได้ทดสอบกับ remote server จริง

HTTP phase verification วันที่ 17 กันยายน 2026: regression ทั้งชุดผ่าน 196 tests ไม่มี skip
baseline MySQL suite ยังคงผ่าน 24/24 และ HTTP integration เพิ่ม real-MySQL safe path/resume อีก 1 กรณี
ไม่มีการเปลี่ยน persistence adapter, schema, authentication security หรือ transaction semantics ใน HTTP phase

Driver/auth references: [MariaDB connection options](https://mariadb.com/docs/connectors/mariadb-connector-nodejs/node-js-connection-options),
[MySQL 8.4 caching SHA-2 authentication](https://dev.mysql.com/doc/refman/8.4/en/caching-sha2-pluggable-authentication.html)

Retention cleanup, production operations และ performance benchmarks ยัง Planned
dependency overrides ปัจจุบันอยู่ใน package.json; อย่าสรุปจาก audit ในอดีตว่าปลอดช่องโหว่ตลอดไป

Evidence: [port](../src/domain/training-repository.ts), [InMemory](../src/domain/repository.ts),
[Prisma adapter](../src/persistence/prisma-repository.ts), [client](../src/persistence/prisma-client.ts),
[schema](../prisma/schema.prisma), [migration](../prisma/migrations/202609130001_persistence/migration.sql)

## User accounts additive migration — 18 September 2026

[202609180001_add_user_accounts](../prisma/migrations/202609180001_add_user_accounts/migration.sql)
adds only UserAccount plus its immutable-ID trigger. Existing migration history and Training
tables are untouched; deploy preserved all 290 existing Sessions and 70 existing Results
before new tests ran. No reset/drop/db push/backfill. Historic owner IDs need no account FK.

AccountRepository is an independent private port with create/findByNormalizedEmail only;
PrismaAccountRepository maps P2002 to ACCOUNT_ALREADY_EXISTS. Database uniqueness, not an
application pre-check, resolves concurrent normalized-email registrations. No auth Session,
OAuth Account or VerificationToken tables are added; Auth.js uses JWT strategy.

[Real account tests](../tests/accounts.mysql.test.ts) cover native bcrypt cost 12, unique
concurrent registration, new-client credential lookup/stable UUID, exact columns/no plaintext,
and direct ID-update rejection. test:mysql now runs both Training and account suites.
Synthetic account rows persist after tests; generated passwords/secrets are not printed or saved.

## Quiz additive migration — 26 September 2026

`202609260001_quiz` adds QuizAttempt and QuizReceipt only. A frozen question/baseline JSON snapshot is written at start; later CAS transactions atomically update answers, result, status, completion timestamp and revision with one request receipt. Completed results are immutable through the service. Existing Training and account rows are untouched. See [Quiz](quiz.md). `test:mysql` now includes all three persistence suites. Four new native transaction/rollback/concurrency tests are conditional and were skipped in this workspace without a dedicated database; no migration was deployed to a real database here.
