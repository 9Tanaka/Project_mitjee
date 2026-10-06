# Call Center v6 — continuous conversation and committed semantic decisions

Implemented demo design, 7 October 2026. This changes **Call Center only**. It is an
approved implementation refinement, not a claim that Proposal v4 prescribed these enum
names or automatic-progression parameters. Auth.js, MySQL/Prisma schema, Groq/Azure
selection, critical authority and the other eight categories are not redesigned.

## Version and authority

New sessions pin immutable v6. Published v1–v5 remain registered and unmodified, with
their historical rules and UI. The new optional schema fields have no parsing defaults:
reading historical configuration does not change its stored definition. No database
migration is needed; structured caller output remains in the existing turn receipt JSON.

```text
text / sanitized STT
  → owned active session + revision + pinned authored state
  → provider strict response schema
  → backend state-specific semantic allowlist
  → atomic caller message / receipt commit
  → activate authored opportunity once, if signal is decision-relevant
  → guarded backend-authored progression
  → safe public phone projection
  → transcript + independent phone controls + contextual decision sheet

explicit learner simulator action
  → EventValidator / opportunity finalization / state guards / evaluation
```

AI does not receive Core or choose a next state/transition. Its signal and progression
status cannot produce an assessment, event, score, Critical Failure or TrainingResult.
They report a caller situation and propose progression; Backend controls both boundaries.
Free text can now cause **guarded conversational progression**, but it still cannot
finalize checkpoints, bypass required decisions or confirm critical actions. The older
invariant “free text never changes state” describes the pre-v6 manual flow, not this flow.

## Structured output and backend rules

Call Center v6 requires both fields in its strict response; legacy scenarios keep their
previous provider schema. Unknown properties such as `next_state` are rejected.

- `interaction_signal`: `NONE`, `IDENTITY_INFORMATION`, `CONTEXT_INFORMATION`,
  `VERIFY_CONTEXT`, `URGENCY_PRESSURE`, `SECRECY_PRESSURE`, `TRANSFER_REQUEST`,
  `OTP_REQUEST`, `DELIVERY_CONFIRMATION`, `TRANSACTION_NOTIFICATION`.
- `conversation_status`: `CONTINUE_STATE` or `STATE_COMPLETE`.

The state declares `allowedSignals`, `decisionSignals`, `fallbackSignal`, `fallbackStatus`,
`autoTransitionIds` and `maxConversationalTurns`. Template validation rejects impossible
policies, scam-only signals in normal controls, external auto edges and missing fallback
semantics. Runtime validation occurs before receipt commit and again at the Core boundary.
An out-of-state signal is `INVALID_OUTPUT`: retry once, then use the authored fallback
**words and signal together**. Malformed provider text is never used to open an interaction.
There is **no raw keyword matching to trigger a popup**, either in Backend or Frontend.
Existing free-text behavior observations remain non-authoritative.

| Authored state | Valid signal | Contextual decision |
|---|---|---|
| CALL_CONNECTED | NONE / IDENTITY_INFORMATION | None |
| IDENTITY_CLAIM | IDENTITY_INFORMATION | None; natural identity/reference questions |
| CONTEXT_CLAIM, all four stories | CONTEXT_INFORMATION / VERIFY_CONTEXT | Only committed VERIFY_CONTEXT |
| PRESSURE, CC-01 / CC-02 only | URGENCY_PRESSURE / SECRECY_PRESSURE | Only committed pressure signal |
| MAIN_REQUEST, CC-01 | TRANSFER_REQUEST | Transfer decision; Bank becomes relevant |
| MAIN_REQUEST, CC-02 | OTP_REQUEST | OTP decision; Messages becomes relevant |
| MAIN_REQUEST, CC-N01 | DELIVERY_CONFIRMATION | Neutral delivery decision |
| MAIN_REQUEST, CC-N02 | TRANSACTION_NOTIFICATION | Neutral acknowledgment |
| PLAYER_DECISION / INDEPENDENT_VERIFICATION / CALL_ENDING | NONE | No additional conversational popup |

Normal controls have no PRESSURE state or urgency, secrecy, OTP or transfer signal. No
fake warning signs are created for them. The pressure interaction uses neutral wording;
no SAFE/RISKY/correct/wrong/SCAM/NORMAL label or answer color is shown before commitment.
The existing categorical evaluation is preserved (three meaningful scam decisions, two
normal decisions), not replaced with invented weighted W scoring. Opportunity activation
is signal-gated; assessment still requires an explicit learner choice.

## Progression, multiple turns and recovery

The caller speaks first. A committed `STATE_COMPLETE` may advance only through an authored
`internalOnly` edge that passes all deterministic guards. Generic learner progression and
identity/reference/clarification buttons are absent in v6. Questions use normal dialogue.
`CONTINUE_STATE` allows multiple caller/learner exchanges inside one state. Identity
discussion can therefore answer successive questions without a forced decision popup.

The authored bound is **three committed caller turns per conversational state**, including
its initial caller beat; it is hidden from the learner. At the bound, Backend may advance
only if guards pass. It cannot bypass an unfinalized required checkpoint. If a valid but
non-decision context signal repeatedly stalls the next meaningful interaction, Backend
commits the authored fallback words/signal at the bound instead of relabeling model text.
This deterministic recovery has `usedFallback=true`, `failureReason=null`; it is not a
provider error or proof of a successful live model response.

Receipt, message, opportunity activation and any guarded transition are persisted in one
CAS operation. A stale revision cannot partially commit them. Receipt replay returns the
same committed turn, with no second opportunity or transition. Voice retries also replay
after progression has left the old state, without repeat STT/AI/TTS.

## Phone UI and critical safety

Ordinary calls show transcript, text input, opt-in microphone, phone apps and persistent
hangup. A compact sheet is projected only after a valid decision-relevant caller turn has
committed and its opportunity remains open. The public projection supplies opaque
`contextualDecision.id` / `actionIds`, not internal signals, story/variant, answer keys or
scoring rules. Apps are separate navigation. The sheet closes after a committed choice;
presentation-only opaque browser history markers prevent automatic re-opening on refresh.
An unresolved decision can still be reopened explicitly. Backend receipts remain the
actual idempotency authority, not the browser marker.

Hangup is available before the first caller beat and from internal apps; it is an explicit
phone action, not a checkpoint option. Before any encountered decision, the result remains
UNASSESSED. Ending an encountered path follows existing explicit-action rules. Controls
briefly disable during an in-flight mutation to preserve revision/CAS, rather than accept
competing actions. Quit is ABANDONED, distinct from hangup.

Independent-contact intent lives under “ตรวจสอบผ่านช่องทางอื่น”, not in every popup.
It does not create verified evidence. Only actually checked owned simulator data can
satisfy the v5 verification branch. Opening/viewing Messages, seeing a simulated OTP or
typing/speaking OTP/transfer words cannot Critical Fail. Only the relevant explicit
simulator action, fresh prepared confirmation and Backend validation can do so. Bank and
Messages are unavailable before the matching committed request signal. Voice and text
share this same conversation pipeline; live Azure credentials are not required for text.

## Verification commands and scope

```text
npm run test:call:ux
node scripts/verify-call-ux-browser.mjs http://127.0.0.1:3217
node scripts/verify-call-stories-live.mjs --paced
node scripts/verify-call-ux-browser.mjs --preview --story CC-01 --paced
```

The established live-story command delegates to the v6 semantic runner. Local browser
verification explicitly uses an in-memory/Mock application bridge, not live Auth/MySQL.
Preview verification has no API/auth interception and reads only its synthetic session's
persisted records. A backend-only Preview story override selects each of the four stories
for acceptance, then is cleared; no browser variant selector is introduced. Artifacts in
`frontend-artifacts/call-ux/` are ignored and contain bounded metadata/screenshots, not keys,
passwords, raw provider bodies or hidden answer keys in public DTOs.

Local browser: all four full safe stories passed at 375/768/1440px (12 cases), with no
horizontal overflow, browser exceptions or API 500; popup contents exclude phone navigation
and answer labels. Unit/integration checks cover malformed signals, authored fallback,
multi-turn/anti-deadlock, required guards, replay, critical confirmations and historical pins.
Real Groq and deployed acceptance are reported separately below; a functional fallback
completion is **not** counted as live Groq success. Dedicated MySQL test/E2E suite and live
Azure are NOT RUN without their private test resources. No production deployment is made.

### External verification record

Initial unpaced Groq run on 7 October 2026 encountered `RATE_LIMITED` in all four stories;
valid responses and fallback completion were observed, but this was **FAILED live
verification**, not a successful all-model run. Paced rerun and Preview evidence are being
collected. This section will record the final outcome before handoff.

### Remaining UX limitations

The signal is a constrained model interpretation, not an independent semantic oracle.
Backend validates allowed state/contract and uses authored recovery, but it does not claim
to prove every natural-language statement with deterministic semantic parsing. Real
provider latency/quota can cause visible waits and fallback. Opening/state turns are
bounded non-streaming requests. Hardware microphone/speaker quality requires live Azure
and user-device testing. Generic historical v1–v5 flows intentionally retain their old UI.
