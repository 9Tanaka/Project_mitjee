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

Call Center currently uses the `SCAM_CALL` variant as a text simulation. The normal-call variant, seeded call selection, microphone speech-to-text, text-to-speech, and real-time voice flow are separate pending work. A text or mock path is not a production speech integration.

Tests exercise the catalog's nine distinct categories, each new template's full safe path, early safe exit, reviewed choice and validated critical action, plus an authenticated HTTP start/result path outside SMS. No real MySQL migration or live AI/voice service is claimed by these tests.
