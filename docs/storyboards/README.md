# MITJEE Storyboard Index

อ่าน [ข้อกำหนดร่วมและ master review](../scenario-storyboard-spec.md) ก่อนใช้เฟรมเพื่อวาด ทุกไฟล์เป็น CONTENT + INTERACTION DESIGN ONLY ไม่มี application implementation

- Branch: `feat/rule-based-evaluation`; local และ remote ณเริ่ม: `105fe8395f86cc936d808ecba0cf7643aeaf19af`
- Source: [Story Bank](../scenario-story-bank.md) และ [Deduplication](../scenario-deduplication-report.md) ที่ HEAD จริง; ไม่ใช้รายชื่อประมาณจาก prompt แทน source
- Coverage: 9 หมวด / 19 scam families / 2 normal controls / 252 frames
- Branch counts: Safe 42 (38 scam + 4 control), Review 38, Critical-candidate 19 (proposed ไม่ใช่ approved critical events)
- Ownership: QWEN_GENERATED 109 frames, BACKEND_SYSTEM 122 frames รวม result read-only; เฟรมที่มี VALIDATED_ACTION 101; SCRIPTED 21 intro frames และ evidence assets
- Ready: YES 0 / NEEDS_CONTENT_REVIEW 14 / CONDITIONAL 7; ทั้งหมดวาด draft เพื่อ review ได้ ไม่มี approved final ตาม source ณ HEAD
- Modes: 19 scam stories เป็น text-capable (17 TEXT + 2 Call Center TEXT_OR_VOICE); 2 normal controls text-capable ใน draft; voice-target 4 รวม controls; current voice/normal/Qwen ยังไม่ implement
- Planning estimate เท่านั้น: text 4–6 นาที, romance 6–8, voice scam 6–9; normal text 3–4 / voice 4–5 นาที

## วิธีใช้วาด

1. เลือก Story ID แล้วอ่าน A–D เพื่อรู้บทบาท ชื่อหน้าจอ และสิ่งที่ตัวละครรู้
2. ใช้ Frame summary เลือกทางหลัก แล้ววาดตาม Visual / UI และ Camera / screen focus; จำนวน frame ไม่ใช่จำนวน State
3. วาด branch S/R/K ตาม O พร้อม confirmation และผลตามกฎ; example message เป็น DRAFT ไม่ใช่ full dialogue หรือ training target
4. ตรวจ warning กับ neutral เฉพาะมุมผู้เขียน; ผู้เล่นต้องไม่เห็นสี/ป้ายเฉลยก่อนตัดสินใจ
5. ปิดประเด็น [DETAIL_PENDING] และ CONDITIONAL_CONTENT ก่อนอนุมัติ final หรือเริ่ม implementation

## Storyboard index

| Story ID | Category | Title | Status | Mode | Frames | Branches | Estimated Time | Current Implementation | Ready for Drawing? |
|---|---|---|---|---|---:|---|---|---|---|
| [CC-01](01-call-center.md#cc-01) | Call Center | คดีปลอมบังคับโอนเงินเพื่อตรวจสอบ | CORE / PROPOSED | TEXT_OR_VOICE (target VOICE; FUTURE VOICE UX) | 13 | S2 / R2 / K1 | T 4–6 / V 6–9 นาที | ไม่มี dedicated flow | NEEDS_CONTENT_REVIEW |
| [CC-02](01-call-center.md#cc-02) | Call Center | สายธนาคารปลอมขอรหัสยืนยัน | DEMO / PROPOSED | TEXT_OR_VOICE (target VOICE; FUTURE VOICE UX) | 13 | S2 / R2 / K1 | T 4–6 / V 6–9 นาที | call-center-scam v1: TEXT เท่านั้น; คล้ายธนาคารขอ OTP | NEEDS_CONTENT_REVIEW |
| [CC-N01](01-call-center.md#cc-n01) | Call Center | สายยืนยันการจัดส่งปกติ | CONTROL / CONDITIONAL_CONTENT | TEXT_OR_VOICE (FUTURE VOICE UX) | 8 | S2 / R0 / K0 | T 3–4 / V 4–5 นาที | ไม่ implement | CONDITIONAL |
| [CC-N02](01-call-center.md#cc-n02) | Call Center | สายแจ้งเตือนนัดหมายปกติ | CONTROL / CONDITIONAL_CONTENT | TEXT_OR_VOICE (FUTURE VOICE UX) | 8 | S2 / R0 / K0 | T 3–4 / V 4–5 นาที | ไม่ implement | CONDITIONAL |
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
