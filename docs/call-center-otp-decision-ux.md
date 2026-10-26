# Call Center: simulated OTP confirmation and neutral decisions

Updated: 2026-10-26. Branch: `feat/rule-based-evaluation`.
Starting and current committed HEAD: `17a4ee430e6f6e645b6e2e41bec44b7f167d3d53`.
This implementation is in the working tree; no commit, push or deployment was performed.

## Scope and cause

The current phone already generated a per-session simulated OTP. Its Messages controls were difficult to discover and required several separate learner confirmations. A random number could therefore enter ordinary dialogue, and the model could incorrectly acknowledge receiving an OTP while no backend disclosure had occurred.

This refinement changes the public CC-02 `call-center-bank@6:SCAM_CALL` input/presentation path and audits active decision copy in all four current v6 Call Center stories. It builds on the existing committed-action transcript/critical-ending work described in `call-center-conversation-ux-update.md`. It does not edit the published template, evaluator, Core, EventValidator, repository, Prisma schema/migrations, providers or other scenario categories.

## Simulated SMS and exact-code input

- `simulatedOtp(sessionId)` reuses the previous SHA-256 derivation, modulo 900000 plus 100000. It creates six synthetic digits; it does not send or receive a real SMS.
- `hasSimulatedOtpContext` requires the exact supported story/template/version/variant, matching session identity, ACTIVE lifecycle, MAIN_REQUEST, a ready committed caller turn with OTP_REQUEST, and an unfinalized current disclosure opportunity.
- Only this context receives public `phone.otpMessage`: the synthetic code, unread status, one opaque next phone action and managed control IDs. No hidden story, critical rule ID, assessment or raw row is added to the browser DTO.
- The unread notification appears after the committed request. Messages remains closed until the learner opens it. Existing persisted OPENED_MESSAGES behavior supplies the read marker; refresh does not generate a new message.
- The composer compares against the actual six-digit simulation token, with numeric boundaries. Surrounding words/whitespace are allowed. Different numbers, a longer number containing those digits, and split/spaced digit representations do not match. No semantic/AI classification or all-number OTP detector is used.
- Exact-code input opens confirmation locally and makes no message request. A server guard also rejects a direct exact-code message with `SIMULATED_OTP_CONFIRMATION_REQUIRED` before the provider. Existing ownership/lifecycle/revision/replay order remains in effect. Neither guard writes an action, event, result or dialogue receipt.
- Real-user text continues through the existing sanitization path. No synthetic digits are added to provider context or committed-action text, and the bridge sends no numeric code in action requests.

## One confirmation, existing authority

The primary path is:

`committed OTP_REQUEST → new simulated SMS → open/read Messages → return to conversation → type issued simulation token → one confirmation → existing backend phone actions → existing critical ending/result`.

The confirmation says “คุณกำลังจะบอกรหัส OTP จำลองแก่ผู้โทร”. It describes the nature of OTP disclosure without revealing an assessment or future outcome. Cancellation preserves the editable composer draft and creates no action/event/result.

After consent, the client follows Backend's next opaque public action: return to Call if needed, open Messages if needed, view, prepare, then explicitly confirmed simulated action. These remain the original individual CAS/idempotent action requests. The original fresh preparation, active app, state, opportunity, event and confirmation guards run unchanged. This is not a new batch transaction or integrity protocol.

The final authority is unchanged:

`SIMULATED_ACTION(confirmed:true, SHARE_SIMULATED_OTP) → existing Backend validation → DISCLOSE_OTP → CRITICAL_FAILURE`.

The bridge never infers a critical result from text or a model response. It displays the existing critical ending only from the returned authoritative projection. No next ordinary caller turn is requested. Committed-action text omits the digits; OTP recovery remains linked to the accepted confirmed action and matching backend-validated event.

The old view/prepare/second-confirm controls remain available internally for their existing validators but are hidden from the supported Messages UI. One secondary “บอกรหัสจำลองแก่ผู้โทร” control opens the same single-confirmation bridge for accessibility. It does not create a second prominent flow.

Double clicks are blocked synchronously. An uncertain network response retains the exact request ID, revision and payload for replay; it does not create a replacement critical action. A definite rejection shows an error, reconciles with the session and allows cancellation/editing. An expired/stale context cannot disclose. Refresh never automatically resumes an unfinished confirmation or resubmits a critical action; already committed intermediate phone interactions may remain, as with the existing controls.

## Narrow model acknowledgement guard

Only current CC-02 v6 SCAM_CALL receives an extra authored context constraint: numbers/redacted dialogue do not prove receipt, acceptance, verification or successful account action. The caller must not assert these facts before backend confirmation.

A bounded Thai/English output validator rejects known positive acknowledgement patterns, including “ได้รับรหัสแล้ว”, “ขอบคุณสำหรับรหัส”, “รหัสถูกต้อง” and the reported “ได้รับ [REDACTED_SECRET] แล้ว”. Negated/neutral test phrases are accepted. Rejection uses the existing INVALID_OUTPUT retry policy (initial attempt plus one retry), followed by the current authored state fallback and signal.

This phrase guard validates dialogue consistency only. It does not detect learner events, choose rules, score, trigger recovery or classify arbitrary speech. It is deliberately not a universal semantic verifier; novel paraphrases may require additional bounded coverage. Prompt constraints supplement it. After real backend confirmation the session is terminal, so normal caller generation stops.

## Active-label audit

All 46 choices across 10 D checkpoints in four current stories were audited. The two existing critical rules remain unchanged. Only the leading active `trust` label changes; template configuration, option IDs, choice IDs, assessment and rule/event mappings remain identical.

| Choice/control | Classification | Active presentation |
| --- | --- | --- |
| trust | LEADING_LABEL, corrected | เชื่อคำกล่าวอ้างของผู้โทร |
| caution | NEUTRAL_OK | ฟังข้อมูลต่อโดยยังไม่ให้ข้อมูลเพิ่มเติม |
| checked | NEUTRAL_OK | เปรียบเทียบกับข้อมูลในแอปของฉันแล้ว; existing actual-check guard retained |
| callback | NEUTRAL_OK | ตรวจผ่านช่องทางที่มีอยู่เดิม; persistent phone control uses จบสายเพื่อติดต่อช่องทางที่มีอยู่เดิม |
| end | NEUTRAL_OK | จบการติดต่อ; persistent phone control uses วางสาย |
| refuse (transfer) | NEUTRAL_OK | ไม่ดำเนินการโอนตามคำขอ |
| refuse (OTP) | NEUTRAL_OK | ไม่บอกรหัสตามคำขอ |
| confirm | NEUTRAL_OK | ยืนยันช่วงจัดส่งจำลอง |
| reschedule | NEUTRAL_OK | ขอเปลี่ยนช่วงจัดส่ง |
| limit | NEUTRAL_OK | ให้เฉพาะข้อมูลจำเป็นต่อการจัดส่ง |
| acknowledge | NEUTRAL_OK | รับทราบข้อมูลรายการ |
| simulated critical controls | NEUTRAL_OK | Explicit action/confirmation wording; no score/outcome in active labels |

Trust's deterministic live utterance is now “ผมเชื่อข้อมูลที่คุณแจ้งครับ”. Its assessment remains REVIEW. Existing post-decision/result explanations may still explain missing verification after commitment. Decision panel copy describes the learner's intended action without naming a correct or safe answer. Historical v1–v5 presentation remains unchanged.

## Verification

Focused command:

```text
node node_modules/vitest/vitest.mjs run tests/call-otp.test.ts tests/call-otp.ui.test.tsx tests/call-conversation-presentation.test.ts tests/call-conversation.ui.test.tsx --maxWorkers=2 --reporter=json --outputFile=test-results/otp-focused-final.json
```

108 passed: 27 OTP/mapping/guard tests, 7 OTP UI tests, 65 existing transcript/projection tests, 9 existing conversation UI tests. Coverage includes token boundaries, wrong numbers, no write before consent/cancel, correct existing critical rule, numeric privacy, duplicate replay, lost-response retry, double click, stale preparation/revision, actual Core expiry, unsupported versions/normal stories, bounded acknowledgement retry/fallback, unchanged choice mappings and assessments, and no caller after critical commit.

Final verification:

| Command / gate | Result |
| --- | --- |
| Focused command above | 108 passed, 0 failed |
| `npm test -- --maxWorkers=2 --reporter=json --outputFile=test-results/otp-full-final.json` | 1211 passed, 0 failed, 69 skipped (1280 total) |
| `npm run test:frontend -- --maxWorkers=2 --reporter=json --outputFile=test-results/otp-frontend.json` | 110 passed, 0 failed |
| `npm run prisma:validate` | PASS |
| `npm run build` (includes `prisma:generate`) | PASS, Prisma 7.10.0 and production Next build |
| `npm run typecheck` | PASS |
| `npm run audit:client` | PASS, 68 JavaScript artifacts, no server dependency/secret markers |
| `git diff --check` | PASS |
| Focused OTP browser | 3/3 viewport runs passed, 0 browser errors |
| Existing conversation browser | 27/27 path/viewport combinations passed, 0 browser errors |

The 69 skipped tests are environment-gated suites in the ordinary offline run; this pass did not claim fresh live external provider or dedicated-database verification. No repository lint script exists. An initial new test incorrectly expected reconciliation to always unmount a dialog; it was corrected to assert the actual required recoverable error state, disabled stale confirmation, cancellation and preserved draft. Existing async UI assertions now await the decision sheet rather than racing its effect. No timeout or authority assertion was relaxed.

Browser scripts:

```text
node scripts/verify-call-otp-browser.mjs http://localhost:3000
node scripts/verify-call-conversation-browser.mjs http://localhost:3000
```

The focused browser script verifies all requested OTP paths at 375/768/1440px, no horizontal overflow, cancellation focus/editability, hidden old controls, deterministic terminal transcript, refresh without resubmission and matching OTP result/recovery. The existing broader script verifies four stories and nine decision/ending paths at the same widths.

These browser runs use the actual production Next UI with requests bridged to the real in-memory application/Core, synthetic identity and Mock dialogue. They are not evidence of live external Auth/PostgreSQL/Qwen/STT/TTS connectivity. Screenshots and JSON evidence are ignored local artifacts, not source files. No user session was modified by these fixtures.

## Preserved semantics and limits

- DECISION_RULES_V1, categorical outcomes, `trainingScore=null`, all existing assessments and backend authority are unchanged.
- Ownership, Core-controlled expiry, CAS/revision, replay, rollback, append-only validation, template immutability and recovery trigger/content authority are unchanged.
- No W/S measurement, numeric score, new event/rule, provider switch, schema/migration, production cutover or other-category work is introduced.
- The typed bridge is for current active CC-02 v6 at its committed OTP request. It does not reopen a finalized opportunity in an old session; start a new round to test the complete flow.
- STT remains non-authoritative. An exact synthetic token reaching the server through STT is blocked by the same pre-provider guard; use the secondary Messages confirmation control. A speech-driven confirmation UI is outside this focused typed-input change.
- Unread means the simulated Messages app has not yet been opened for this available synthetic message. There is one synthetic OTP message in this supported scenario.
- Action sequencing retains individual existing requests. A network interruption may leave noncritical phone navigation/view/preparation committed; no disclosure/result is claimed without the final backend confirmation.
- Real OTP/password values must never be entered. Only MITJEE's session-derived synthetic token is used by this bridge.

## Files for this refinement

New:

```text
src/application/otp-presentation.ts
src/dialogue/simulated-otp.ts
src/frontend/otp-disclosure.tsx
src/public-api/simulated-otp.ts
tests/call-otp.test.ts
tests/call-otp.ui.test.tsx
scripts/verify-call-otp-browser.mjs
docs/call-center-otp-decision-ux.md
```

Updated, including files already modified/untracked by the preceding conversation UX phase:

```text
src/application/catalog.ts
src/application/contracts.ts
src/application/projections.ts
src/application/call-conversation-presentation.ts
src/dialogue/orchestrator.ts
src/frontend/api.ts
src/frontend/phone-simulator.tsx
src/http/errors.ts
src/public-api/phone.ts
src/app/phone-simulator.css
tests/post-decision.helpers.ts
tests/call-conversation-presentation.test.ts
tests/call-conversation.ui.test.tsx
scripts/verify-call-conversation-browser.mjs
docs/call-center-conversation-ux-update.md
```

Unrelated pre-existing README/docs changes, preceding voice/audio changes and generated/browser artifacts must be reviewed separately before any future selective commit. Nothing was staged in this phase.
