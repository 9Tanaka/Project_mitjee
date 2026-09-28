# MITJEE Scenario Interaction + Storyboard Specification

CONTENT + INTERACTION DESIGN ONLY | 2026-09-28 | PROPOSED_FOR_REVIEW

[เปิดสารบัญ 21 เรื่อง](storyboards/README.md)

## Source baseline

ตรวจ `git fetch origin feat/rule-based-evaluation` ก่อนอ่าน และพบ local HEAD = remote feature HEAD = `105fe8395f86cc936d808ecba0cf7643aeaf19af`. Repository: `9Tanaka/Project_mitjee`; branch: `feat/rule-based-evaluation`. Source files เดิมไม่ถูกแก้

| Priority | Source | การใช้งาน |
|---|---|---|
| 1 | [scenario-story-bank.md](scenario-story-bank.md) | IDs, identity, premise, tier, provenance, constraints; bank ทั้งชุดยัง PROPOSED_FOR_REVIEW |
| 2 | [scenario-deduplication-report.md](scenario-deduplication-report.md) | ขอบเขตความต่างและ conditional additions |
| 3 | `E:/locate/Listขอscenarioกับตำรวจ.txt` | แนวคิดตั้งต้น 9 หมวด; ไม่ดึง game bullets มาสร้าง family |
| 4 | `../output/docx/MITJEE_Proposal_Update_Qwen_Game_2026-09-26.docx` (parent workspace, นอก repository) | กฎ categorical, Qwen plan, voice authority/synthetic boundary |
| 5 | [decision-evaluation.md](decision-evaluation.md), [scoring.ts](../src/domain/scoring.ts), [scam-scenarios.ts](../src/fixtures/scam-scenarios.ts), [SMS rules](../src/fixtures/sms-phishing-decision-rules.ts), [provider](../src/server/scenario-provider.ts) | ยืนยัน current result/authority และสิ่งที่ยังไม่ implement |
| 6 | ข่าว N01–N17 ใน [Story Bank sources](scenario-story-bank.md#20-sources) | ใช้ evidence เดิมที่ bank ตรวจ ไม่ค้นข่าวใหม่และไม่อ้างว่าบทแต่งทุกเฟรมเป็นข่าว |
| 7 | [RECOMMENDATION] ในเอกสารนี้ | เติม UX, wording, frame order, draft action/rule mappings เท่านั้น |

Source SHA-256: Story Bank `68f77eba997ea8d45928316965ddb870b1837bf3b53ac6a2e63d2599d65fd7d7`; Deduplication `8566e5bd8581c74dd20fa7defc91ee7d2b2402585bdebf305b310b8707b5af64`; รายการผู้ใช้ `3bf2f4367485fba2f27b453a2fe3ee9dadbe1b1120ad35af1391e108bcb6c813`; Proposal update `55b41b0a383348f30a905dcfbd3c41abdcf7ed77bee323ad8c1f2795f05f227b`

พบ `docs/scenario-database-design.md` เป็น untracked งานเดิมก่อนเริ่ม ไม่อ่านเป็น requirement ไม่แก้และไม่รวม commit. รอบนี้ไม่มี Prisma/migration/runtime/fixtures/AI/voice/UI/training dataset/Playwright changes

## Scope and evidence labels

[SOURCE-DERIVED] คง 19 scam families เดิมใน 9 หมวด และ 2 normal controls. ไม่มี family ใหม่ ไม่มีการ merge/delete source. รักษา INV-01 hybrid romance เป็น related context ไม่สร้าง ROM-03; QR ไป form เป็น PHI-01 variant ไม่เพิ่มเรื่อง

- [SOURCE-DERIVED]: identity/mechanism/tier ที่ระบุใน bank; ไม่แปลว่า final approval
- [CURRENT_CODE]: สิ่งที่ตรวจที่ start SHA จริง
- [RECOMMENDATION]: รายละเอียด UX, ตัวอย่างข้อความ, หลักฐานประกอบ, branch และ rule mapping ที่เสนอ ทุกเฟรมในชุดนี้ใช้ป้ายนี้
- [DETAIL_PENDING]: ต้องได้คำตอบหรือการอนุมัติก่อน final/implementation
- CONDITIONAL_CONTENT: INV-02, ECO-03, LOAN-02, REC-02, JOB-02 และ normal controls CC-N01/CC-N02; เก็บ selection tier เดิมแยกกัน
- NEEDS_CONTENT_REVIEW: อีก 14 เรื่องเนื้อหาครบเพื่อวาด draft แต่ bank ยังไม่ได้รับ final approval

## Shared interaction contract

[RECOMMENDATION] Storyboard เป็นคำอธิบายสิ่งที่เกิดขึ้นบนหน้าจอ ไม่ใช่ state schema. Narrative frame หลายภาพอยู่ state เดียวได้ การเข้าสู่ state ที่มี checkpoint จึงเปิด opportunity ตาม current semantics; ต้องกำหนด mapping หลัง content review ไม่ใช้การเลื่อนสไลด์หรือ Qwen reply เป็น action เปลี่ยน state

Pre-scenario ใช้ชื่อกลาง ไม่เปิดเผยคำว่า scam/ปลอม/normal ในเงื่อนไขที่ต้องการให้ผู้เรียนตรวจเอง. บทบาทผู้เรียน บริบท synthetic และโหมดต้องชัด ตัวอย่างบทพูด 1–2 ประโยคในแต่ละเฟรมเป็น DRAFT ไม่ใช่ Qwen training target. ผู้เรียนมี FREE_TEXT, ACTION, EVIDENCE_SELECTION, CONTINUE และ END_CONTACT; VOICE เฉพาะ target Call Center. การดูหลักฐานเป็น ACTION ที่ไม่ประเมินจนกด finalize ตามกฎ

Qwen สร้างเฉพาะถ้อยคำของ character ตาม allowed facts/tactics. ไม่สร้างหลักฐานหรือผลตรวจอิสระเอง ไม่ให้รู้เฉลย hidden checkpoint ไม่กำหนด SAFE/REVIEW/Critical ไม่คำนวณคะแนน ไม่เปลี่ยน state และไม่แก้ฐานข้อมูล. Backend รับ explicit action ที่ตรวจ session/state/action/confirmation แล้วเท่านั้น การตีความจาก free text หรือ STT เป็น candidate ไม่ใช่ authoritative event

### Categorical result semantics

[CURRENT_CODE] เงื่อนไขจาก decision-evaluation.md และ scoring.ts:

| ลำดับ | เงื่อนไข | ผล |
|---|---|---|
| 1 | C=1: มี critical event ที่ backend ยืนยัน | CRITICAL_FAILURE ทันที |
| 2 | C=0 และ (T=0 หรือ N>0) | ข้อมูลประเมินยังไม่ครบ; completed path ที่ N>0 เก็บ UNASSESSED |
| 3 | C=0,T=1,N=0,U>0 | NEEDS_PRACTICE |
| 4 | C=0,T=1,N=0,U=0 | PASSED เฉพาะเส้นทางที่เล่น |

A = checkpoints ที่เปิดจริงตาม state-entry; U = REVIEW ที่ commit แล้ว; N = จุดเปิดแล้วไม่ตอบ; T = safe terminal transition เสร็จ. Critical entry แยกจาก SAFE/REVIEW/UNASSESSED counts. ACTIVE/ABANDONED/EXPIRED ไม่มี official TrainingResult; อย่าใช้สูตร T=0 เพื่อสร้างผลถาวรให้รอบที่ยังไม่จบ. BACKEND_SYSTEM result frame อ่านผล ไม่ให้ Qwen เขียนสรุป outcome ใหม่

EARLY_SAFE_EXIT ที่อนุญาตอาจผ่านได้ตั้งแต่ต้นโดยไม่มี finalized checkpoint. ยกเว้นเฉพาะจุดที่ยังไม่ตอบใน state ปัจจุบันตาม early resolution; ไม่ล้าง REVIEW หรือ unanswered checkpoint ใน state ก่อนหน้า. ผ่านต้นเรื่องไม่แปลว่าได้ตรวจทุก warning หรือเชี่ยวชาญทั้งหมวด

[RECOMMENDATION] Safe end, review end และ critical end ใน branch map เป็น narrative ending; final outcome ยังต้องใช้ C/N/U/T จริง. ทุกเรื่องมี W evidence-selection, D request decision และ V verification draft; ชื่อเหล่านี้เป็น design labels ไม่ใช่ runtime IDs. การเลื่อนผ่าน W โดยไม่ยืนยันเปิดทาง UNASSESSED ต้อง review ว่า template จะอนุญาตหรือบังคับตอบ; ไม่อ้างว่า current generic fixture ข้าม W ได้

### Verification, waiting and ending

“ตรวจแหล่งอิสระ” = ผู้เรียนเปิดเมนูแหล่งข้อมูลจำลองที่แยกจากผู้ติดต่อ แล้วเทียบข้อมูลที่เกี่ยวข้อง ไม่ใช้คำยืนยันหรือ URL ของผู้กล่าวอ้างเป็นหลักฐานอิสระ. แหล่งข้อมูลและผลตรวจ authored ล่วงหน้า. ไม่พบข้อมูลไม่เท่ากับพิสูจน์ว่าเป็น scam; สามารถพักคำขอและยุติโดยไม่มีธุรกรรมได้

การขอคิด ดูหลักฐาน คุยต่อ หรือถามผู้ติดต่อเพื่อรวบรวมข้อมูลไม่ควรถูกลง REVIEW ด้วยตัวมันเอง. R1/R2 ในชุดนี้จึงเขียนเป็นการยืนยันว่าหลักฐานไม่เพียงพอนั้นใช้แทนการตรวจได้แล้ว. การหยุดสนทนาอย่างปลอดภัยแยกจากปิดเว็บ/ออกจากฝึก. [DETAIL_PENDING] current generic d1.wait/d2.ask-caller และ s1.dismiss มี REVIEW mapping ที่กว้างกว่าข้อเสนอ ต้องทบทวน label/context ก่อนใช้; งานนี้ไม่แก้ rule

### Confirmation and critical boundary

[RECOMMENDATION] Text/Button: candidate/เปิดหน้ารายการ → อ่าน action, target, fictional data → explicit confirm → backend validation → commit ครั้งเดียว. Cancel ไม่ให้ SAFE ฟรีและไม่ล้าง REVIEW เดิม; ถ้า D ยังไม่ตอบให้กลับเลือกใหม่ ถ้าเริ่ม candidate จาก REVIEW ที่ commit แล้วให้กลับ REVIEW_RECOVERY ไม่เปิด D ซ้ำหรือเขียนทับผลเดิม. เงิน/เอกสาร/สิทธิ์ใน backstory เป็นสถานะตั้งต้น ไม่คิดเป็นการเลือกของผู้เรียน

[FUTURE VOICE UX] Call screen → mic → STT preview → Qwen → TTS. การกระทำที่มีผลต้อง candidate → readback ของระบบ → confirmation → backend validation → commit. ไม่ใช้ transcript หรือ “ครับ” ที่ไม่มีบริบทยืนยันเป็นการยินยอม. Pause mic/TTS ตัวละครขณะ confirmation ให้แก้ transcript/ยกเลิกได้. ไม่มีการโทรจริง ไม่มี voice clone. Current provider มี mock/OpenAI เท่านั้น ไม่พบ Qwen adapter หรือ voice pipeline ในงานนี้

### Evidence and feedback

[RECOMMENDATION] Scam ทุกเรื่องมี TRUE_WARNING 3 ชิ้นและ NEUTRAL 1 ชิ้น. ป้ายเป็น author-only; UI ไม่ใช้สีเฉลย ไม่เขียนว่า “นี่คือสัญญาณเตือน” ก่อนเลือก ไม่เตือน “อย่าโอน” ที่กำลังวัด. แสดงหลักฐานครบก่อนเปิด W. เสนอเกณฑ์ ALL_WARNINGS_NO_FALSE_POSITIVES: เลือกครบ warning ไม่เลือก neutral แล้ว finalize. ถ้าไม่ finalize ไม่สรุป REVIEW อัตโนมัติ

Feedback หลัง commit ต้องไม่เฉลย checkpoint ถัดไปที่ยังไม่ตัดสิน; แบบร่างหลักแสดงรายละเอียดใน result. Result มี outcome, encountered checkpoint explanations, warning ที่พบ, safe recommendations และ proposed tags. ไม่แสดง numeric training score หรือ weighted D/W/S. Current recommendation เลือก first REVIEW skill/critical mapping; tag หลายเรื่องในนี้เป็นข้อเสนอที่ต้อง map ก่อน implementation ไม่อ้างว่าบทเรียนใหม่ถูกสร้างแล้ว

Normal controls ไม่มี warning หรือ Critical ปลอม ไม่มี REVIEW บังคับ. การรับสายปกติหรือปฏิเสธคุยอย่างสุภาพไม่ใช่ความผิด. Outcome policy ยัง pending จึงวาด observation result ไม่สร้าง PASSED จาก C=0 อย่างเดียว และไม่กำหนดอัตราสุ่ม normal/scam

### Fallback and synthetic assets

[RECOMMENDATION] Qwen timeout/invalid schema/unsafe output → authored fallback ตาม intent เดิม หรือ pause/retry. ไม่สร้างเหตุการณ์ใหม่ ไม่ลดผลผู้เรียน และไม่ทำ action ซ้ำ. ข้อมูลจริงที่พิมพ์โดยไม่ตั้งใจไม่ควรถูกส่งต่อ/แสดงซ้ำ; ใช้มาตรการปิดบังของโครงงาน

ทุกฉากใช้ตัวละครสังเคราะห์ เอกสารลายน้ำ ยอดเงินสมมติ รหัส `123456-SIM` และ reference ที่ไม่ใช่บัญชีจริง. URL เป็น inert `example.invalid`; การเปิดต้องเป็น internal preview ไม่ส่ง request ภายนอก. QR เป็นภาพแทนหรือ token ภายในที่ไม่เปิดเว็บ/ชำระจริง. หน้าติดตั้งและ permission เป็นภาพจำลอง ไม่ติดตั้งไฟล์และไม่ขอสิทธิ์ OS. JOB-02 ใช้รายการเอกสารสังเคราะห์ให้เลือก ไม่มี upload เอกสารจริง

## Counts and current implementation

| รายการ | จำนวน / ความหมาย |
|---|---|
| Categories | 9 |
| Scam families | 19; IDs ตรง Story Bank |
| Normal controls | 2 แยกจาก scam |
| Frames | 252 = 236 scam + 16 control |
| Safe branches | 42 = 38 scam + 4 control; นับ named S1/S2 เท่านั้น |
| Review branches | 38 = R1/R2 ของ 19 เรื่อง; ไม่เพิ่มจากทุก combination ของ warning |
| Critical-candidate branches | 19; เรื่องละ K1; เป็น proposed gate ไม่ใช่ 19 กฎที่ implement แล้ว |
| Conditional content | 7 = 5 scam + 2 controls |
| Text-capable | 19 scam (17 text-only + 2 call center) และ 2 control drafts |
| Voice target | 4 Call Center รวม controls; FUTURE VOICE UX ทั้งหมด |
| Qwen frames | 109 = 103 scam + 6 control; dialogue concept เท่านั้น |
| Backend/system frames | 122 = 114 scam + 8 control; รวม result display |
| VALIDATED_ACTION frames | 101 = 95 scam + 6 control; control บันทึก observation ไม่ได้มี final scoring policy |
| SCRIPTED frames | 21 intro; หลักฐาน authored แยก ไม่เพิ่ม frame count |
| Ready YES | 0 เพราะ source ทั้ง bank ยัง proposed |
| NEEDS_CONTENT_REVIEW / CONDITIONAL | 14 / 7 |
| Current runtime | 9 text fixtures partial semantic mappings; ไม่ใช่ 21 storyboards ที่เล่นได้แล้ว |

## Detail pending register

รายการต่อไปนี้เป็น 31 review items: P01–P21 แยกตามเรื่อง และ G01–G10 เป็นกฎร่วม. บางรายการมีมากกว่าหนึ่งคำถาม ไม่อ้างว่าเป็นจำนวนข้อย่อยทั้งหมด

| ID | Story | Pending decision | Gate |
|---|---|---|---|
| P01 | CC-01 | DP-CC01: เนื้อคดี ลายน้ำเอกสาร และเงื่อนไขยุติหลังวางสาย | CONTENT_REVIEW |
| P02 | CC-02 | DP-CC02: ถ้อยคำวัตถุประสงค์รหัสและ UI readback สำหรับเสียง | CONTENT_REVIEW |
| P03 | CC-N01 | DP-N01: policy normal control และเงื่อนไขประเมินการตอบเวลาที่จำเป็น; ไม่กำหนดสัดส่วนสุ่ม | CONDITIONAL_CONTENT |
| P04 | CC-N02 | DP-N02: บริบทนัดเป็น recommendation ใน bank และ control outcome policy ยังไม่อนุมัติ | CONDITIONAL_CONTENT |
| P05 | INV-01 | DP-INV01: กราฟพอร์ตและประวัติทดลองต้องแสดงชัดว่าเป็นสถานะตั้งต้น ไม่มีการโอนของผู้เล่น | CONTENT_REVIEW |
| P06 | INV-02 | DP-INV02: อนุมัติ news-derived family และแบบจำลองรายได้; DP-INV02-C: เกณฑ์ต่อการชวนคนต้องพิจารณาแยกจากการโอน | CONDITIONAL_CONTENT |
| P07 | ROM-01 | DP-ROM01: เหตุเดินทาง ความเข้มข้นทางอารมณ์ และข้อความข้ามเวลาต้องทบทวน | CONTENT_REVIEW |
| P08 | ROM-02 | DP-ROM02: เอกสารของขวัญสมมติและบทสองตัวละคร ต้องไม่เลียนเอกสารราชการจริง | CONTENT_REVIEW |
| P09 | ECO-01 | DP-ECO01: รายละเอียดสินค้าและนโยบายแพลตฟอร์มสมมติ | CONTENT_REVIEW |
| P10 | ECO-02 | DP-ECO02: ความสัมพันธ์คำสั่งซื้อและฉลาก; เกณฑ์ Critical ต่อการจ่าย COD ต้องอนุมัติ | CONTENT_REVIEW |
| P11 | ECO-03 | DP-ECO03: อนุมัติข่าว-derived family และ action ส่งมอบสินค้า; แยก delayed payment จาก fabricated receipt | CONDITIONAL_CONTENT |
| P12 | PHI-01 | DP-PHI01: โดเมนบริการสมมติและชุดตัวเลือกหลักฐาน; QR เป็น variant ไปแบบฟอร์มเดิม | CONTENT_REVIEW |
| P13 | PHI-02 | DP-PHI02: บริการสมมติและระดับสิทธิ์ที่กำหนด Critical; ห้ามสร้าง APK | CONTENT_REVIEW |
| P14 | TASK-01 | DP-TASK01: เลือกภารกิจคำสั่งซื้อจำลองและ ledger งาน; แยกประวัติเงินสำรองจาก action ผู้เล่น | CONTENT_REVIEW |
| P15 | LOAN-01 | DP-LOAN01: เงื่อนไขสินเชื่อสมมติและหลักฐานรายการที่ช่องทางกลางตรวจได้ | CONTENT_REVIEW |
| P16 | LOAN-02 | DP-LOAN02: แยกผู้ให้กู้ปลอมกับสินเชื่อละเมิดข้อมูล; อนุมัติ critical contacts และระดับคำขู่ | CONDITIONAL_CONTENT |
| P17 | REC-01 | DP-REC01: ประวัติสูญเสียและเอกสารช่วยเหลือ; หลีกเลี่ยงการตำหนิผู้เสียหาย | CONTENT_REVIEW |
| P18 | REC-02 | DP-REC02: SOURCE SPECIFICITY ของ recovery + fake complaint remote และความต่าง PHI-02 ต้องอนุมัติ | CONDITIONAL_CONTENT |
| P19 | JOB-01 | DP-JOB01: รายละเอียดตำแหน่งและนโยบายค่าใช้จ่ายของบริษัทสมมติ | CONTENT_REVIEW |
| P20 | JOB-02 | DP-JOB02: independent data-only flow, necessity matrix และ DOCSET critical threshold ต้อง review ก่อนใช้จริง | CONDITIONAL_CONTENT |
| P21 | JOB-03 | DP-JOB03: หน้าที่งาน เจ้าของเงินสังเคราะห์ และ critical action ส่งต่อ/ให้ใช้บัญชีต้องแยกกัน | CONTENT_REVIEW |
| G01 | ทุกเรื่อง | [DETAIL_PENDING] อนุมัติ frame-to-state mapping, เปิด checkpoint จาก state-entry และ action bindings; ไม่ใช้ frame number เป็น state | BEFORE_IMPLEMENTATION |
| G02 | ทุกเรื่อง | [DETAIL_PENDING] early safe exit exemption, end-contact เทียบ abandon, การข้าม W และผล N; ไม่ล้างจุดเก่าค้าง | BEFORE_IMPLEMENTATION |
| G03 | Scam 19 | [DETAIL_PENDING] อนุมัติ warning/neutral wording, rubric และ feedback ที่ไม่เฉลยก่อนตัดสิน | BEFORE_IMPLEMENTATION |
| G04 | Critical | [DETAIL_PENDING] threshold ใหม่ COD/dispatch/documents/contacts/forwarding และ INV-02 recruitment; ไม่เหมารวมการจ่ายหรือเปิด preview | BEFORE_IMPLEMENTATION |
| G05 | Call Center | [DETAIL_PENDING] voice readback/confirmation, transcript แก้ไข, ambiguous yes, latency และ fallback; ไม่มี pipeline ปัจจุบัน | BEFORE_IMPLEMENTATION |
| G06 | Review choices | [DETAIL_PENDING] แก้ความกำกวมของ current wait/ask-caller/dismiss ในขั้น design ไม่ให้ลงโทษการรอ/ถาม/ยุติที่ปลอดภัย | BEFORE_IMPLEMENTATION |
| G07 | Normal controls | [DETAIL_PENDING] outcome/observation policy และเงื่อนไขนำไปใช้; ไม่สร้าง scam warnings หรือสัดส่วนสุ่มเอง | BEFORE_IMPLEMENTATION |
| G08 | Result | [DETAIL_PENDING] map proposed content tags กับ current first-review/critical recommendation และ public feedback ไม่ใช้ hidden rule IDs ใน UI | BEFORE_IMPLEMENTATION |
| G09 | Qwen/assets | [DETAIL_PENDING] อนุมัติ facts/allowed tactics/authored fallback, source context และตัวอย่างข้อความ; QA schema/safety หลัง implement เท่านั้น | BEFORE_IMPLEMENTATION |
| G10 | Timing/content | [DETAIL_PENDING] ทดลองอ่านและวาด draft ทวน pressure/ภาระอ่าน/เวลา; ใช้ planning estimate ไม่ claim benchmark | BEFORE_IMPLEMENTATION |

## Cross-story consistency audit

[RECOMMENDATION] ตรวจจาก interaction จริง ไม่เพิ่มหรือลบ family

| Pair | ความต่างที่รักษาใน storyboard | ผลทบทวน |
|---|---|---|
| CC-01 / CC-02 | ข้อกล่าวหาคดี/เงินตรวจ vs รหัสที่ผู้โทรขอ; เอกสารคดี vs วัตถุประสงค์ OTP | เก็บสองเรื่อง; ไม่เปลี่ยน CC-02 เป็น link-only |
| INV-01 / INV-02 | พอร์ตและถอนยอดเดิม vs ที่มารายได้/สมาชิกใหม่ | ไม่ merge; INV-02 ยัง conditional approval |
| INV-01 / TASK-01 | ลงทุน/พอร์ต/ถอน vs งานที่ทำ/ค่าจ้าง/ข้อกล่าวหางานผิด | เก็บเมื่อ asset และ verification ต่างจริง; ไม่เปลี่ยนเพียงคำว่ากำไร |
| ROM-01 / ROM-02 | คนรักขอช่วยตรง vs บุคคลที่สามเรียกค่าของขวัญ | ความสัมพันธ์มี time jump ก่อนเงินทั้งคู่ แต่หลักฐานและช่องตรวจต่าง |
| ECO-01 / ECO-02 / ECO-03 | ผู้ซื้อเลือกร้าน vs ผู้รับไม่ได้สั่ง vs ผู้ขายปล่อยสินค้า | บทบาทและแหล่งตรวจต่างชัด; ECO-03 รอ action ส่งมอบ |
| PHI-01 / PHI-02 | submit credential form vs permission device | เปิดลิงก์/preview ไม่เป็น critical เอง |
| PHI-02 / LOAN-02 / REC-02 | บริการไม่ร้องขอ vs สินเชื่อ/รายชื่อ/คำขู่ vs prior loss/แจ้งเหตุ/remote | LOAN-02 และ REC-02 conditional; ถ้าภายหลังตัดบริบทเหลือ generic install ต้อง re-review dedup |
| LOAN-01 / REC-01 / JOB-01 | ใบสมัครกู้/วงเงิน vs prior loss/คดีช่วยคืน vs ประกาศงาน/HR | เก็บไว้ด้วย lifecycle/evidence/verification; ไม่ใช้ fee label เป็นเหตุแยก |
| JOB-01 / JOB-02 / JOB-03 | จ่ายเพื่อเริ่มงาน vs ความจำเป็นเอกสาร vs ใช้บัญชีส่งต่อ | JOB-02 หากกลายเป็นแค่ขั้นย่อยสมัคร ให้ผู้ตรวจตัดสิน disposition; งานนี้ไม่ merge |
| ECO-02 / CC-N01 | ไม่มีผู้ยืนยันคำสั่งซื้อ vs คำสั่งซื้อตรงแหล่งเดิม | ไม่สร้าง critical เพียงเพราะเป็นสาย/พัสดุ |

ความต่างที่ pending ไม่ถูกปิดด้วยการแต่งคำพูด Source identity ทั้ง 21 คงเดิม Status ที่เพิ่มเป็น approval flag ไม่แก้ selection tier ใน bank

<a id="master-review"></a>

## Master review

**Q1. ครบ 9 categories หรือไม่?** ครบ ทุกหมวดมี storyboard ตั้งแต่ก่อนเริ่มจน result และ branch; 19 scam + 2 controls. Recovery มี REC-01 สำหรับ draft เต็ม และ REC-02 conditional

**Q2. เรื่องใดพร้อมวาดทันที?** โครงภาพ draft วาดได้ทั้งหมด. สำหรับ final drawing ไม่มี YES ที่อ้าง approval ได้; 14 เรื่อง NEEDS_CONTENT_REVIEW คือ CC-01, CC-02, INV-01, ROM-01, ROM-02, ECO-01, ECO-02, PHI-01, PHI-02, TASK-01, LOAN-01, REC-01, JOB-01, JOB-03. แนะนำใช้ draft เหล่านี้ตรวจ flow ก่อน ข้อความยังรอ content review

**Q3. เรื่องใดยัง DETAIL_PENDING?** ทุกเรื่องมีรายการ P ใน register; 7 เรื่อง conditional คือ INV-02, ECO-03, LOAN-02, REC-02, JOB-02, CC-N01, CC-N02. กฎร่วมมี G01–G10 ไม่มีการอ้างว่า source gap ได้รับอนุมัติเพียงเพราะเขียนเฟรมครบ

**Q4. Flow ซ้ำเกินไปหรือไม่?** Tail confirmation/verification/result ใช้ pattern เดียวเพื่อสอดคล้องกับ Rule Engine แต่ contact, evidence, roles และสิ่งที่ตรวจต่างกัน. กลุ่ม app และ upfront-fee ยังเสี่ยงเขียนซ้ำ ให้ใช้ audit table เป็น gate ไม่อ้างว่าความต่างพิสูจน์ด้วยผู้ใช้แล้ว

**Q5. ควร merge family ใด?** ยังไม่เสนอ merge จาก draft นี้. JOB-02 และ REC-02 ต้องตรวจ independence; หาก reviewers ตัดบริบทหลักออกจึงพิจารณา reclassify/merge ใน source review รอบถัดไป ไม่แก้ bank เงียบ ๆ

**Q6. Rule mapping ใดยังไม่ชัด?** New checkpoint/action labels ทุกเรื่องต้อง map; เฉพาะ LOAN-02 ตำแหน่ง critical contacts ต่าง fixture install, ECO-02/COD, ECO-03/dispatch, JOB-02/docset, JOB-03/forwarding และ INV-02 ชวนคนยังมี threshold gaps. W skip/early-exit/normal result ยังต้องอนุมัติ

**Q7. Critical ใดแรงหรือกว้างเกิน?** ไม่ถือการดูเว็บ ติดตั้ง preview คุยต่อ ถามคำถาม รอ หรือมีเงินใน backstory เป็น Critical. COD payment/ส่งสินค้า/เอกสาร/contacts ต้องจำกัดตามบริบทที่ review. INV-02 ใช้ยืนยันลงทุนเป็น K1 เท่านั้น ไม่จัดการชวนทุกแบบเป็น Critical. Normal ไม่มี critical

**Q8. Frames เหมาะกับเวลาหรือไม่?** 12–14 ต่อ scam และ 8 ต่อ control; ไม่ต้องเล่นทุก branch. วาง budget text 4–6, romance 6–8, voice 6–9 นาที. การวาดครบไม่ยืนยันเวลาใช้งานจริง ต้อง trial dialogue/evidence readability โดยเฉพาะ INV-01/TASK-01/ROM-02

**Q9. วาด Call Center Voice ได้โดยไม่ claim implementation หรือไม่?** ได้ ใช้ภาพ call/mic/transcript/readback/system-confirmation และระบุ FUTURE VOICE UX ทุก record. Current text CC-02 เป็น partial mapping เท่านั้น; CC-01 และ controls ยังไม่ใช่ playable dedicated flows

**Q10. ต้องอนุมัติอะไรก่อน implementation?** Family/content gates, evidence/rubric, frame-state/checkpoint mapping, exact critical thresholds, early-exit/omission/review semantics, normal policy, voice confirmation, fallback และ recommendation routing. จบงานนี้ที่ documentation commit/push ไม่เริ่ม State/Checkpoint implementation

## Document QA and counting rules

ตรวจเชิงเอกสาร: ID set เทียบ Story Bank ณ HEAD, identity/title/tier, จำนวน frames, fields ทุกเฟรม, summary tables, 21 Mermaid และ 21 text branch maps, target references, links, normal exception, conditional labels และ documentation-only diff. ตัวเลข branch นับ S1/S2, R1/R2, K1 ที่ตั้งชื่อ ไม่ใช่ทุกเส้นในกราฟหรือทุก permutation. Qwen count นับ primary content owner ต่อเฟรม; backend count รวม display result ส่วน VALIDATED_ACTION แยกนับ

ผลตรวจเอกสาร 2026-09-28: ผ่านการเทียบ ID ทั้ง 21 กับ Story Bank, 252 เฟรมเรียงหมายเลขครบและมี metadata ทุกช่อง, 21 text branch maps และ 21 Mermaid graphs มี node/target ครบและเดินจาก F01 ถึงทุกเฟรมได้, ลิงก์ไฟล์อ้างอิงไม่ขาด, scam ทุกเรื่องมี warning 3/neutral 1 และ R1/R2, จำนวน owner ตรงสารบัญ ตรวจเพิ่มว่า cancel จาก REVIEW ที่ commit แล้วไม่ย้อนกลับไปเขียนทับ D

ตรวจ hash ของ Story Bank, Deduplication, Rule Engine และ untracked database document ว่าไม่เปลี่ยน. ไม่รัน application tests หรือ Playwright เนื่องจากไม่แก้ code. Mermaid ตรวจโครงสร้างข้อความและ graph references; ยังไม่ได้ render ผ่าน Mermaid renderer จึงไม่อ้างว่าทดสอบภาพวาดหรือ UI จริงแล้ว

## Handoff

Scenario Storyboard Specification เสร็จแล้ว

กรุณากลับไปที่ ChatGPT แชทหลัก แล้วพิมพ์:

`review scenario storyboard`

STOP — รอ review ก่อน implementation
