# แผนงาน Call Center: Post-Decision Tutorial และ Incident Recovery Guidance

สถานะ: **READY_TO_IMPLEMENT — เอกสารแผนงาน ยังไม่ได้เริ่ม implementation**

- วันที่จัดทำ: 25 ตุลาคม 2026
- Repository: `9Tanaka/Project_mitjee`
- Branch: `feat/rule-based-evaluation`
- Local source baseline: `2a6fcb705969dfc94d458cd372b72615f336fe42`
- GitHub branch ที่ตรวจในรอบออกแบบ: `ec5b180313ca347e3ff9e9f5ace2034685e706d3`
- โค้ด Call Center, evaluator และ Result ที่ใช้ออกแบบตรงกันระหว่างสอง commits ข้างต้น
- เอกสารนี้ระบุสิ่งที่จะทำ ไม่ใช่รายงานว่าฟีเจอร์ใหม่เสร็จแล้ว และไม่ใช่ requirement ที่อ้างจาก Proposal

## 1. ขอบเขตและสิ่งที่ต้องรักษา

ทำเฉพาะ Call Center ที่มีอยู่จริงใน runtime ผู้เรียนเลือกผ่าน public scenario `call-center` โดย Backend เป็นผู้เลือกเรื่องและ variant

| เรื่อง | Template / version | เนื้อหาที่มีอยู่จริง |
| --- | --- | --- |
| CC-01 | `call-center-parcel` v6 / `SCAM_CALL` | อ้างพัสดุเกี่ยวข้องกับคดี กดดัน และขอโอนเงินจำลอง 9,300 บาท |
| CC-02 | `call-center-bank` v6 / `SCAM_CALL` | อ้างรายการธนาคารผิดปกติ เร่งให้ทำตาม และขอ OTP จำลอง |
| CC-N01 | `call-center-parcel` v6 / `NORMAL_CALL` | แจ้งพัสดุและยืนยันหรือเปลี่ยนช่วงจัดส่ง |
| CC-N02 | `call-center-bank` v6 / `NORMAL_CALL` | แจ้งรายการธนาคารทั่วไปและรับทราบข้อมูล |

ไม่ขยายอีกแปดหมวด ไม่สร้างเนื้อหาชุด 21 เรื่อง ไม่ปรับบทสนทนา/provider และไม่เพิ่ม Voice, STT, TTS, streaming หรือ protocol

Hard invariants:

- PostgreSQL persistence architecture อยู่ในสถานะ COMPLETE / FROZEN
- ไม่แก้ repository semantics, transactions, isolation, CAS/revision, ownership, expiry, replay/idempotency หรือ rollback
- ไม่แก้ State Machine, EventValidator, critical-failure rules หรือ Core authority
- ไม่แก้ `DECISION_RULES_V1`, outcome categories หรือ `trainingScore=null`
- ไม่สร้างคะแนน D/W/S ใหม่ ผล categorical ปัจจุบันยังมี D/W/S เป็น `null`
- ไม่เปลี่ยนอำนาจของ AI/Qwen, STT หรือ TTS
- ไม่แก้ published templates v1–v6 ไม่ทำ schema/migration และไม่สร้าง integrity protocol ใหม่
- ไม่ deploy, cut over production, commit หรือ push เพียงเพราะมีเอกสารแผนงานนี้

## 2. ข้อเท็จจริงจาก runtime

เรื่องหลอกลวงมี states:

```text
INCOMING_CALL / CALL_CONNECTED / IDENTITY_CLAIM / CONTEXT_CLAIM
PRESSURE / MAIN_REQUEST / PLAYER_DECISION / INDEPENDENT_VERIFICATION
CALL_ENDING / END_SCENARIO
```

เรื่องปกติไม่มี `PRESSURE` และ `PLAYER_DECISION` รายการนี้เป็น state set ไม่ใช่เส้นทางที่ต้องผ่านทุกจุด

### Checkpoints

| Checkpoint | เรื่องที่ใช้ | Signal จาก caller turn ที่ commit แล้ว |
| --- | --- | --- |
| `cp-CONTEXT_CLAIM` | ทั้งสี่เรื่อง | `VERIFY_CONTEXT` |
| `cp-PRESSURE` | CC-01 / CC-02 | `URGENCY_PRESSURE` หรือ `SECRECY_PRESSURE` |
| `cp-MAIN_REQUEST` | CC-01 | `TRANSFER_REQUEST` |
| `cp-MAIN_REQUEST` | CC-02 | `OTP_REQUEST` |
| `cp-MAIN_REQUEST` | CC-N01 | `DELIVERY_CONFIRMATION` |
| `cp-MAIN_REQUEST` | CC-N02 | `TRANSACTION_NOTIFICATION` |

ทุก checkpoint ของ Call Center v6 เป็น `skill: D` ไม่มี W/S checkpoint แยก จึงห้ามกล่าวว่าผู้เรียนพิสูจน์การระบุ warning signs หรือได้คะแนน W/S แล้ว

`CALL_CONNECTED` และ `IDENTITY_CLAIM` ไม่มี checkpoint ที่ต้องเพิ่ม feedback ใหม่

### Choices และ assessment เดิม

| Choice / action | ขอบเขต | Assessment เดิม |
| --- | --- | --- |
| `caution` | ทุก checkpoint | SAFE |
| `end` / `callback` | ปิด checkpoint ที่เปิดอยู่ผ่าน phone control | SAFE |
| `checked` | CONTEXT_CLAIM หลังตรวจข้อมูลในแอปของตนเองแล้ว | SAFE |
| `trust` | Checkpoints ของเรื่องหลอกลวง | REVIEW |
| `refuse` | MAIN_REQUEST ของเรื่องหลอกลวง | SAFE |
| `confirm` / `reschedule` / `limit` | MAIN_REQUEST ของ CC-N01 | SAFE |
| `acknowledge` | MAIN_REQUEST ของ CC-N02 | SAFE |
| Explicit simulated transfer / OTP confirmation | MAIN_REQUEST ของเรื่องหลอกลวง | CRITICAL |

`caution` ต้องคง SAFE ตาม evaluator เดิม แม้จะสอนการตรวจสอบเพิ่มเติมได้ ห้ามใช้ Tutorial เปลี่ยนผลเป็น REVIEW และไม่ย้าย hang-up/callback กลับเข้า decision popup

### Backend-confirmed actions / events

| หลักฐาน | ความหมายที่อธิบายได้ |
| --- | --- |
| `CHECKED_EXISTING_ORDER` / `CHECKED_TRANSACTION` | ตรวจข้อมูลจำลองในแอปที่มีอยู่เอง |
| Choice `checked` + `VERIFY_SOURCE` | เปรียบเทียบข้อมูลแล้ว ไม่ใช่โทรยืนยันกับองค์กรจริง |
| `CALLED_OFFICIAL_CHANNEL` | ตั้งใจจบสายเพื่อตรวจต่อ ไม่ใช่ตรวจสำเร็จ และ choice นี้ไม่สร้าง `VERIFY_SOURCE` |
| `HUNG_UP` / `END_CONTACT` เมื่อปิด opportunity ที่เปิดอยู่ | ยุติการติดต่อ ไม่ยืนยันตัวตนผู้โทร |
| `REFUSE_TRANSFER` / `REFUSE_OTP` | ปฏิเสธคำขอตามตัวเลือกที่ Backend รับรอง |
| `OPENED_*` / `VIEWED_*` / `PREPARED_*` | เปิด ดู หรือเตรียม ยังไม่ใช่ harmful action |
| `CONFIRM_UNVERIFIED_TRANSFER` | ยืนยันโอนเงินจำลองผ่าน critical rule |
| `DISCLOSE_OTP` | ยืนยันบอก OTP จำลองผ่าน critical rule |

บางรายการเป็น behavior ที่อ่านจาก `TrainingAction` ผ่าน `actionBehavior()` ไม่ใช่ `TrainingEvent` ทุกพฤติกรรม ห้ามสร้าง event เพิ่มเพื่อแสดง Tutorial

## 3. งานที่จะทำ: Checkpoint Feedback

สร้างรายละเอียดหลัง final Result สำหรับแต่ละ checkpoint ที่ปรากฏในผลเดิม:

1. ผู้เรียนเลือกหรือทำอะไรจริง
2. Assessment เดิม: SAFE / REVIEW / UNASSESSED / CRITICAL
3. เหตุผลเดิมจาก `publicFeedback` / `decisionSummary.checkpoints`
4. ทางเลือกที่ปลอดภัยกว่า หรือสิ่งที่ควรตรวจเพิ่ม

ใช้ action ที่ finalize opportunity หรือ critical action ที่เชื่อมกับ event จริง ไม่ใช้ AI intent เพื่อเขียนว่าได้กระทำแล้ว

| จุดที่ต้องอธิบาย | แนวทางเนื้อหา |
| --- | --- |
| รับฟังอย่างระมัดระวัง | การคุยต่อไม่ใช่ความผิด หากยังไม่ให้ข้อมูลหรือทำตามคำขอ |
| เชื่อคำกล่าวอ้าง | ข้อมูลจากผู้โทรเดิมยังไม่ใช่การยืนยันจากช่องทางอิสระ |
| ตรวจรายการแล้ว | แยกการตรวจข้อมูลออกจากการยืนยันตัวตนหรือข้อกล่าวอ้างเรื่องคดี |
| เลือก callback | เป็นความตั้งใจจะตรวจต่อ ยังไม่มีหลักฐานว่าติดต่อสำเร็จ |
| ปฏิเสธคำขอโอน / OTP | อธิบายการรักษาขอบเขตเงินและข้อมูล |
| ตอบเรื่องจัดส่ง / รับทราบรายการปกติ | อธิบายความเหมาะสมตามบริบท โดยไม่แต่งภัยขึ้นมา |
| Critical confirmation | ระบุการกระทำจำลองตรงรายการ ไม่สรุปความเสียหายแบบครอบจักรวาล |

ไม่ดึง checkpoints ในเส้นทางที่ไม่ได้เล่นมาแสดง และไม่เพิ่มเฉลยระหว่าง active call ใน phase นี้

## 4. งานที่จะทำ: Scenario Tutorial

เพิ่มเนื้อหาที่ Backend เขียนและ version ไว้ เลือกเฉพาะส่วนที่เกี่ยวข้องกับ committed caller turns ของ session

| เรื่อง | เนื้อหาหลัก |
| --- | --- |
| CC-01 | ข้ออ้างเรื่องพัสดุ/คดี การกดดัน และคำขอโอน เฉพาะช่วงที่ปรากฏจริง; ตรวจคำสั่งซื้อและติดต่อหน่วยงานผ่านช่องทางที่หาเอง |
| CC-02 | ข้ออ้างรายการผิดปกติ ความเร่งด่วน และคำขอ OTP เฉพาะช่วงที่ปรากฏจริง; เปรียบเทียบจำนวนเงิน เวลา และรายละเอียดรายการ |
| CC-N01 | การตรวจพัสดุ ยืนยัน/เปลี่ยนช่วงจัดส่ง และจำกัดข้อมูลตามบริบท |
| CC-N02 | การตรวจรายการและรับทราบข้อมูล โดยไม่ให้ข้อมูลลับ |

แต่ละบทมี: กลไก/บริบท, สิ่งที่ปรากฏในสาย, สิ่งที่ควรตรวจอย่างอิสระ, ข้อผิดพลาดที่ควรทบทวน และวิธีรับมือครั้งหน้า

การกรอง warning content:

- `SECRECY_PRESSURE`: อธิบายการขอให้เก็บเป็นความลับ
- `URGENCY_PRESSURE`: อธิบายการเร่งตัดสินใจ
- `TRANSFER_REQUEST`: อธิบายคำขอโอนตามข้ออ้าง
- `OTP_REQUEST`: อธิบายคำขอรหัส
- `VERIFY_CONTEXT`: อธิบายการตรวจบริบทตามเรื่อง ไม่ถือเป็น warning โดยอัตโนมัติในสายปกติ

ใช้ state + validated committed signal ไม่สแกนคำจากข้อความ AI ไม่ใช้ malformed/uncommitted output และไม่เติม signal ที่ไม่ได้ปรากฏ

ใช้ข้อความว่า “สิ่งที่ปรากฏในสายนี้” ไม่ใช่ “สัญญาณเตือนที่คุณตรวจพบแล้ว” เพราะ runtime ยังไม่ได้วัดการระบุ warning signs แยก

## 5. งานที่จะทำ: Incident Recovery Guidance

แสดงเฉพาะเมื่อมี harmful simulated action ที่ Backend รับรองแล้ว ไม่ถือว่าการรับสาย คุยต่อ เลือก trust หรือเปิดแอปเป็นความเสียหาย

### 5.1 MONEY_TRANSFERRED — CC-01 เท่านั้น

Trigger ต้องตรงกับ template/version/variant ที่ผูก content ไว้ และมี:

```text
ruleId = CONFIRM_SIMULATED_TRANSFER
eventCode = CONFIRM_UNVERIFIED_TRANSFER
authority = BACKEND_VALIDATED
critical = true
linked explicit SIMULATED_ACTION ที่ Backend ยอมรับ
```

เนื้อหาที่จะเขียน:

- `immediateActions`: หยุดโอนเพิ่ม ยุติการติดต่อ ติดต่อธนาคารต้นทางหรือ AOC 1441 โดยเร็ว
- `evidenceToPreserve`: หลักฐานโอน วันเวลา จำนวนเงิน บัญชีปลายทาง ประวัติการโทร/ข้อความ และข้ออ้างที่ใช้
- `officialHelp`: ธนาคารต้นทาง / AOC / ตำรวจ ผ่านแหล่งทางการที่ตรวจสอบแล้ว
- `accountRecoverySteps`: ตรวจรายการที่ไม่รู้จักและดำเนินการตามคำแนะนำธนาคาร ไม่สั่งล้างเครื่องหรือเปลี่ยนรหัสโดยอัตโนมัติจากการโอนอย่างเดียว
- `nextTimePrevention`: ตรวจสอบอย่างอิสระก่อนโอน ไม่โอนเพื่อพิสูจน์ความบริสุทธิ์ตามคำกล่าวอ้าง
- `retryRecommendation`: ทบทวนคำขอโอนและกลับไปฝึก Call Center

### 5.2 OTP_OR_CREDENTIAL_DISCLOSED — CC-02 เฉพาะ OTP

Trigger ต้องตรงกับ template/version/variant ที่ผูก content ไว้ และมี:

```text
ruleId = SHARE_SIMULATED_OTP
eventCode = DISCLOSE_OTP
authority = BACKEND_VALIDATED
critical = true
linked explicit SIMULATED_ACTION ที่ Backend ยอมรับ
```

เนื้อหาที่จะเขียน:

- `immediateActions`: หยุดบอกรหัส ยุติสาย และติดต่อธนาคารเจ้าของบัญชีผ่านช่องทางที่หาเอง แจ้งว่าได้เปิดเผย OTP
- `evidenceToPreserve`: เวลา ประวัติการโทร ข้อความ และบริบทธุรกรรม โดย MITJEE ไม่รับ OTP จริงจากผู้เรียน
- `officialHelp`: ธนาคาร/ผู้ให้บริการบัญชี และหน่วยงานรับแจ้งเหตุเมื่อพบความเสียหายหรือการใช้งานที่ไม่ได้อนุญาต
- `accountRecoverySteps`: ให้ผู้ให้บริการตรวจธุรกรรมและการเข้าถึงบัญชี และช่วยระงับ/กู้คืนตามข้อเท็จจริง
- `nextTimePrevention`: อ่านวัตถุประสงค์ของรหัส ไม่บอก OTP แก่ผู้ติดต่อ และตรวจข้ออ้างอย่างอิสระ
- `retryRecommendation`: ทบทวนความต่างระหว่างอ่านรหัสกับยืนยันเปิดเผยรหัส แล้วฝึก Call Center

ไม่สรุปว่าเปิดเผย OTP แล้วบัญชีถูกยึดหรือเสียเงินแน่นอน และไม่เพิ่มกรณีรหัสผ่านที่ runtime นี้ยังไม่มี

### ขอบเขต Recovery

- CC-N01 / CC-N02 ไม่มี harmful trigger จึงไม่มี Recovery card
- ไม่เพิ่มกรณีติดตั้งแอป ให้สิทธิ์ควบคุมเครื่อง หรือเปิดเผยข้อมูลส่วนบุคคล เพราะไม่มี confirmed action ดังกล่าวใน Call Center นี้
- ใช้ถ้อยคำ “หากเหตุการณ์ลักษณะนี้เกิดขึ้นจริง” ไม่กล่าวว่าผู้เรียนสูญเงินจริงจากแบบฝึก
- ไม่รับประกันได้เงินคืน ไม่สร้างขั้นตอนกฎหมายหรือกำหนดเวลาที่ไม่ได้ตรวจสอบ
- ลิงก์ช่วยเหลือเป็น authored official links ไม่ใช่ลิงก์จาก AI และไม่ติดต่อหน่วยงานแทนผู้เรียน

## 6. Minimal Technical Design

เพิ่ม backend content registry แยกจาก published template เพื่อไม่แก้ v6 ที่ immutable แล้ว:

```text
session pinned templateId + templateVersion + variant
  → exact immutable content binding
  → existing result + finalized actions + validated events + committed turns
  → read-only guidance projection
  → optional public postDecisionGuidance
  → Result UI
```

ไม่เลือก content แบบ latest โดยอัตโนมัติ เปลี่ยนเนื้อหาต้องมี version/binding ชัดเจน หาก session เก่าไม่มี mapping ให้คง Result เดิม

| Model ส่วนที่เพิ่ม | Fields ที่จำเป็น |
| --- | --- |
| Content identity | `contentId`, `contentVersion`, exact template tuple |
| Checkpoint guidance | existing `ruleId` → `saferAlternative` |
| Tutorial block | `id`, state/signal condition, explanation, warningSigns, independentVerification, commonMistakes, nextTimePrevention |
| Recovery definition | exact rule/event trigger, incidentType, immediateActions, evidenceToPreserve, officialHelp, accountRecoverySteps, nextTimePrevention, retryRecommendation |
| Source metadata | official URLs และวันที่ตรวจเนื้อหา |

Public `postDecisionGuidance` เพิ่มเพียง opaque content reference/version, สิ่งที่เลือกจริงและ safer alternative ที่เชื่อมกับ `ruleRef` เดิม, tutorial blocks ที่กรองแล้ว และ recovery guides ที่ผ่าน trigger

นำ `decisionSummary.checkpoints`, assessment, explanation, `publicFeedback` และ `recommendation` เดิมมาใช้ ไม่แก้ stored `TrainingResult` หรือสร้าง evaluator ใหม่

ไม่ส่ง registry ทั้งชุด, answer keys, hidden story ID, internal triggers, action fingerprints หรือข้อมูลรหัสไป browser

## 7. Result Page ที่จะทำ

1. **ผลการฝึก** — outcome เดิม พร้อมขอบเขตว่าเป็นผลของเส้นทางนี้
2. **สิ่งที่คุณตัดสินใจในเส้นทางนี้** — การเลือก/ยืนยันจริงตามลำดับ
3. **ทำไมจึงปลอดภัย/ควรทบทวน** — explanation เดิมและ safer alternative
4. **สัญญาณเตือนที่พบในสถานการณ์** — เฉพาะสิ่งที่ปรากฏจริง; สายปกติใช้คำอธิบายการตรวจข้อมูล
5. **วิธีรับมือที่เหมาะสม** — สอดคล้องกับบริบทที่พบ
6. **ถ้าเหตุการณ์นี้เกิดขึ้นจริง** — เฉพาะ confirmed harmful trigger
7. **ครั้งหน้าควรทำอย่างไร** — รายการสั้นที่นำไปใช้ได้
8. **ปุ่มดำเนินการ** — ลองสถานการณ์นี้อีกครั้ง / ทบทวนบทเรียน / กลับหน้าเลือกสถานการณ์

“ทบทวนบทเรียน” ใช้ anchor ไป Tutorial ในหน้านี้ก่อน ไม่อ้างว่าคลังความรู้ preview เป็นบทเรียนจริง ส่วน retry กลับหน้าเตรียมฝึก Call Center ผ่าน safety acknowledgment เดิม Backend ยังเลือกเรื่อง จึงไม่รับประกันว่าได้เรื่องเดิมทุกครั้ง

| Outcome / lifecycle | การแสดงผล |
| --- | --- |
| PASSED | เน้นการตัดสินใจที่ทำได้ดีและการป้องกัน ไม่ใช้ถ้อยคำผู้เสียหาย |
| NEEDS_PRACTICE | เน้น REVIEW ที่พบจริง พร้อม safer alternative ไม่ถือว่าเกิด harm จาก REVIEW อย่างเดียว |
| CRITICAL_FAILURE | ระบุ confirmed action และ Recovery ตรงประเภท |
| UNASSESSED | อธิบายว่ายังไม่มีการประเมินเพียงพอ ไม่อ้างว่าถูกหลอกหรือพลาด checkpoint อนาคต |
| ABANDONED / EXPIRED | คงพฤติกรรมไม่มี Official TrainingResult ไม่สร้างผลหรือ guidance สมมติ |

การปฏิเสธสายเป็น ABANDONED ส่วนวางสายหลังรับสายก่อนถึงจุดสำคัญอาจได้ UNASSESSED ตาม runtime เดิม

## 8. Trigger และ Authority Rules

1. สร้าง guidance หลังผ่าน ownership/Result guard เดิมเท่านั้น
2. อ่านจาก snapshot และ pinned template version ของ session
3. ไม่ดึง checkpoints ที่ไม่อยู่ใน result summary มาเติม
4. อธิบาย choice จาก finalized action หรือ critical action ที่เชื่อมกับ event
5. ใช้ committed caller signal เป็นหลักฐานการปรากฏของสถานการณ์ ไม่ใช้เป็น assessment หรือ harm trigger
6. Authored fallback ที่ commit สำเร็จใช้ประกอบ Tutorial ได้ตาม state/signal
7. Recovery ต้องตรง exact binding, rule, event, backend authority และ linked explicit action
8. ไม่ใช้ outcome อย่างเดียว, AI candidate, confidence หรือ keyword เป็น trigger
9. ไม่ตรวจ fresh-confirmation guard ซ้ำบน session ที่จบแล้ว ใช้หลักฐานที่ผ่าน Backend ตอน commit
10. Projection ไม่มี repository write และไม่เปลี่ยน revision, state, events, opportunities, result หรือ recommendation
11. Refresh/replay ให้ guidance เดิม ไม่สร้างรายการหรือเหตุการณ์ซ้ำ
12. ไม่มี content mapping ให้แสดง Result เดิม; mapping ที่ผิดต้องถูกจับใน validation/tests ก่อนเผยแพร่

## 9. ลำดับ implementation

- [ ] เพิ่ม typed learning-content model และ exact version bindings
- [ ] เขียน authored content ครบสี่เรื่องตาม checkpoint/action ที่มีอยู่
- [ ] เพิ่ม content validation และ coverage tests สำหรับ choices/rules/signals
- [ ] เพิ่ม read-only projection โดย reuse explanation และ ruleRef เดิม
- [ ] เพิ่ม optional public DTO/schema โดยไม่แก้ stored result
- [ ] จัดหน้า Result ตามแปดส่วน และเพิ่ม retry/tutorial navigation
- [ ] เพิ่ม unit, integration และ UI tests
- [ ] ตรวจภาษา เนื้อหาช่วยเหลือ และ official links
- [ ] รัน regression, typecheck, production build และ client audit
- [ ] ตรวจ responsive 375 / 768 / 1440px แล้วเตรียม diff ให้ตรวจ

## 10. ไฟล์ที่คาดว่าจะเพิ่มหรือแก้

| ไฟล์ | งาน |
| --- | --- |
| ใหม่: `src/fixtures/call-center-learning-content.ts` | Immutable authored content สำหรับสี่เรื่อง |
| ใหม่: `src/application/post-decision-guidance.ts` | Model, mapping validation และ read-only projection |
| `src/application/contracts.ts` | Optional public guidance type |
| `src/application/projections.ts` | ประกอบ guidance หลัง Result guard และ reuse ruleRef |
| `src/public-api/contracts.ts` | Validate optional guidance response |
| `src/frontend/result.tsx` | Result layout และ conditional guidance |
| ใหม่: tests สำหรับ content/projection/Result UI | Coverage, filtering, authority, compatibility และ privacy |
| เอกสารฟีเจอร์ | อัปเดตสถานะ ข้อจำกัด และเนื้อหาที่ version ไว้ |

ไม่คาดว่าจะต้องแก้ `src/core.ts`, evaluator, template fixtures เดิม, persistence, Prisma schema, migrations, provider, speech หรือ protocol

## 11. Test Plan และ Acceptance Criteria

- [ ] ทุก v6 checkpoint choice และ critical rule ที่เกี่ยวข้องมี content mapping ครบ
- [ ] แสดง selected action จริง รวม phone-control exit และ callback โดยไม่อ้างว่า verify สำเร็จเกินหลักฐาน
- [ ] SAFE/REVIEW/CRITICAL และ outcome ทุกประเภทตรงกับผลเดิม
- [ ] จบก่อน PRESSURE/MAIN_REQUEST แล้วไม่แสดงว่าสัญญาณเหล่านั้นเกิดขึ้น
- [ ] ไม่เพิ่มข้อความว่าขอเก็บความลับ หากไม่มี signal นั้น
- [ ] Normal stories ไม่มี scam-only content หรือ Recovery ที่แต่งขึ้น
- [ ] Confirmed transfer เปิดเฉพาะ money-transfer recovery
- [ ] Confirmed OTP disclosure เปิดเฉพาะ OTP recovery
- [ ] Free text, AI candidate แม้ confidence สูง, trust, เปิดแอป, อ่านรหัส, ดูรายละเอียด และ prepare ไม่เปิด Recovery
- [ ] Committed authored fallback ให้ Tutorial ตรง signal
- [ ] Critical checkpoint ไม่ถูกแสดงซ้ำเป็น unassessed checkpoint ที่ขัดกัน
- [ ] Historical session ที่ไม่มี mapping ยังอ่าน Result เดิมได้
- [ ] Refresh/replay ให้ content เดิม ไม่เกิด write หรือ duplicate guidance
- [ ] Projection ไม่เปลี่ยน snapshot, state, revision, events, opportunities, result หรือ recommendation
- [ ] Public DTO ไม่มี hidden trigger/rule configuration, fingerprints, hidden story ID หรือรหัสจริง
- [ ] UI แสดง Recovery ตามเงื่อนไข พร้อมปุ่ม retry/tutorial/list ที่ใช้งานได้
- [ ] UI ที่ 375 / 768 / 1440px อ่านได้ ไม่มี horizontal overflow และใช้ keyboard ได้
- [ ] ไม่มีการเปลี่ยนพฤติกรรมหมวดอื่นหรือ persistence

Verification ที่จะรันเมื่อ implement:

```text
npm run prisma:generate
npm run prisma:validate
npm run typecheck
npm test
npm run test:frontend
npm run build
npm run audit:client
git diff --check
```

รัน tests ใหม่เฉพาะฟีเจอร์แยกด้วย และทดสอบ browser บน local production build ตามขนาดจอข้างต้น ไม่อ้างผล Mock ว่าเป็น live-provider verification

### Baseline ที่ตรวจแล้วในรอบออกแบบก่อนสร้างเอกสาร

```text
tests/call-continuous.test.ts
tests/call-behavior-stories.test.ts
tests/call-stories.test.ts
tests/decision-rules.test.ts

81 passed / 81
```

ผลนี้เป็น regression ของระบบเดิม ไม่ใช่ผลทดสอบฟีเจอร์ใหม่ และไม่ได้หมายความว่าทำ implementation แล้ว

## 12. แหล่งข้อมูลและข้อจำกัด

Source of truth ของ runtime:

- [Catalog](../src/application/catalog.ts)
- [Story content](../src/fixtures/call-center-stories.ts)
- [Behavior branches v5](../src/fixtures/call-center-behavior-stories.ts)
- [Continuous conversation v6](../src/fixtures/call-center-continuous-stories.ts)
- [Scoring / outcome semantics](../src/domain/scoring.ts)
- [Critical action validation](../src/domain/critical-failure.ts)
- [Confirmed action behaviors](../src/domain/call-behavior.ts)
- [Current Result projection](../src/application/projections.ts)
- [Current Result UI](../src/frontend/result.tsx)

แหล่งทางการสำหรับตรวจและเขียน recovery content:

- [ธนาคารแห่งประเทศไทย: ภัยทุจริตทางการเงินยุค AI และการรับมือเมื่อพลาดโอนเงิน](https://www.bot.or.th/th/research-and-publications/articles-and-publications/bot-magazine-issues/phrasiam-69-1/Financial-fraud-in-the-age-of-AI.html)
- [ธนาคารแห่งประเทศไทย: กลโกงธนาคารออนไลน์](https://www.bot.or.th/th/satang-story/fraud/online-fraud.html)
- [ETDA: ทำธุรกรรมทางการเงินผ่าน Smartphone อย่างไรให้ปลอดภัย](https://www.etda.or.th/getattachment/557d2df6-0257-4357-a460-ed027480b04f/ebookSmartphoneFullversion.aspx)

ต้องตรวจ official links และคำแนะนำอีกครั้งก่อนเผยแพร่ content จริง โดยเฉพาะแหล่งที่เผยแพร่มานาน ไม่มี AI เป็นผู้เลือกหรือสร้าง authoritative recovery instructions

ข้อจำกัดที่ยอมรับใน phase นี้: ไม่สร้าง CMS/คลังบทเรียนเต็มระบบ ไม่เพิ่มการตรวจ warning signs แยก ไม่รองรับ harmful actions ที่ไม่มีใน runtime และไม่เพิ่ม exact-story retry endpoint

## 13. เงื่อนไขจบงาน

เมื่อได้รับคำสั่งให้ implement ให้ทำเฉพาะแผนนี้จน tests และ verification ที่เกี่ยวข้องผ่าน แล้วส่ง diff และผลตรวจให้ review ไม่เริ่ม phase ถัดไป ไม่ deploy Production และไม่ขยาย persistence optimization

**READY_TO_IMPLEMENT**
