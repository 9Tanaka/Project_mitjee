# AI / Dialogue Integration

STATUS: MOCK + LIVE PROVIDER IMPLEMENTED / REAL OPENAI NETWORK NOT VERIFIED

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
OpenAIScenarioModelProvider เป็น outer adapter ที่ inject thin ResponsesClient ได้
ใช้ official SDK openai@7.21.0 กับ Responses API non-streaming เท่านั้น
Core/Domain/Dialogue ไม่มี SDK import; Provider ไม่มี Core/repository reference
Server composition เลือก provider แล้วส่งให้ createApplication(repository, provider); ไม่มี implicit Mock
ยังไม่มี streaming, Voice หรือการทดสอบกับโมเดลผ่านเครือข่ายจริง

## Configuration and model

- `AI_PROVIDER=mock`: deterministic local provider; ไม่มี OpenAI call
- `AI_PROVIDER=openai`: ต้องกำหนด `OPENAI_API_KEY` และ `OPENAI_MODEL` ผ่าน private server environment
- ค่าว่าง/ผิดหรือขาด key/model ทำให้ initialization fail ก่อนเปิด Training DB; ไม่เปลี่ยนเป็น Mock เงียบ ๆ
- HTTP คืน generic INTERNAL_ERROR ไม่คืนชื่อ config/key; ห้ามใช้ NEXT_PUBLIC_* สำหรับค่าเหล่านี้
- Endpoint ตรึงที่ https://api.openai.com/v1; ไม่อ่าน OPENAI_BASE_URL ไปเปลี่ยนปลายทาง
- SDK logging off; ไม่ส่ง organization/project จาก implicit environment และไม่มี browser configuration

ตรวจ Proposal v4 ซ้ำวันที่ 22 กันยายน 2026: runtime `gpt-5.4-mini`,
final-test snapshot `gpt-5.4-mini-2026-03-17`. Official model page ยังระบุ Responses API,
Structured Outputs และ snapshot นี้ ณ วันที่ตรวจ แต่ไม่ได้ยืนยันสิทธิ์เข้าถึงของบัญชี
ไม่มี default model หรือ silent substitution; tests ใช้ชื่อสมมติ ไม่ผูกกับ real model
หาก model ใช้ไม่ได้ ให้รายงานและขออนุมัติก่อนเปลี่ยน ไม่ implement provider สำรองอื่นใน phase นี้

## Request construction

instructions แบบคงที่กำหนดบทบาทตัวละครสมมติ ภาษาไทย current-state-only และ dialogue-only
developer message มีเฉพาะ allowlisted scenario id/version/category/variant/title, currentState,
characterRole, allowedBehaviors และ forbiddenBehaviors; user message เป็น JSON ของ sanitized
recent messages กับ current message ทั้งหมดถือเป็น untrusted dialogue ไม่ใช่คำสั่งระบบ
ไม่ส่ง message IDs, ownerId, account/email/hash, JWT/cookie/token, answer keys, weights,
decision mappings, critical rules, transition graph, guards, hidden opportunities หรือ recommendation internals
ไม่ serialize runtime context extras; adapter sanitize ซ้ำและคง limits 12/2,000/8,000

ไม่มี tools, external actions, previous_response_id หรือ full-history storage;
`store:false`, `stream:false`, `max_output_tokens:1200` เป็น technical cost bound ไม่ใช่ Proposal Requirement
Token cap รวม output budget ของ API; ความเพียงพอ/latency ยังไม่ได้ยืนยันกับโมเดลจริง
Incomplete output ถูก reject แล้วใช้ retry/fallback; ไม่เพิ่ม token budget เอง
`store:false` ไม่ใช่คำรับรอง Zero Data Retention หรือว่าผู้ให้บริการไม่เก็บ abuse-monitoring data
Prompt ไม่มี score/transition logic และไม่ใช่ production-grade prompt-injection protection

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
Responses `text.format` ใช้ strict json_schema ที่ derive จาก aiCharacterResponseSchema
จากนั้น parse output_text ทั้งก้อนด้วย JSON.parse (ไม่ใช้ regex ดึง JSON จาก prose)
และ validate schema/refinements ซ้ำทั้ง adapter และ Orchestrator
Refusal content part map เป็น ProviderRefusal ด้วยข้อความคงที่ ไม่ส่ง raw refusal ต่อ
Incomplete/failed envelope, tool output, หลาย text parts, malformed JSON หรือ field เกิน ถูก reject
Adapter-side invalid output/SDK error ใช้ OpenAIProviderError ข้อความคงที่ → existing ERROR category;
ไม่เพิ่ม error contract หรือเปลี่ยน Core. INVALID_OUTPUT เดิมยังใช้กรณี provider คืน invalid value ถึง Orchestrator
Raw output/error/refusal/usage/model request metadata ไม่ถูกเก็บหรือส่งออก public DTO
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
OpenAI adapter ส่ง signal เดิมให้ SDK และตรวจ abort ทั้งก่อน/หลัง await
SDK timeout เป็น backup 20 วินาที และ maxRetries=0 ทั้ง client/request (SDK default retry ถูกปิด)
Correlation ที่ออกไปเป็น HMAC แบบ opaque ใน X-Client-Request-Id ด้วย random per-process key
ไม่ส่ง raw sessionId/turnId หรือ PII; เปลี่ยน worker แล้ว correlation key เปลี่ยน
SDK cancellation เป็น best effort ต่อ transport ไม่รับประกันหยุด server-side generation หรือ billing
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
เพดานคือสอง network attempts ต่อ Orchestrator invocation ของ turn ใหม่ (SAFETY_BLOCKED หนึ่งครั้ง)
ไม่มี retry เพิ่มใน SDK; committed replay ศูนย์ requests
คำขอ concurrent ที่ยังไม่มี receipt จำนวน N อาจเรียกรวมถึง 2N ครั้ง; ยังไม่มี distributed in-flight coalescing
receipt เดิมไม่ทำให้ Session ที่จบแล้วกลับ ACTIVE
request คนละ turn ที่ revision เดียวกันมีเพียงหนึ่งรายการชนะ; stale response ไม่มีสิทธิ์เขียนข้อความ

## Limitations

Local sanitizer ตรวจเฉพาะ patterns บางประเภท ไม่ใช่ production PII/moderation protection
ไม่มี dynamic evidence จาก AI, automatic clarification UI หรือ live-model compatibility guarantee
รายละเอียด boundary อยู่ใน [Security](security.md); [HTTP API boundary](api.md) implement แล้ว
Auth.js Credentials identity และ Frontend ทำแล้ว; HTTP message ผ่าน Orchestrator เดิมโดยไม่เพิ่ม authority ให้ AI

Evidence: [contracts](../src/dialogue/contracts.ts), [orchestrator](../src/dialogue/orchestrator.ts),
[mock](../src/dialogue/mock-provider.ts), [sanitizer](../src/dialogue/sanitize.ts),
[integration tests](../tests/dialogue.integration.test.ts)

## Verification

`npm run test:ai`: real adapter + fake Responses client, รวมการใช้ official SDK ผ่าน fake fetch
ตรวจ request/schema/refusal/error/abort/retry count, untrusted prompt, all candidate types,
timeout late-response, CAS stale rejection, duplicate HTTP retry และ safe D/W/S path
ชุดปกติไม่เรียก OpenAI; MySQL/Auth/browser smoke บังคับ AI_PROVIDER=mock

`npm run test:ai:live`: opt-in synthetic in-memory session หนึ่ง turn ไม่ต้องใช้บัญชีหรือ DB จริง
ต้องกำหนด private env ทั้งสามตัว; cap สอง attempts ตาม Orchestrator เดิม ไม่มี outer retry/load test
ตรวจ nonempty/schema, committed receipt, unchanged State/score/events/opportunities และ no Critical Failure
ไม่ assert exact wording/confidence; รายงานเฉพาะ model, attempts, schema result, latency ไม่ log prompt/response
Fallback ไม่ถือว่าผ่าน live verification; missing config exit nonzero พร้อม NOT RUN

**รอบนี้: adapter tests ผ่าน; Real OpenAI network verification NOT RUN — ไม่มี API key ใน environment.
Model used for live test: none.** ไม่อ้างว่า prompt injection/production moderation/PII detection สมบูรณ์

Official sources checked 22 September 2026:

- [Official TypeScript SDK: retries, timeouts, cancellation](https://developers.openai.com/api/reference/typescript)
- [Responses create API](https://developers.openai.com/api/reference/typescript/resources/responses/methods/create)
- [Structured Outputs and refusal](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Proposal model and snapshot](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [Client request correlation](https://developers.openai.com/api/reference/overview)
