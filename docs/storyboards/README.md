# MITJEE Storyboard Index

## ลำดับการอ่าน

1. **For drawing / PRIMARY DRAWING DOCUMENT:** [Storyboard Flow Summary](../scenario-storyboard-flow-summary.md) สำหรับวาดภาพลำดับ 5–8 ขั้นต่อเรื่องโดยไม่ต้องรู้ระบบภายใน
2. **For interaction detail / DETAILED INTERACTION REFERENCE:** [ไฟล์รายหมวดด้านล่าง](#files) เริ่มจาก Storyboard Drawing Flow แล้วค่อยอ่านรายละเอียด A–U และเฟรมเดิม
3. **For rule/system semantics:** [Scenario Storyboard Specification](../scenario-storyboard-spec.md) และ [Decision Evaluation](../decision-evaluation.md) เมื่อจำเป็นต้องตรวจข้อกำหนดการทำงานและการประเมิน

เอกสารมีสองระดับ: Level 1 คือเรื่องย่อสำหรับวาด และ Level 2 คือรายละเอียดการโต้ตอบเดิม ไม่ต้องอ่านรายละเอียดระบบก่อนเริ่มวาดร่าง ทุกไฟล์เป็น CONTENT + INTERACTION DESIGN ONLY ไม่มี application implementation

**Current runtime alignment (2026-10-02):** ตรวจจาก `7ce29f87d247c457789489a3e0e7091e005c24b2` ได้ 9 playable category-level demo scenarios ไม่ใช่ 21 playable stories. ตารางด้านล่างเป็นรายการ target designs; ดู [ตารางนับกลางและ mapping ครบทุก ID](../scenario-story-bank.md#18-current-runtime-alignment). Backend NORMAL/SCAM 50/50, Voice UI/Azure adapter/WebSocket/HTTP fallback implement แล้ว แต่ NORMAL_CALL ยังเป็นห้องสมุดนัดรับหนังสือ ไม่ใช่ CC-N01/CC-N02. Live Azure/Groq และ dedicated MySQL/browser E2E ยัง NOT RUN ตาม [รายงาน](../realtime-verification.md).

## Drawing flow coverage

- Historical baseline ของรอบ matched control เมื่อ 2026-09-30: `4062a8b837728a3aed56df48ea35eaeaf0c3fa87`; ไม่ใช่ current runtime HEAD
- ครบ 9 หมวด / 19 scam stories / 2 normal controls; รวม 141 ขั้น เฉลี่ย 6.71 ขั้นต่อเรื่อง
- 5 ขั้น: 0 เรื่อง; 6 ขั้น: 9 เรื่อง; 7 ขั้น: 9 เรื่อง; 8 ขั้น: 3 เรื่อง
- วาดร่างได้ 21 เรื่อง แต่ยังรออนุมัติ: NEEDS_CONTENT_REVIEW 14 / CONDITIONAL_CONTENT 7; สายปกติไม่เพิ่มคำขออันตรายหรือสัญญาณเตือนปลอม
- ลำดับในเอกสารหลักกับ Storyboard Drawing Flow รายหมวดใช้ข้อความตรงกันทุกคำ และยังมีรายละเอียดครบ 252 เฟรม โดยรอบนี้แก้เฉพาะเนื้อหา Call Center ที่เกี่ยวกับ matched controls ไม่ลดโครงเฟรม

## Call Center matched controls

- CC-01 ↔ CC-N01: บริบทพัสดุร่วมกัน แต่ต่างที่การอ้างคดีและขอโอนเงินกับการยืนยันจัดส่งเดิม
- CC-02 ↔ CC-N02: บริบทธนาคารร่วมกัน แต่ต่างที่การขอ OTP กับการให้เปิดแอปเองและยอมวางสาย
- ทั้งสอง controls ใช้ Drawing Flow 6 ภาพ และรายละเอียดระดับ 2 จำนวน 8 เฟรมต่อเรื่อง
- CC-N02 ใหม่เป็น DESIGN RECOMMENDATION / MATCHED CONTROL จากแนวคิดสายปกติทั่วไป ไม่ใช่บทธนาคารที่อ้างว่ามีในต้นฉบับ และยังเป็น CONTROL / CONDITIONAL_CONTENT
- ไม่เพิ่ม target stories; การเลือก matched pair พัสดุ/ธนาคารยังเป็นแผน ส่วน runtime สุ่ม NORMAL_CALL ห้องสมุด / SCAM_CALL ธนาคารปลอม 50/50 แล้ว; อ่าน [เหตุผลและ provenance](../scenario-story-bank.md#14-normal-call-controls)

## Detailed interaction baseline

ข้อมูลต่อไปนี้คือสถิติและฐานการจัดทำรายละเอียดระดับ 2 เดิม ไม่ใช่จำนวนขั้นของฉบับย่อหรือการอนุมัติเนื้อหาใหม่

- Branch: `feat/rule-based-evaluation`; local และ remote ณเริ่ม: `105fe8395f86cc936d808ecba0cf7643aeaf19af`
- Source: [Story Bank](../scenario-story-bank.md) และ [Deduplication](../scenario-deduplication-report.md) ที่ HEAD จริง; ไม่ใช้รายชื่อประมาณจาก prompt แทน source
- Coverage: 9 หมวด / 19 scam families / 2 normal controls / 252 frames
- Branch counts: Safe 42 (38 scam + 4 control), Review 38, Critical-candidate 19 (proposed ไม่ใช่ approved critical events)
- Ownership: QWEN_GENERATED 109 frames, BACKEND_SYSTEM 122 frames รวม result read-only; เฟรมที่มี VALIDATED_ACTION 101; SCRIPTED 21 intro frames และ evidence assets
- Ready: YES 0 / NEEDS_CONTENT_REVIEW 14 / CONDITIONAL 7; ทั้งหมดวาด draft เพื่อ review ได้ ไม่มี approved final ตาม source ณ HEAD
- Modes ของ target design: 19 scam stories เป็น text-capable (17 TEXT + 2 Call Center TEXT_OR_VOICE); 2 normal control drafts; voice-target 4 รวม controls. Current voice/NORMAL_CALL infrastructure มีแล้ว; Qwen-specific adapter และ target voice interaction UX รายเฟรมยังไม่ implement
- Planning estimate เท่านั้น: text 4–6 นาที, romance 6–8, voice scam 6–9; normal text 3–4 / voice 4–5 นาที

## วิธีใช้วาด

1. เลือก Story ID ใน [Flow Summary](../scenario-storyboard-flow-summary.md) อ่านแนวคิดและลำดับย่อ แล้วใช้ภาพสำคัญเป็นต้นร่าง
2. วาดตัวเลือกตรวจสอบ ยุติ คุยต่อ และยืนยันรายการจำลองให้เห็น ไม่บังคับทุกทางให้เดินผ่านทุกขั้น
3. เปิด Storyboard Drawing Flow ในไฟล์รายหมวดเพื่อดูข้อความเดียวกัน แล้วอ่าน A–D และรายละเอียดเฟรมเมื่อต้องการองค์ประกอบหรือบทพูดเพิ่ม
4. ใช้ชื่อหน้าจอกลางและข้อมูลสมมติ ไม่เปิดเผยคำเฉลยหรือป้ายเส้นทางให้ผู้เล่นเห็นก่อนเลือก
5. ตรวจผลลัพธ์กับข้อกำหนดระดับ 2 เมื่อออกแบบทางเลือกย่อย และปิดประเด็นที่ยังรอตรวจเนื้อหาก่อนอนุมัติฉบับสุดท้าย

## Storyboard index

| Story ID | Category | Title | Status | Mode | Frames | Branches | Estimated Time | Current Implementation | Ready for Drawing? |
|---|---|---|---|---|---:|---|---|---|---|
| [CC-01](01-call-center.md#cc-01) | Call Center | คดีปลอมบังคับโอนเงินเพื่อตรวจสอบ | CORE / PROPOSED | TEXT_OR_VOICE (target VOICE; FUTURE VOICE UX) | 13 | S2 / R2 / K1 | T 4–6 / V 6–9 นาที | ไม่มี dedicated flow | NEEDS_CONTENT_REVIEW |
| [CC-02](01-call-center.md#cc-02) | Call Center | สายธนาคารปลอมขอรหัสยืนยัน | DEMO / PROPOSED | TEXT_OR_VOICE (target interaction UX) | 13 | S2 / R2 / K1 | T 4–6 / V 6–9 นาที | SCAM_CALL v1 ใกล้เคียง; text + voice infrastructure มีแล้ว ไม่ครบทุกเฟรม; live Azure NOT RUN | NEEDS_CONTENT_REVIEW |
| [CC-N01](01-call-center.md#cc-n01) | Call Center | สายยืนยันการจัดส่งปกติ | CONTROL / CONDITIONAL_CONTENT | TEXT_OR_VOICE (target interaction UX) | 8 | S2 / R0 / K0 | T 3–4 / V 4–5 นาที | Target control ยังไม่ implement; NORMAL_CALL ปัจจุบันเป็นห้องสมุด | CONDITIONAL |
| [CC-N02](01-call-center.md#cc-n02) | Call Center | สายธนาคารปกติแจ้งให้ตรวจสอบรายการ | CONTROL / CONDITIONAL_CONTENT | TEXT_OR_VOICE (target interaction UX) | 8 | S2 / R0 / K0 | T 3–4 / V 4–5 นาที | Target control ยังไม่ implement; NORMAL_CALL ปัจจุบันเป็นห้องสมุด | CONDITIONAL |
| [INV-01](02-investment.md#inv-01) | Investment | ลงทุนได้กำไรช่วงแรกแต่ถอนเงินติดค่าปลดล็อก | DEMO / PROPOSED | TEXT | 14 | S2 / R2 / K1 | T 4–6 นาที | investment-scam v1: partial generic text flow | NEEDS_CONTENT_REVIEW |
| [INV-02](02-investment.md#inv-02) | Investment | ลงทุนที่ให้ผลตอบแทนจากการชวนสมาชิก | CORE / CONDITIONAL_CONTENT | TEXT | 13 | S2 / R2 / K1 | T 4–6 นาที | ไม่มี dedicated flow | CONDITIONAL |
| [ROM-01](03-romance.md#rom-01) | Romance / Relationship | คนรักออนไลน์ขอเงินฉุกเฉิน | DEMO / PROPOSED | TEXT | 13 | S2 / R2 / K1 | T 6–8 นาที | romance-scam v1: partial emergency text flow | NEEDS_CONTENT_REVIEW |
| [ROM-02](03-romance.md#rom-02) | Romance / Relationship | ของขวัญจากคนรักติดค่าธรรมเนียมปลอม | CORE / PROPOSED | TEXT | 13 | S2 / R2 / K1 | T 6–8 นาที | ไม่มี dedicated flow | NEEDS_CONTENT_REVIEW |
| [ECO-01](04-ecommerce.md#eco-01) | E-commerce / Online Shopping | ร้านค้าชวนจ่ายนอกระบบแล้วไม่ส่งสินค้าตามตกลง | DEMO / PROPOSED | TEXT | 12 | S2 / R2 / K1 | T 4–6 นาที | ecommerce-scam v1: partial buyer text flow | NEEDS_CONTENT_REVIEW |
| [ECO-02](04-ecommerce.md#eco-02) | E-commerce / Online Shopping | พัสดุเก็บเงินปลายทางที่ไม่ได้สั่ง | CORE / PROPOSED | TEXT | 12 | S2 / R2 / K1 | T 4–6 นาที | ไม่มี dedicated flow | NEEDS_CONTENT_REVIEW |
| [ECO-03](04-ecommerce.md#eco-03) | E-commerce / Online Shopping | ผู้ขายถูกหลอกด้วยหลักฐานชำระเงินปลอม | CORE / CONDITIONAL_CONTENT | TEXT | 12 | S2 / R2 / K1 | T 4–6 นาที | ไม่มี dedicated flow | CONDITIONAL |
| [PHI-01](05-sms-phishing.md#phi-01) | SMS / Phishing | ข้อความพาไปแบบฟอร์มขโมยข้อมูล | DEMO / PROPOSED | TEXT | 12 | S2 / R2 / K1 | T 4–6 นาที | sms-phishing-demo v4: text; storyboard ใหม่ไม่ใช่การคัดลอก state | NEEDS_CONTENT_REVIEW |
| [PHI-02](05-sms-phishing.md#phi-02) | SMS / Phishing | ข้อความบริการปลอมพาไปติดตั้งแอป | CORE / PROPOSED | TEXT | 12 | S2 / R2 / K1 | T 4–6 นาที | ไม่มี dedicated flow | NEEDS_CONTENT_REVIEW |
| [TASK-01](06-task.md#task-01) | Task Scam | ทำภารกิจแล้วต้องเติมเงินเพื่อถอนค่าตอบแทน | DEMO / PROPOSED | TEXT | 13 | S2 / R2 / K1 | T 4–6 นาที | task-scam v1: partial deposit text flow | NEEDS_CONTENT_REVIEW |
| [LOAN-01](07-fake-loan.md#loan-01) | Fake Loan | สินเชื่ออนุมัติแต่ต้องจ่ายก่อนรับเงิน | CORE / PROPOSED | TEXT | 12 | S2 / R2 / K1 | T 4–6 นาที | ไม่มี dedicated flow | NEEDS_CONTENT_REVIEW |
| [LOAN-02](07-fake-loan.md#loan-02) | Fake Loan | แอปเงินกู้ขอข้อมูลเครื่องและข่มขู่ผ่านคนใกล้ชิด | DEMO / CONDITIONAL_CONTENT | TEXT | 12 | S2 / R2 / K1 | T 4–6 นาที | fake-loan-scam v1: partial; runtime critical คือ INSTALL_UNTRUSTED_APP ไม่ใช่ contacts threshold ที่เสนอ | CONDITIONAL |
| [REC-01](08-recovery.md#rec-01) | Recovery Scam | ตามเงินคืนแต่เรียกค่าดำเนินการเพิ่ม | CORE / PROPOSED | TEXT | 12 | S2 / R2 / K1 | T 4–6 นาที | ไม่มี dedicated flow | NEEDS_CONTENT_REVIEW |
| [REC-02](08-recovery.md#rec-02) | Recovery Scam | แอปแจ้งความหรือช่วยเงินคืนที่ขอควบคุมเครื่อง | DEMO / CONDITIONAL_CONTENT | TEXT | 12 | S2 / R2 / K1 | T 4–6 นาที | recovery-scam v1: partial remote request; ไม่ยืนยัน content approval | CONDITIONAL |
| [JOB-01](09-job.md#job-01) | Job Scam | งานปลอมเรียกค่าสมัครหรือค่าอบรม | DEMO / PROPOSED | TEXT | 12 | S2 / R2 / K1 | T 4–6 นาที | job-scam v1: partial fee-before-job | NEEDS_CONTENT_REVIEW |
| [JOB-02](09-job.md#job-02) | Job Scam | รับสมัครงานเพื่อเก็บเอกสารเกินจำเป็น | EXTENDED / CONDITIONAL_CONTENT | TEXT | 12 | S2 / R2 / K1 | T 4–6 นาที | ไม่มี dedicated flow | CONDITIONAL |
| [JOB-03](09-job.md#job-03) | Job Scam | งานรับและส่งต่อเงินผ่านบัญชีส่วนตัว | CORE / PROPOSED | TEXT | 12 | S2 / R2 / K1 | T 4–6 นาที | ไม่มี dedicated flow | NEEDS_CONTENT_REVIEW |

Status DEMO/CORE/EXTENDED/CONTROL คือ selection tier จาก bank ไม่ใช่ approval. CONDITIONAL_CONTENT เป็น approval gate อีกแกนหนึ่ง; JOB-02 ยังคง EXTENDED. Safe branch เป็นชื่อเส้นทาง ไม่รับรอง PASSED หากมี N/U จากการตัดสินใจก่อนหน้า

## Files

- [Call Center](01-call-center.md)
- [Investment](02-investment.md)
- [Romance / Relationship](03-romance.md)
- [E-commerce / Online Shopping](04-ecommerce.md)
- [SMS / Phishing](05-sms-phishing.md)
- [Task Scam](06-task.md)
- [Fake Loan](07-fake-loan.md)
- [Recovery Scam](08-recovery.md)
- [Job Scam](09-job.md)

[Master review, pending register และ QA](../scenario-storyboard-spec.md#master-review)
