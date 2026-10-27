# Playable scenario catalog

STATUS: NINE PUBLIC SCENARIOS; EIGHT TEXT-ONLY + CALL CENTER PHONE FOUNDATION WITH FOUR INTERNAL STORY IDENTITIES

The nine types in Proposal v6 section 4.1.7.1 are available through the authenticated catalog.
Call Center new sessions use [v6 continuous semantic-gated dialogue](call-center-continuous-ux.md); SMS uses v4;
the remaining seven templates retain v1. Historical SMS v1–3 and Call Center v1–v5 remain
available for old sessions. All new starts use categorical [Decision Evaluation](decision-evaluation.md).
The unchanged eight text categories retain their authored warning evidence, safe exits and
validated critical actions. Call Center has four authored parcel/bank matched normal/scam
stories, signal-gated contextual decisions, owned simulator verification and explicit critical confirmations.

| Category | Template ID | Practised risk |
|---|---|---|
| Call Center | `call-center-scam` (stable public ID) | Four parcel/bank × normal/scam stories; continuous text/voice conversation |
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
The early safe stop is available at first contact for scam templates, not the NORMAL_CALL control. Backend guards always apply, including crafted requests.

Call Center uses one public card and a neutral public title/description for both variants.

เก้ารายการนี้เป็น category-level runtime scenarios ไม่ใช่ target storyboard ทั้ง 21 เรื่อง:
Call Center v3 มี CC-01/CC-02/CC-N01/CC-N02 เป็น Backend identities ที่ใช้เส้นทางพื้นฐานร่วมกัน
ไม่ใช่เรื่องเต็มทั้งหมด และไม่เปิดเผย condition บน card ดู [Part 1](call-center-foundation.md)
The stable historical scenario ID is retained to preserve old session/start identities.
Backend selection uses crypto.randomInt(2), with an injected selector for deterministic tests.
The persisted session is authoritative: same owner/scenario/startId replays without reroll;
concurrent starts may select differently but the losing insert loads the database winner.
Each story pins an immutable id/version/variant tuple, never a rewrite of a published template.
Browser start DTOs reject variant/callType/seed/probability; AI receives the chosen context only.
Historical NORMAL_CALL v1/v2 use a fictional library appointment, D1 context verification, neutral W1,
D2 fictional non-sensitive scheduling, S1 normal termination/known callback channel.
See [approved normal-call assessment](decision-evaluation.md) and [Voice](voice.md).

Tests exercise the catalog's nine distinct categories, each new template's full safe path, early safe exit, reviewed choice and validated critical action, plus an authenticated HTTP start/result path outside SMS. No real MySQL migration or live AI/voice service is claimed by these tests.

Recovery adds nine multi-turn/high-confidence candidate authority tests and conditional
fresh-client MySQL safe-path regression tests for all eight new version-1 templates plus
SMS versions 3/4. Legacy SMS versions 1/2 have separate compatibility round-trip tests.
Dedicated MySQL integration และ authenticated browser E2E ยัง NOT RUN เพราะไม่มี dedicated test DB; anonymous browser smoke ที่ผ่านไม่ใช่การยืนยัน persisted training E2E ดู [ผล verification ล่าสุด](realtime-verification.md)
