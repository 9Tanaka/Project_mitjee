# Security Boundaries and Limitations

STATUS: PARTIAL IMPLEMENTATION FOR DEMO; NOT PRODUCTION SECURITY

[กลับ README](../README.md) · [Reference policy](architecture.md#reference-policy)

## Implemented

| Control | สิ่งที่ทำจริง / ขอบเขต |
|---|---|
| Sanitized content contract | Dialogue sanitize ก่อนส่ง Provider และก่อนเก็บ/คืนคำตอบ; repository ตรวจซ้ำ |
| Local pattern redaction | ตรวจ labelled secrets บางแบบ, email, หมายเลขยาว, control characters และ URL ที่ไม่เข้า fictional allowlist |
| Domain ownership checks | repository get ตรวจ ownerId; Core เรียกผ่าน check นี้ แต่ยังไม่พิสูจน์ identity ของ caller |
| Critical action validation | ต้องเป็น explicit simulated command ที่ Template/State/Opportunity อนุญาตและ confirmed=true |
| Schema boundary | ปฏิเสธ response fields นอก schema และ Action fields ที่ไม่อนุญาต |
| No raw invalid provider output storage | เก็บ failure category/fallback แทน raw invalid response หรือ error body |
| Immutable provider context | detached/deep-frozen data ไม่มี Core/repository callbacks หรือเฉลย |
| CAS and idempotency | ป้องกัน stale/duplicate writes; Action/Event/State/Result commit ร่วมกัน |
| Published version immutability | repository checks และ MySQL triggers ป้องกันเปลี่ยน config ย้อนหลัง |
| Provider timeout cancellation | ส่ง AbortSignal และป้องกัน late response commit |
| HTTP Authentication Boundary | ทุก endpoint ผ่าน RequestAuthenticator; runtime default deny, test adapter อยู่เฉพาะ tests |
| HTTP owner isolation | ใช้ authenticated id; foreign/missing Session ได้ 404 เหมือนกัน |
| Public DTO projection | ไม่ serialize aggregate/template; opaque action IDs และ explicit response fields |
| Transport limits / errors | strict Zod, body 64 KiB, no-store, ข้อความ error คงที่ และไม่ log raw request/provider/database error |

AI ไม่มี authority เปลี่ยน State, คะแนน, Critical Failure หรือ pass/fail
confidence และ safety flags ที่ Provider ส่งมาไม่ใช่หลักฐานยืนยันการกระทำหรือการรับรองความปลอดภัย
แม้ข้อความดูเหมือนยอมทำสิ่งเสี่ยงก็ยังไม่ใช่ explicit simulated action

## Limitations and planned controls

| Control / capability | Status |
|---|---|
| Production-grade PII detection | Planned / Not Implemented |
| Live moderation service | Planned / Not Implemented |
| Comprehensive prompt-injection guardrail | Planned / Not Implemented |
| Auth.js / identity verification | Planned / Not Implemented |
| HTTP authorization | Implemented against injected identity; ยังไม่มี real identity adapter |
| CSRF/CORS, rate limits | มี same-origin POST check เมื่อมี Origin; full cookie/CSRF policy และ rate-limit infrastructure ยัง Planned |
| Retention cleanup / scheduled deletion | Planned / Not Implemented |
| Automated termination policy for out-of-scope content | Planned; ปัจจุบันใช้ fallback ไม่จบ Session อัตโนมัติ |
| Production security validation / external TLS test | Not verified by current tests |

Local sanitizer ไม่ตรวจชื่อ ที่อยู่ หรือ PII ทุกรูปแบบ/ทุกภาษา และไม่พิสูจน์ว่า string ที่ผ่านแล้วไม่มีข้อมูลจริง
ใช้เฉพาะข้อความและข้อมูลสมมติ ห้ามส่ง credential/ข้อมูลส่วนบุคคลจริงเพื่อทดลอง
เอกสารไม่คัดลอก raw PII-like inputs จาก test fixtures มาเป็นตัวอย่าง
การ reject ค่าแบบตัวอย่างใน tests ไม่เท่ากับการผ่าน production threat assessment

ระบบเชื่อถือ caller ภายใน process, provider implementation และ repository adapter
freeze context ไม่ใช่ sandbox แยก process; ผู้ที่เข้าถึง Core/repository/DB โดยตรงเป็น privileged code
ownerId ต้องเป็น opaque identifier จาก authenticator ไม่ใช่ชื่อ/email ที่ client ส่งแทนการยืนยันตัวตน
API มี DTO projection ปิด answer keys และ centralized errors ที่ไม่ส่ง raw internal error กลับผู้ใช้แล้ว
runtime ไม่มี identity adapter ที่ใช้งานจริง จึงปฏิเสธทุกคำขอด้วย 401; ไม่มี header impersonation bypass
แบบทดสอบ authenticated flow ผูก Request กับ identity เฉพาะใน test process
มาตรการเหล่านี้ไม่ใช่การรับรอง production identity/CSRF/PII security
Public response ใช้ explicit fields แต่ข้อความสนทนายังพึ่ง Demo sanitizer ตามข้อจำกัดเดิม

## Storage and operational hygiene

Prisma client อ่าน credentials จาก URL ที่ caller ส่งเข้ามา อย่า log URL หรือ commit ลงเอกสาร
CLI ใช้ DATABASE_URL; tests ใช้ MYSQL_TEST_DATABASE_URL; เก็บค่าใน private environment
helper ยอม non-TLS เฉพาะ loopback ส่วน remote ต้องส่ง trusted tlsCa พร้อม certificate verification
การทดสอบเดิมเป็น loopback MySQL ไม่ครอบคลุม remote TLS deployment
รอบ Documentation วันที่ 15 กันยายน 2026 พบ connection blocker หลัง restart MySQL ที่ใช้ caching_sha2_password
แก้วันที่ 17 กันยายนด้วย trusted server public key เฉพาะ loopback development/test
ดู [resolved verification issue](persistence.md#resolved-verification-issue)
test setup อ่าน MYSQL_TEST_RSA_PUBLIC_KEY_PATH ผ่าน environment; key ต้องมาจาก trusted local filesystem
ห้ามใช้ private key หรือ commit key files; ไม่เปิด automatic public-key retrieval
helper ปฏิเสธ loopbackRsaPublicKey บน remote host และคง rejectUnauthorized=true เมื่อใช้ TLS
RSA นี้เข้ารหัสเฉพาะ password exchange; loopback non-TLS ยังไม่ได้เข้ารหัสข้อมูลทั้ง connection
ไม่เปลี่ยน authentication plugin, credentials, production policy หรือ transaction timeouts
ผลทดสอบปัจจุบันยืนยัน local persistence และ configuration guards เท่านั้น ไม่ใช่ production-ready

`.gitignore` ปัจจุบันครอบ .env, .local-mysql/, node_modules/, src/generated/ และ build artifacts บางชนิด
ไม่ได้ครอบ secret filename ทุกรูปแบบ จึงต้องตรวจ git status/diff และ staged files ก่อน commit ทุกครั้ง
ห้าม commit credentials, private keys, API keys หรือไฟล์ฐานข้อมูล แม้บางไฟล์ไม่ถูก ignore
หากพบ secret ต้องหยุด commit/push และรายงานเพื่อจัดการก่อน ไม่แอบแก้ข้อมูลหรือ rewrite history

ไม่มี retention job แม้เลือกใช้ DEMO_DATA_RETENTION_DAYS=30 เป็น planned assumption
จึงไม่อ้างว่าข้อมูลถูกลบหลัง 30 วันแล้ว และไม่ควรเก็บข้อมูลจริงในฐานทดสอบ

Evidence: [sanitizer](../src/dialogue/sanitize.ts), [persistence contract](../src/domain/persistence-contract.ts),
[Critical rules](../src/domain/critical-failure.ts), [provider tests](../tests/dialogue.integration.test.ts),
[Prisma client](../src/persistence/prisma-client.ts), [API plan](api.md)
