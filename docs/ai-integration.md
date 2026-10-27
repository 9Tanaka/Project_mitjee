# AI / Dialogue Integration

STATUS (6 October 2026): MOCK / OPENAI / GROQ ADAPTERS IMPLEMENTED; Part 3 real Groq check passed all four v5 stories without fallback. The historical CC-N01 INVALID_OUTPUT cause remains unconfirmed/not reproduced. OpenAI live pending credits. See [Part 3 evidence and limits](call-center-part3.md); [Part 2 historical evidence](call-center-behavior-hardening.md) is preserved.

[กลับ README](../README.md) · [Security](security.md)

Current Call Center starts use [v6 continuous semantic output](call-center-continuous-ux.md).
Strict enum `interaction_signal` and `conversation_status` are required only for that
context, validated against the authored state before commit. Other providers/categories
keep their legacy response schema. Historical live v5 evidence above is not evidence of
v6 success; v6 live quota/semantic results and Preview acceptance are recorded separately.

Verification on 7 October 2026: all four real v6 Preview browser/Auth/MySQL paths completed
through explicit decisions, result and logout. CC-01/CC-N01 used only first-attempt Groq;
CC-02/CC-N02 each used one INVALID_OUTPUT authored fallback. The stricter paced in-memory
all-model run also remained FAILED (one CC-N01 fallback), despite functional completion.
Do not merge these scopes or claim zero provider failures; see the v6 receipt matrix.

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
GroqScenarioModelProvider เป็น outer adapter อีกตัว ใช้ SDK เดียวกันผ่าน fixed Groq endpoint
และยังส่งผลผ่าน ScenarioDialogueOrchestrator เดิม
Core/Domain/Dialogue ไม่มี SDK import; Provider ไม่มี Core/repository reference
Server composition เลือก provider แล้วส่งให้ createApplication(repository, provider); ไม่มี implicit Mock
Call Center voice ใช้ Azure STT → sanitized text → Dialogue → committed text → Azure TTS
ดู [Voice](voice.md) และ [WebSocket transport](websocket.md); ไม่มี native model audio หรือ token streaming

## Configuration and model

- `AI_PROVIDER=mock`: deterministic local provider; ไม่มี OpenAI call
- `AI_PROVIDER=openai`: ต้องกำหนด `OPENAI_API_KEY` และ `OPENAI_MODEL` ผ่าน private server environment
- `AI_PROVIDER=groq`: ต้องกำหนด `GROQ_API_KEY` และ `GROQ_MODEL` ของตนเอง; ไม่ใช้ OpenAI key แทน
- ค่าว่าง/ผิดหรือขาด key/model ทำให้ initialization fail ก่อนเปิด Training DB; ไม่เปลี่ยนเป็น Mock เงียบ ๆ
- HTTP คืน generic INTERNAL_ERROR ไม่คืนชื่อ config/key; ห้ามใช้ NEXT_PUBLIC_* สำหรับค่าเหล่านี้
- OpenAI endpoint ตรึงที่ `https://api.openai.com/v1`; Groq endpoint ตรึงที่ `https://api.groq.com/openai/v1`
- ไม่ใช้ `OPENAI_BASE_URL`, `GROQ_BASE_URL` หรือค่าจาก browser เปลี่ยนปลายทาง
- SDK logging off; ไม่ส่ง organization/project จาก implicit environment และไม่มี browser configuration

Proposal historical reference คือ `gpt-5.4-mini` และ final-test snapshot
`gpt-5.4-mini-2026-03-17`; ไม่ได้ระบุ Luna และไม่มีการแก้ประวัติ Proposal
Approved implementation decision คือ `gpt-5.6-luna` ผ่าน `OPENAI_MODEL` ที่ยัง configurable
[Official Luna model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
ที่ตรวจวันที่ 26 กันยายน 2026 ระบุ Responses API และ Structured Outputs
การรองรับในเอกสารไม่ได้ยืนยัน credits หรือสิทธิ์เข้าถึงของบัญชีจริง
ไม่มี default model หรือ silent substitution; tests ใช้ชื่อสมมติ ไม่ผูกกับ real model
หาก model ใช้ไม่ได้ ให้รายงาน category ที่ตัดข้อมูลลับออก; ไม่มีการสลับ model หรือ provider อัตโนมัติ

Groq เป็น **free development alternative** ที่ผู้ใช้อนุมัติสำหรับรอบนี้ โดยใช้
`GROQ_MODEL=openai/gpt-oss-120b` เป็นค่าที่ต้องกำหนดเอง ไม่ใช่ default ในโค้ด
`qwen/qwen3.8-27b` เป็นเพียง secondary test candidate; ยังไม่มีการรัน comparison หรือเลือกแทนให้
ไม่อ้างว่าโมเดลทั้งสองเทียบเท่า GPT-5.6 Luna และไม่แก้ข้อความ Proposal ย้อนหลัง
เอกสาร [Groq Responses API](https://console.groq.com/docs/responses-api) ที่ตรวจวันที่
27 กันยายน 2026 แสดง OpenAI JavaScript SDK, fixed endpoint และ Responses `text.format` JSON schema
ส่วน [Groq Structured Outputs](https://console.groq.com/docs/structured-outputs) ระบุ strict mode
สำหรับ gpt-oss-120b; adapter ใช้ `strict:true` และตรวจ Zod ซ้ำ ไม่มี regex extraction
เอกสารระบุ Responses API เป็น beta; การรองรับตามเอกสารไม่ใช่หลักฐาน live compatibility ของบัญชีนี้

## Request construction

instructions แบบคงที่กำหนดบทบาทตัวละครสมมติ ภาษาไทย current-state-only และ dialogue-only
developer message มีเฉพาะ allowlisted scenario id/version/category/variant/title, currentState,
characterRole, allowedBehaviors และ forbiddenBehaviors; user message เป็น JSON ของ sanitized
recent messages กับ current message ทั้งหมดถือเป็น untrusted dialogue ไม่ใช่คำสั่งระบบ
ไม่ส่ง message IDs, ownerId, account/email/hash, JWT/cookie/token, answer keys, weights,
decision mappings, critical rules, transition graph, guards, hidden opportunities หรือ recommendation internals
ไม่ serialize runtime context extras; adapter sanitize ซ้ำและคง limits 12/2,000/8,000

ไม่มี tools, external actions, previous_response_id หรือ full-history storage;
OpenAI ใช้ `store:false`; Groq ไม่ส่ง field `store` เพราะไม่รองรับ ทั้งสองใช้ `stream:false`, `max_output_tokens:1200` เป็น technical cost bound ไม่ใช่ Proposal Requirement
Token cap รวม output budget ของ API; ความเพียงพอ/latency ยังไม่ได้ยืนยันกับโมเดลจริง
Incomplete output ถูก reject แล้วใช้ retry/fallback; ไม่เพิ่ม token budget เอง
`store:false` ไม่ใช่คำรับรอง Zero Data Retention หรือว่าผู้ให้บริการไม่เก็บ abuse-monitoring data
Prompt ไม่มี score/transition logic และไม่ใช่ production-grade prompt-injection protection

## Immutable context

Part 2 extends the same contract with `CHARACTER_STATE_TURN` for backend-authored
caller beats. Both caller kinds have null user input and developer-only Responses input.
Answer itself performs no generation. Only the orchestrator's protected state-turn request
calls the provider; Core atomically commits the receipt and opens that state's opportunity.
Per-session OTP and simulator app contents remain backend-owned, never model-generated.
See [Call Center v4](call-center-part2.md) for authority, confirmation and verification scope.

Call Center v3 adds a first-class `CHARACTER_OPENING` context with `currentUserMessage=null`
and backend-pinned private `callStoryId`. Its Responses input is developer context only;
there is no fabricated user message. Normal turns retain the sanitized user-input path.
The provider cannot select stories or mutate states. Core commits the opening as one
character message/action/receipt using CAS; pending recovery, authored fallback and
late-response rejection are documented in [Call Center foundation](call-center-foundation.md).

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
GroqProviderError เก็บเฉพาะ category และ HTTP status ที่ปลอดภัย: RATE_LIMITED, AUTHENTICATION,
API_INCOMPATIBLE, INVALID_OUTPUT หรือ UNAVAILABLE; HTTP 429 รายงาน RATE_LIMITED / 429
Orchestrator ยังคง retry/fallback และ receipt contract เดิม ไม่ส่ง raw body, headers หรือ error cause
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

For new receipts, `failureReason` describes terminal failure only. A retry that
eventually returns valid, sanitized, nonempty output records `usedFallback=false`,
`failureReason=null`, and `attempts=2`. A fallback retains the terminal category.
`attempts` records request attempts, not individual failure categories; no raw provider
data or attempt history is persisted. Historical receipts are immutable: an old
`usedFallback=false` / `failureReason=ERROR` receipt describes a recovered earlier
attempt under the old semantics, not evidence of fallback.

ค่า Demo default: timeout 20 วินาทีต่อ attempt, retry อีกหนึ่งครั้ง รวมไม่เกินสอง attempts
แต่ละครั้งมี AbortController และ requestId รูปแบบ sessionId:turnId:attempt
ใช้ opaque IDs เท่านั้น ห้ามใส่ข้อมูลส่วนบุคคลใน identifiers
Orchestrator abort เมื่อ timeout; Mock รองรับทั้ง signal ที่ abort ไปแล้วและการ abort ระหว่าง timeout simulation
OpenAI และ Groq adapters ส่ง signal เดิมให้ SDK และตรวจ abort ทั้งก่อน/หลัง await
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

`npm run test:groq`: 52 tests ผ่านด้วย fake Responses client/fake fetch ณ 27 กันยายน 2026
ครอบคลุม explicit config, dedicated key/model, fixed endpoint, strict schema, sanitized errors,
single transport attempt, cancellation/late response, retry/fallback, HTTP input rejection,
idempotency และ unchanged backend assessment/state/events; ไม่มีการเรียก Groq จริง

`npm run test:ai:groq:live`: opt-in synthetic in-memory turn ใช้ private
`AI_PROVIDER=groq`, `GROQ_API_KEY`, `GROQ_MODEL` สูงสุดสอง provider attempts
ตรวจ schema, ข้อความไม่ว่าง/มีภาษาไทย, unchanged State/result/opportunity assessments/events,
receipt commit และ no fallback; รายงาน category/status/latency โดยไม่พิมพ์ raw response/key
การตรวจมีตัวอักษรไทยไม่ใช่ benchmark คุณภาพภาษาไทย; คุณภาพสนทนายังต้องประเมินจากการใช้งานจริง
หาก config ขาด ให้ NOT RUN และ exit nonzero โดยไม่เรียกเครือข่าย

`npm run test:ai:live`: opt-in synthetic in-memory session หนึ่ง turn ไม่ต้องใช้บัญชีหรือ DB จริง
ต้องกำหนด private env ทั้งสามตัว; cap สอง attempts ตาม Orchestrator เดิม ไม่มี outer retry/load test
ตรวจ nonempty/schema, committed receipt, unchanged State/score/events/opportunities และ no Critical Failure
ไม่ assert exact wording/confidence; รายงานเฉพาะ model, attempts, schema result, latency ไม่ log prompt/response
Fallback ไม่ถือว่าผ่าน live verification; missing config exit nonzero พร้อม NOT RUN

**ตรวจซ้ำ 2 ตุลาคม: LIVE GROQ VERIFICATION NOT RUN เนื่องจากไม่มี Groq key/model ใน private
environment; LIVE AZURE VERIFICATION NOT RUN เนื่องจากไม่มี Speech credentials**
OpenAI ยังคงรอ credits; ผล live ล่าสุดวันที่ 25 กันยายนคือ FAIL:
HTTP 429 `credit_balance_exhausted` สำหรับ `gpt-5.6-luna` (สอง attempts; fallback ไม่ใช่ PASS)
ไม่อ้างว่าไม่มี key หรือว่า real network ผ่านแล้ว ไม่ log secret/raw response
ดู [Current realtime verification](realtime-verification.md) สำหรับ test matrix รอบนี้
และ [Historical recovery](recovery-verification.md) สำหรับรอบ 26 กันยายน
ไม่อ้าง production moderation/PII/injection certification

Official sources checked 22 September 2026:

- [Official TypeScript SDK: retries, timeouts, cancellation](https://developers.openai.com/api/reference/typescript)
- [Responses create API](https://developers.openai.com/api/reference/typescript/resources/responses/methods/create)
- [Structured Outputs and refusal](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Proposal model and snapshot](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [Client request correlation](https://developers.openai.com/api/reference/overview)
