# Legacy Weighted Scoring

STATUS: HISTORICAL RESULT POLICY FOR PUBLISHED SCENARIO VERSIONS 1 AND 2

New SMS / Phishing sessions use [Decision Evaluation](decision-evaluation.md). This page documents the original rule for historical sessions and results. Proposal v6 still describes weighted scoring; the user's later approved chat requirement supersedes it for new scenario versions.

[กลับ README](../README.md) · [Reference policy](architecture.md#reference-policy)

## Proposal Requirement

Proposal v4 หัวข้อ 4.1.4 และ 5.3.6 กำหนด D = Decision Score,
W = Warning Sign Score และ S = Safe Action Score เป็นคะแนนมาตรฐาน 0–100:

```text
Training Score = (D × 0.50) + (W × 0.30) + (S × 0.20)
Pass: Training Score >= 70 และไม่มี Critical Failure
```

Critical Failure override ทำให้ไม่ผ่านโดยไม่ใช้คะแนนรวมตัดสินให้ผ่าน
Backend เป็นผู้คำนวณ ไม่ใช่ AI และไม่มีการปรับความยากอัตโนมัติ
สัดส่วนนี้เป็นข้อกำหนดที่ใช้ในโครงงาน ไม่อ้างว่าได้รับการยืนยันเชิงทดลองภายนอก

## Implemented calculation

สำหรับ skill แต่ละชนิด ให้รวมเฉพาะ SessionOpportunity ของ skill นั้น:

```text
earned          = sum(opportunity.earned)
eligibleMaximum = sum(opportunity.eligibleMaximum)
normalized      = eligibleMaximum == 0 ? null : earned / eligibleMaximum × 100
```

| Skill | earned | eligibleMaximum |
|---|---|---|
| D | ผลรวมคะแนน choice ที่ finalize | ผลรวม maxScore ของ D ที่เปิดจริง |
| W | จำนวน correctWarningSignIds ที่เลือก | จำนวน evidence ที่เป็น warning sign จริงใน W opportunities ที่เปิด |
| S | ผลรวมคะแนน safe-action choice ที่ finalize | ผลรวม maxScore ของ S ที่เปิดจริง |

D checkpoint ใช้ 10/5/0 และเต็ม 10 ตาม Demo Assumption
S fixture ใช้เต็ม 10 และตัวเลือก 10/5/0 เช่นกัน แต่ schema รองรับ rubric ของ S ตาม Template
อย่าสับสนการมี Event กับคะแนน: ตัวเลือกเสี่ยงอาจไม่มี Event และ s1 ตัวเลือก 0 ยังสร้าง END_CONTACT ตาม fixture
คะแนนอ่านจาก Opportunity ที่ validate แล้ว ไม่ได้นับจำนวน Event ทุกชนิดรวมกัน

ไม่มี eligible opportunity ให้ normalized=null ไม่แทนด้วย 0 หรือเปลี่ยนน้ำหนักใหม่
earned ต้องเป็นค่าจำกัด ไม่ติดลบและไม่มากกว่าตัวหาร มิฉะนั้น INVALID_SCORE_DATA
ไม่ปัด Training Score ก่อนตรวจ >=70

## Eligibility and completeness

STATE_ENTRY เป็นนโยบายเปิด opportunity ของ Demo: เข้า State แล้วเปิดรายการของ State นั้นครั้งเดียว
ไม่ผ่าน create_pressure จึงไม่นับ w-extra ในตัวหาร
แต่ถ้าผ่านแล้วไม่ตอบ optional opportunity จะยังอยู่ในตัวหารและ earned=0
นี่เป็น eligibility ของ Backend ไม่ใช่ telemetry ยืนยันว่าผู้ใช้อ่านหลักฐานจริง แม้ Frontend จะแสดง Public Actions แล้ว

ทุก Safe Resolution path ที่จะสร้าง Official Result ต้องมี eligible D, W และ S ครบ
Template Validator ตรวจล่วงหน้า และ Scoring Engine ตรวจซ้ำตอนจบ
ถ้าข้อมูล Safe Resolution ไม่ครบ จะไม่สร้างผลผ่านจากการ reweight skill ที่เหลือ

## Terminal results and critical override

- COMPLETED + ไม่มี Critical Event: outcome PASSED เมื่อคะแนน >=70 มิฉะนั้น NOT_PASSED
- FAILED ต้องสัมพันธ์กับการมี Critical Event: outcome CRITICAL_FAILURE เสมอ
- ถ้าเกิด Critical Failure ก่อนมี D/W/S ครบ trainingScore=null; ถ้าครบแล้วอาจเก็บคะแนนรวมได้
  แต่คะแนนนั้นไม่มีสิทธิ์ลบล้าง outcome CRITICAL_FAILURE
- ACTIVE, ABANDONED และ EXPIRED ไม่สร้าง Official TrainingResult

Safe resolution เป็นการจบ path ไม่ใช่คำยืนยันว่าตอบถูกทุกข้อ
Core tests มีกรณีจบ COMPLETED ที่ได้ 25 คะแนน และกรณี 70 คะแนนพอดี

## Duplicate protection and Warning Sign limitation

Action ID เดิม/fingerprint เดิมไม่คิดคะแนนอีก
Opportunity ที่ finalize แล้วไม่รับคำตอบใหม่ แม้เปลี่ยน Action ID
WARNING_FINALIZE รับได้ครั้งเดียว เก็บทั้ง correctWarningSignIds และ incorrectEvidenceIds
ตัวเลือกว่าง finalize ด้วย 0; evidence ซ้ำหรือไม่รู้จักถูก reject

**Warning Sign false-positive ไม่มี penalty ใน MVP**
incorrectEvidenceIds ใช้ audit/result presentation เท่านั้น ไม่ถูกหักคะแนน
ดังนั้นเลือกหลักฐานครบทุกชิ้นอาจได้ W เต็ม แม้มีรายการที่ไม่ใช่สัญญาณเตือน
ห้ามเพิ่ม penalty formula เองหรืออ้างว่า Proposal กำหนดสูตรดังกล่าวแล้ว

## Weakest skills and recommendation

คำนวณจากผล Session ปัจจุบันเฉพาะ skill ที่ normalized ไม่เป็น null
เก็บ weakestSkills เป็น array; ความต่างน้อยกว่า 1e-10 ถือว่าเสมอใน implementation
เลือก recommendation เดียวด้วยลำดับ D → W → S ตาม Demo Assumption
Critical Failure ใช้ critical recommendation mapping แทนลำดับนี้

| ต่ำสุด | แนวทางจาก Proposal | สิ่งที่คืนแล้ว |
|---|---|---|
| D | ฝึกตัดสินใจ / สถานการณ์ประเภทเดิม | DECISION_PRACTICE |
| W | บทเรียนหรือแบบทดสอบสัญญาณเตือน | WARNING_SIGN_LESSON หรือ WARNING_SIGN_QUIZ ตาม Template |
| S | ตรวจสอบ ยุติการติดต่อ บล็อก เก็บหลักฐาน รายงานเหตุ | SAFE_ACTION_CONTENT |
| Critical | ทบทวนความปลอดภัยและกลับฝึกประเภทเดิม | CRITICAL_FAILURE_REVIEW |

คืน recommendationType, recommendationKey, reason เท่านั้น
Quiz/Knowledge Base เต็มระบบและแนวโน้มคะแนนย้อนหลังไม่เกิน 3 ครั้งตาม Proposal ยัง Planned

Evidence: [Scoring](../src/domain/scoring.ts), [constants](../src/domain/constants.ts),
[opportunities](../src/domain/session-opportunity.ts), [Core tests](../tests/core.test.ts),
[W limitation tests](../tests/core-hardening.test.ts)
