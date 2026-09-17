# AI / Dialogue Integration

STATUS: MOCK PROVIDER IMPLEMENTED; LIVE AI PROVIDER PLANNED / NOT IMPLEMENTED

[กลับ README](../README.md) · [Security](security.md)

## Provider contract

```typescript
interface ScenarioModelProvider {
  generateCharacterResponse(
    context: ScenarioAIContext,
    options?: { signal?: AbortSignal; requestId?: string }
  ): Promise<AICharacterResponse>;
}
```

MockScenarioModelProvider ใช้ข้อความ deterministic ตาม State และประวัติใน context
จำลอง normal, refusal, invalid output, error, timeout หรือคืน response fixture ได้
ไม่มี network client และไม่มี callback เข้า Core
ยังไม่มี Live OpenAI Provider, SDK integration, streaming หรือการทดสอบกับโมเดลจริง

## Immutable context

ScenarioAIContext มี scenario/template id/version/category/variant/title,
currentState, characterRole, allowedBehaviors, forbiddenBehaviors,
recentSanitizedMessages และ currentUserMessage
Orchestrator สร้างข้อมูลชุดใหม่แล้ว freeze แบบลึกก่อนส่งให้ Provider
ไม่ส่ง Core, repository, transitions, answer keys, scoring rules หรือคำสั่งเปิด Opportunity

Template version ที่ใช้ Dialogue ต้องมี characterRole; SMS fixture v2 มีแล้ว แต่ v1 ไม่มี
Provider ไม่เลือก variant หรือเปลี่ยนประเภทสถานการณ์เอง
Mock เป็นโค้ดที่เชื่อถือได้ใน process เดียวกัน ไม่ใช่ sandbox สำหรับ provider ที่เป็นโค้ดอันตราย

## Response schema and candidate event

AICharacterResponse เป็น strict schema:

| Field | ความหมาย |
|---|---|
| character_message | ข้อความตัวละคร หลัง trim ต้องยาว 1–8,000 code units |
| observed_intent | intent label ที่ schema อนุญาต ไม่ใช่คำสั่งให้ Core |
| candidate_event | NONE / WARNING_SIGN / SAFE_ACTION / DECISION / POSSIBLE_CRITICAL_FAILURE |
| event_code | code ใน Event Registry หรือ null |
| confidence | finite number หรือ null เป็น metadata เท่านั้น ไม่ใช่ threshold |
| safety | contains_real_pii และ out_of_scope เป็น flags ไม่ใช่ผลรับรองจาก detector |

NONE ต้องคู่กับ event_code=null; candidate ที่ไม่ใช่ NONE ต้องมี code
schema ไม่ยอมให้เพิ่ม field เช่น next_state หรือ score
Core นำ event_code/confidence ไปสร้าง AICandidateEvent projection โดยกำหนด sourceMessageId เอง
และใช้ opportunityId=null ใน Dialogue path; candidate_event/observed_intent ไม่ถูกใช้เป็น authoritative action
candidate ถูกตรวจแล้วได้ NO_EVENT / REJECTED / CLARIFICATION_REQUIRED โดยไม่สร้าง TrainingEvent
ไม่ใช้ confidence ตัดสินคะแนนหรือ Critical Failure

## Turn flow

1. Validate request และ sanitize user text
2. resume ตรวจ ownership/lifecycle; ถ้ามี receipt ของ turnId เดิมให้ตรวจ inputKey และ replay
3. สำหรับ turn ใหม่ ตรวจ ACTIVE/revision แล้วโหลด Template และ current State
4. สร้าง immutable context และเรียก Provider แบบมี deadline
5. ตรวจ response schema, safety flags และ sanitize character_message
6. ถ้า provider ใช้ไม่ได้ ใช้ fallbackMessage ของ State ที่สร้าง context
7. Core ตรวจ lifecycle/revision/idempotency อีกครั้ง, inspect candidate และ validate FREE_TEXT
8. commit FREE_TEXT Action + user/character messages + DialogueTurn receipt + revision ร่วมกัน
9. คืน DialogueReply หลัง commit สำเร็จเท่านั้น

การส่ง explicit command ใช้ performAction → Core.submit แยกจาก provider response
หลาย turn ใน State เดิมไม่ทำ Transition และไม่เพิ่มคะแนนเอง

## Timeout, retry and cancellation

ค่า Demo default: timeout 20 วินาทีต่อ attempt, retry อีกหนึ่งครั้ง รวมไม่เกินสอง attempts
แต่ละครั้งมี AbortController และ requestId รูปแบบ sessionId:turnId:attempt
ใช้ opaque IDs เท่านั้น ห้ามใส่ข้อมูลส่วนบุคคลใน identifiers
Orchestrator abort เมื่อ timeout; Mock รองรับทั้ง signal ที่ abort ไปแล้วและการ abort ระหว่าง timeout simulation
Live Provider ในอนาคตต้องส่ง signal ต่อให้ network client เอง
แม้ provider เพิกเฉยต่อ abort คำตอบที่ช้าก็ไม่มีช่องทาง commit หลัง deadline/fallback

REFUSAL, INVALID_OUTPUT, TIMEOUT และ ERROR ลองซ้ำหนึ่งครั้งแล้ว fallback หากยังล้มเหลว
SAFETY_BLOCKED ใช้ fallback ทันทีไม่ retry
fallback ไม่มี candidate และไม่มีคะแนน/Transition/Critical Failure จากเนื้อหาข้อความ
หาก Session หมดอายุหรือ stale ระหว่างรอ จะ reject commit แทนการใช้ fallback กลบ conflict
สอง timeout อาจรวมใกล้ 40 วินาที จึงไม่ใช่หลักฐานว่าผ่าน target AI latency <10 วินาที

receipt เก็บ attempts, usedFallback และ failureReason
retry สำเร็จอาจยังเก็บ failureReason จากครั้งก่อน แต่ usedFallback=false
ไม่เก็บ raw invalid response หรือ error body ของ provider

## Context limits and replay

Demo limits: ประวัติล่าสุด 12 messages, ประวัติแต่ละข้อความตัดที่ 2,000 code units,
current text สูงสุด 8,000 code units; หน่วยเป็น JavaScript string length ไม่ใช่ token budget
Mock อาจสะท้อนข้อความล่าสุดไม่เกิน 160 code units เป็น behavior ของ mock ไม่ใช่ระบบอ่านเจตนา
ดูรายละเอียด [Demo Assumptions](demo-assumptions.md)

turnId เดิมและ sanitized input เดิมคืน receipt โดยไม่เรียก Provider เพิ่ม หาก receipt มีอยู่แล้ว
turnId เดิมแต่ input ต่างกันได้ IDEMPOTENCY_CONFLICT
concurrent retries อาจเรียก Provider มากกว่าหนึ่งครั้ง แต่ commit ได้เพียงหนึ่ง receipt
receipt เดิมไม่ทำให้ Session ที่จบแล้วกลับ ACTIVE
request คนละ turn ที่ revision เดียวกันมีเพียงหนึ่งรายการชนะ; stale response ไม่มีสิทธิ์เขียนข้อความ

## Limitations

Local sanitizer ตรวจเฉพาะ patterns บางประเภท ไม่ใช่ production PII/moderation protection
ไม่มี dynamic evidence จาก AI, automatic clarification UI หรือ live-model compatibility guarantee
รายละเอียด boundary อยู่ใน [Security](security.md); [HTTP API boundary](api.md) implement แล้ว
Auth.js real identity provider ยัง Planned; HTTP message ผ่าน Orchestrator เดิมโดยไม่เพิ่ม authority ให้ AI

Evidence: [contracts](../src/dialogue/contracts.ts), [orchestrator](../src/dialogue/orchestrator.ts),
[mock](../src/dialogue/mock-provider.ts), [sanitizer](../src/dialogue/sanitize.ts),
[integration tests](../tests/dialogue.integration.test.ts)
