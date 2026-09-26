# Playable scenario catalog

STATUS: NINE TEXT SCENARIOS IMPLEMENTED; CALL CENTER VOICE PENDING

The nine types in Proposal v6 section 4.1.7.1 are available through the authenticated scenario catalog. Each published template has fictional content, state transitions, public action labels, explicit decision assessments, warning evidence, a safe early exit, and a backend-validated critical simulated action. The eight new templates are version 1; SMS / Phishing uses version 4. Historical SMS versions 1–3 stay available for old sessions. All new templates use categorical [Decision Evaluation](decision-evaluation.md).

| Category | Template ID | Practised risk |
|---|---|---|
| Call Center | `call-center-scam` | Caller impersonation and OTP request |
| Investment | `investment-scam` | Guaranteed returns and a withdrawal fee |
| Romance | `romance-scam` | Relationship pressure and an urgent money request |
| E-commerce | `ecommerce-scam` | Off-platform payment to an unverified shop |
| SMS / Phishing | `sms-phishing-demo` | Parcel message, suspicious link and credentials |
| Task | `task-scam` | Upfront deposit to unlock earnings |
| Fake loan | `fake-loan-scam` | Untrusted loan app and excessive device access |
| Recovery | `recovery-scam` | A supposed refund helper seeking remote control |
| Job | `job-scam` | Upfront training fee and unverifiable employer |

The new scenarios share a small, reviewed state pattern but have distinct role, contact claim, pressure, evidence, request, safe response and critical rule. The backend maps public option IDs to pinned template choices. Free text and AI responses remain nonauthoritative. The mock provider now uses the selected scenario's context, and the real OpenAI adapter remains unverified due to the known 429 credit blocker.

For the eight new templates with publicActionBindings, the action list shows progression
only after required checkpoint/event guards are satisfied. SMS retains its original catalog
bindings and may expose a progress request that Core rejects until its guards pass.
The early safe stop is available at first contact. Backend guards always apply, including crafted requests.

Call Center currently uses the `SCAM_CALL` variant as a text simulation. `NORMAL_CALL`
and backend-only 50/50 selection remain unimplemented. The latest approval calls for
cryptographically reasonable randomness or an injectable selector for deterministic tests,
not AI/client selection. NORMAL_CALL assessment/checkpoint semantics require a user decision:
do not force scam warning signs, critical behavior or invent pass/fail rules for a normal call.
Voice must follow validated text variants, using Azure AI Speech STT/TTS, user-initiated
microphone access, no raw audio retention and a text fallback. No WebSocket is required yet.

Tests exercise the catalog's nine distinct categories, each new template's full safe path, early safe exit, reviewed choice and validated critical action, plus an authenticated HTTP start/result path outside SMS. No real MySQL migration or live AI/voice service is claimed by these tests.

Recovery adds nine multi-turn/high-confidence candidate authority tests and conditional
fresh-client MySQL safe-path regression tests for all eight new version-1 templates plus
SMS versions 3/4. Legacy SMS versions 1/2 have separate compatibility round-trip tests.
MySQL and real browser execution remain NOT RUN; see [Recovery verification](recovery-verification.md).
