# MITJEE Scenario Deduplication Report

Content curation only | 2026-09-27 | Status: PROPOSED_FOR_REVIEW

Branch: `feat/rule-based-evaluation`. Historical baseline ของการคัดเนื้อหา: `491a48bcaa15260eb3837a50ca46b15d24ac4488`. ไม่ใช่ current runtime HEAD. ตรวจ alignment ล่าสุด 2026-10-02 หลัง fetch ที่ `7ce29f87d247c457789489a3e0e7091e005c24b2`; ไม่แก้ runtime, fixtures, rules, Prisma หรือ migrations.

## Current runtime vs content taxonomy

รายงานนี้นับ **19 scam families + 2 matched-control targets** ไม่ใช่ 21 runtime stories. Runtime ปัจจุบันมี 9 playable category-level demos พร้อม Call Center NORMAL/SCAM variation; mapping รายเรื่องและตารางนับกลางอยู่ใน [Story Bank](scenario-story-bank.md#18-current-runtime-alignment). SCAM_CALL ใกล้ CC-02; NORMAL_CALL ยังเป็นห้องสมุดสมมตินัดรับหนังสือ ไม่ใช่ CC-N01/CC-N02. การแทน OLD CC-N02 ในแบบเนื้อหาด้านล่างไม่ได้เปลี่ยน fixture ห้องสมุดในโค้ด.

Backend selection 50/50 (`randomInt(2)`), Voice UI/Azure adapter, authenticated WebSocket, HTTP fallback และ Mock/OpenAI/Groq implement แล้ว. Live Azure/Groq และ current dedicated MySQL/browser E2E ยัง NOT RUN; Luna ยังรอเครดิต ตาม [รายงาน 2026-10-02](realtime-verification.md). ข่าวและ provenance ด้านล่างเป็นหลักฐานเนื้อหา ไม่ใช่หลักฐานว่า implement หรือ live-verified แล้ว. ชุด design นี้ไม่สร้าง DB tables/dataset; Game 8 และ Knowledge Base 16 ยังเป็น planned domains แยก.

## Call Center matched-control revision (2026-09-30)

CONTENT REFINEMENT ONLY | baseline `4062a8b837728a3aed56df48ea35eaeaf0c3fa87`

| Record | Disposition | Reason / provenance |
|---|---|---|
| OLD CC-N02: สายแจ้งเตือนนัดหมายปกติ / Normal appointment reminder | REPLACED_AS_CONTROL_RECOMMENDATION | เป็นตัวอย่างสายปกติที่ใช้ได้ แต่บริบทนัดหมายจับคู่กับ scam calls ปัจจุบันได้ไม่ใกล้พอ ผู้เรียนอาจเดาจากหัวข้อ จึงแทนเนื้อหา ไม่ได้ตัดสินว่าตัวอย่างเดิมผิด |
| NEW CC-N02: สายธนาคารปกติแจ้งให้ตรวจสอบรายการ / Normal bank transaction notification | CONTROL / CONDITIONAL_CONTENT | จับคู่ CC-02 ที่บริบทธนาคาร/รายการธุรกรรม ต่างกันที่ไม่ขอ OTP/เงินและให้ตรวจแอปเอง; USER_SOURCE_DERIVED control concept + RECOMMENDATION for bank-transaction matched context ไม่อ้างว่าบทธนาคารอยู่ในต้นฉบับ CC-S06 |
| CC-N01: สายยืนยันการจัดส่งปกติ | CONTROL / CONDITIONAL_CONTENT; REFINED_MATCHED_CONTROL | ยึดแนวคิดสายจัดส่งจาก CC-S06 และระบุ matchedScamFamily CC-01; ทางเข้าพัสดุเหมือนกันแต่ไม่มีการอ้างคดี กดดัน หรือเรียกเงิน |

| Pair | Scam | Normal | Same context | Key difference |
|---|---|---|---|---|
| A | CC-01 | CC-N01 | parcel / delivery | สายหลอกเริ่มเรื่องพัสดุแล้วอ้างอำนาจ คดี เอกสาร และขอโอนเงิน; สายปกติยืนยันการจัดส่งที่มีคำสั่งซื้ออยู่แล้วและตอบเพียงข้อมูลจำเป็น |
| B | CC-02 | CC-N02 | bank / transaction notification | สายหลอกขอ OTP และเร่งให้ทำตามในสาย; สายปกติให้เปิดแอปเอง ไม่ขอข้อมูลลับหรือเงิน และยอมรับการวางสาย/ติดต่อกลับ |

คง 19 scam families + 2 normal controls ไม่เพิ่ม CC-N03 และไม่นับ OLD CC-N02 เป็นเรื่องที่ยังใช้อยู่ เป้าหมายการเรียนคือดูคำขอ การตรวจอิสระ การรักษาข้อมูล แรงกดดัน/ความลับ และสิทธิ์วางสาย ไม่เหมารวมตำรวจ ธนาคาร หรือสายไม่รู้จักเป็น scam

การเลือก matched-context พัสดุ CC-01/CC-N01 หรือธนาคาร CC-02/CC-N02 ยังเป็นแนวคิดอนาคต ไม่กำหนดอัตรารายคู่. แยกจาก runtime selector NORMAL_CALL ห้องสมุด / SCAM_CALL ธนาคารปลอมที่ implement 50/50 แล้ว. Target controls ไม่มี harmful action หรือ warning ปลอม; หากทำ classifier/evaluation ให้เก็บ matched-pair links และทบทวนการรั่วของ template ร่วม ไม่รวม controls ใน scam-family count และไม่สร้างข้อมูลฝึกรอบนี้

## 1. Scope and Counting Rules

**USER_SOURCE:** `E:/locate/Listขอscenarioกับตำรวจ.txt`; SHA-256 `3bf2f4367485fba2f27b453a2fe3ee9dadbe1b1120ad35af1391e108bcb6c813`. อ่านทั้งไฟล์เพื่อหาขอบเขต แต่ classify เฉพาะ 62 bullet ใน 9 dialogue categories; ในนั้น 61 bullet เกี่ยวกับ scam และ 1 bullet เป็น normal-control concept. ส่วนเกมเดิม 54 bullet แยกออก ไม่ปนเข้าคลังนี้

**RECOMMENDATION:** นับหนึ่งบรรทัดที่เริ่ม `*` เป็นหนึ่ง original item แม้มีหลายองค์ประกอบ. ECO-S03 มีทั้งสินค้าไม่ตรงรายละเอียดและพัสดุที่ไม่ได้สั่ง จึง map ได้สอง family แต่ไม่เพิ่ม original count. Source IDs ด้านล่างเป็นรหัสตรวจสอบเอกสาร ไม่ใช่ runtime IDs

| Metric | Count | Definition |
|---|---:|---|
| Original dialogue items reviewed | 62 | 61 scam-related + 1 normal-control concept |
| Old-game bullets excluded | 54 | ไม่ classify เป็น dialogue content |
| Initial user-derived working candidates | 29 | UC01–UC29; ไม่ได้ยอมรับว่า unique ทั้งหมด |
| News-derived candidates added | 3 | NC01–NC03 หลังวิเคราะห์ source เดิม |
| Total candidates before consolidation | 32 | 29 + 3 |
| DUPLICATE candidates merged | 5 | UC06, UC10, UC13, UC21, UC25 |
| VARIANT_ONLY candidates demoted | 8 | UC02, UC04, UC07, UC11, UC14, UC17, UC18, UC27 |
| Total candidate reductions | 13 | 5 merges + 8 demotions; ไม่ใช่ 13 bullet ถูกลบ |
| User-source-derived unique families | 16 | โครงเรื่องจากผู้ใช้; รายละเอียดที่เติมมีป้ายแยก |
| Final unique scam families | 19 | 32 - 13 = 16 user-derived + 3 news-derived |
| Named variant options | 32 | V01–V32; ไม่ใช่ 32 playable templates หรือ Cartesian combinations |
| Controlled tactic tags | 27 | ตาม taxonomy ใน Story Bank |
| Minimum Demo Set | 9 | หนึ่งเรื่องต่อ category; เป็น subset ของ core |
| Core Project Set inclusive | 18 | DEMO 9 + CORE-only 9; จำนวนที่เสนอ ไม่ใช่ implement แล้ว |
| Extended-only pool | 1 | JOB-02; ไม่รวม core |
| Entire bank including extended | 19 | Core 18 + Extended-only 1 |
| Normal controls | 2 | CC-N01, CC-N02; ไม่รวม scam totals |
| Cross-category overlap cases reviewed | 8 | X01–X08; หนึ่ง canonical cross-category duplicate |

ไม่ฝืนขยายเป็น 30–50 families: source นี้ยังไม่มีความต่างด้านกลไกเพียงพอ. จำนวน 19 เป็นผลคัดกรองเชิงเนื้อหาที่รอ review ไม่ใช่จำนวนรูปแบบ scam ทั้งหมดในประเทศไทย และไม่ใช่การอนุมัติให้สร้างทุกเรื่องทันที

## 2. Source Item Classification Ledger

**USER_SOURCE:** คอลัมน์ข้อความคง bullet เดิม. **RECOMMENDATION:** primaryClass เลือกหนึ่งจากเก้าประเภทที่กำหนด; บางข้อมีความหมายรอง แต่ไม่ถูกนับซ้ำ. Mapping เป็นการจัดหมวด ไม่ใช่ exact rule/state specification

| Source ID | Original bullet | primaryClass | Mapping / disposition |
|---|---|---|---|
| CC-S01 | แอบอ้างเป็นตำรวจและแจ้งว่าผู้เสียหายเกี่ยวข้องกับคดี | STORY_ELEMENT | CC-01 |
| CC-S02 | อ้างว่าพบพัสดุผิดกฎหมายหรือพัสดุตกค้าง | STORY_ELEMENT | พัสดุผิดกฎหมายเป็น CC-01 variant; พัสดุตกค้างลำพัง DETAIL_PENDING ไม่สร้าง family |
| CC-S03 | แอบอ้างเป็นธนาคารและแจ้งธุรกรรมผิดปกติ | STORY_ELEMENT | CC-02; คำขอ OTP มาจาก CURRENT_CODE/ข่าว ไม่ได้อยู่ใน bullet นี้ |
| CC-S04 | อ้างว่าบัญชีเกี่ยวข้องกับการฟอกเงินหรือบัญชีม้า | VARIANT | ข้อกล่าวหาใน CC-01; ไม่ใช่ JOB-03 ซึ่งขอให้ใช้บัญชีจริงในบทจำลอง |
| CC-S05 | โอนสายไปยังเจ้าหน้าที่ระดับสูงหรือส่งเอกสารราชการปลอม | ESCALATION_STEP | CC-01; FAKE_DOCUMENT/AUTHORITY_PRESSURE ไม่ใช่เรื่องใหม่ |
| CC-S06 | ตัวอย่างสายปกติที่ประชาชนอาจได้รับจริง เช่น การยืนยันการจัดส่งหรือการแจ้งเตือนจากหน่วยงาน เพื่อนำมาใช้สุ่มร่วมกับสายหลอกลวง | OTHER | CC-N01 สายจัดส่ง source-derived; CC-N02 ใช้แนวคิด control ทั่วไป แต่บริบทธนาคารจับคู่ CC-02 เป็น RECOMMENDATION รอบ 2026-09-30 |
| INV-S01 | โฆษณาการลงทุนที่รับประกันผลตอบแทนสูง | WARNING_SIGN | INV-01 |
| INV-S02 | แอบอ้างผู้เชี่ยวชาญ นักลงทุน หรือบุคคลมีชื่อเสียง | PERSONA | INV-01 persona; ไม่สร้าง analyst/influencer families |
| INV-S03 | เชิญเข้ากลุ่มสนทนาที่มีสมาชิกและรีวิวปลอม | TACTIC | INV-01 SOCIAL_PROOF/FAKE_REVIEW |
| INV-S04 | ให้ทดลองลงทุนจำนวนเล็กน้อยและแสดงกำไรจำลอง | STORY_ELEMENT | INV-01 ระยะแรก |
| INV-S05 | เปิดให้ถอนเงินจำนวนเล็กน้อยเพื่อสร้างความเชื่อมั่น | ESCALATION_STEP | INV-01 ไม่ใช่ story แยก |
| INV-S06 | ปฏิเสธการถอนและเรียกค่าภาษี ค่าประกัน หรือค่าปลดล็อก | CRITICAL_REQUEST | INV-01 ระยะเรียกเงินเพิ่ม |
| INV-S07 | การลงทุนปลอมเกี่ยวกับหุ้น สินทรัพย์ดิจิทัล Forex ทองคำ หรือธุรกิจออนไลน์ | VARIANT | V05–V09; asset ไม่กำหนด family |
| ROM-S01 | ใช้บัญชีและตัวตนปลอมสร้างความสัมพันธ์ออนไลน์ | STORY_ELEMENT | ROM-01/ROM-02 opening ร่วม |
| ROM-S02 | แอบอ้างเป็นชาวต่างชาติ ทหาร แพทย์ นักธุรกิจ หรือผู้มีฐานะ | PERSONA | V12–V15; อาชีพ/สัญชาติไม่ใช่หลักฐานว่าโกง |
| ROM-S03 | สร้างความสนิทสนมก่อนขอยืมเงินหรือขอความช่วยเหลือ | STORY_ELEMENT | ROM-01 |
| ROM-S04 | อ้างเหตุฉุกเฉิน การเจ็บป่วย หรือปัญหาในการเดินทาง | VARIANT | ROM-01 V16/V17 |
| ROM-S05 | อ้างว่ามีทรัพย์สินหรือพัสดุที่ต้องชำระค่าธรรมเนียม | STORY_ELEMENT | ROM-02 |
| ROM-S06 | ชักชวนลงทุนหลังสร้างความไว้วางใจ | STORY_ELEMENT | INV-01 hybrid relationship entry; ไม่ตั้ง ROM investment family ซ้ำ |
| ROM-S07 | หลีกเลี่ยงการพบตัวจริงหรือการยืนยันตัวตนผ่านช่องทางอื่น | WARNING_SIGN | ROM-01/ROM-02 |
| ECO-S01 | ร้านค้าหรือเพจปลอมเสนอสินค้าราคาต่ำผิดปกติ | STORY_ELEMENT | ECO-01 |
| ECO-S02 | รับเงินแล้วไม่ส่งสินค้า | STORY_ELEMENT | ECO-01 outcome V19 |
| ECO-S03 | ส่งสินค้าไม่ตรงรายละเอียดหรือส่งพัสดุเก็บเงินปลายทางที่ไม่ได้สั่ง | STORY_ELEMENT | wrong-item outcome ECO-01/V20; unsolicited COD ECO-02 |
| ECO-S04 | หลอกให้จ่ายมัดจำหรือชำระเงินล่วงหน้า | CRITICAL_REQUEST | ECO-01/V18 |
| ECO-S05 | ชักชวนให้ออกจากระบบซื้อขายของแพลตฟอร์ม | TACTIC | ECO-01 OFF_PLATFORM_PAYMENT |
| ECO-S06 | เปลี่ยนช่องทางชำระเงินหรือให้โอนเข้าบัญชีบุคคล | CRITICAL_REQUEST | ECO-01; ยังไม่ใช่ BEC game case |
| ECO-S07 | ใช้ภาพสินค้า รีวิว สลิป หรือเลขพัสดุปลอม | TACTIC | ECO-01 assets; สลิปไม่ระบุบทผู้เรียนผู้ขาย จึงเติม ECO-03 ด้วย NEWS_DERIVED ไม่อ้างว่าระบุไว้ครบแล้ว |
| PHI-S01 | SMS แจ้งพัสดุตกค้างหรือค่าจัดส่ง | VARIANT | PHI-01/V21 |
| PHI-S02 | ข้อความแจ้งว่าบัญชีธนาคารถูกระงับ | VARIANT | PHI-01/V22 |
| PHI-S03 | ข้อความแจ้งเงินคืน ภาษี หรือสิทธิประโยชน์ | VARIANT | PHI-01/V23 |
| PHI-S04 | ลิงก์เว็บไซต์ธนาคารหรือหน่วยงานรัฐปลอม | TACTIC | PHI-01 PHISHING_LINK |
| PHI-S05 | หน้าเข้าสู่ระบบหรือแบบฟอร์มที่ขอรหัสผ่าน ข้อมูลบัตร หรือ OTP | CRITICAL_REQUEST | PHI-01 |
| PHI-S06 | ลิงก์ที่ชักชวนให้ติดตั้งแอปหรือไฟล์อันตราย | STORY_ELEMENT | PHI-02; ต่างจากการกรอกเว็บ |
| PHI-S07 | QR Code หรือหน้าชำระเงินปลอม | VARIANT | PHI-01/V24 เมื่อจบที่ credential form; payment-redirection semantics ยัง DETAIL_PENDING |
| TASK-S01 | งานกดถูกใจ กดติดตาม หรือรีวิวสินค้าเพื่อรับเงิน | VARIANT | TASK-01/V25/V26 |
| TASK-S02 | งานกดคำสั่งซื้อหรือเพิ่มยอดขายให้ร้านค้า | VARIANT | TASK-01/V27 |
| TASK-S03 | การจ่ายค่าตอบแทนเล็กน้อยในช่วงแรก | ESCALATION_STEP | TASK-01 SMALL_INITIAL_REWARD |
| TASK-S04 | การเชิญเข้ากลุ่มงานหรือระดับสมาชิกพิเศษ | ESCALATION_STEP | TASK-01 |
| TASK-S05 | การกำหนดให้สำรองเงินหรือเติมเงินเพื่อทำภารกิจ | CRITICAL_REQUEST | TASK-01 |
| TASK-S06 | อ้างว่าผู้ใช้งานทำรายการผิดและต้องจ่ายเงินแก้ไข | ESCALATION_STEP | TASK-01 ไม่แยก repair family |
| TASK-S07 | เรียกค่าปลดล็อก ค่าภาษี หรือเงินเพิ่มเติมก่อนถอนกำไร | CRITICAL_REQUEST | TASK-01 culmination |
| LOAN-S01 | โฆษณาสินเชื่อที่รับประกันอนุมัติ | WARNING_SIGN | LOAN-01 opening; ใช้เป็น LOAN-02 entry ได้ |
| LOAN-S02 | แจ้งผลอนุมัติวงเงินอย่างรวดเร็วโดยไม่ตรวจสอบข้อมูล | WARNING_SIGN | LOAN-01 |
| LOAN-S03 | เรียกค่าดำเนินการ ค่าประกัน หรือค่าปลดล็อกก่อนรับเงิน | CRITICAL_REQUEST | LOAN-01/V28/V29 |
| LOAN-S04 | ชักชวนให้ติดตั้งแอปจากลิงก์ภายนอก | STORY_ELEMENT | LOAN-02 |
| LOAN-S05 | แอปขอสิทธิ์เข้าถึงรายชื่อผู้ติดต่อ SMS รูปภาพ หรือ Accessibility | CRITICAL_REQUEST | LOAN-02; ชนิด permission เป็น evidence ไม่เพิ่ม family |
| LOAN-S06 | ข่มขู่ว่าจะเปิดเผยข้อมูลหรือแจ้งบุคคลในรายชื่อผู้ติดต่อ | ESCALATION_STEP | LOAN-02 coercion; ไม่มีข้อมูลบุคคลจริง |
| LOAN-S07 | แอบอ้างธนาคารหรือบริษัทสินเชื่อที่มีอยู่จริง | PERSONA | LOAN-01/LOAN-02; ในบทใช้หน่วยงานสมมติเท่านั้น |
| REC-S01 | ติดต่อผู้ที่เคยถูกหลอกและอ้างว่าสามารถนำเงินกลับคืนได้ | STORY_ELEMENT | REC-01; entry context ของ REC-02 |
| REC-S02 | แอบอ้างเป็นตำรวจ ทนาย เจ้าหน้าที่ธนาคาร หรือบริษัทติดตามทรัพย์สิน | PERSONA | REC-01/V30/V31; ไม่แยก 4 families ตามอาชีพ |
| REC-S03 | แสดงหมายเลขคดี หนังสือรับรอง หรือเอกสารปลอม | TACTIC | REC-01 FAKE_DOCUMENT |
| REC-S04 | รับประกันว่าจะได้เงินคืนภายในระยะเวลาที่กำหนด | WARNING_SIGN | REC-01 |
| REC-S05 | เรียกค่าดำเนินการ ค่าประกัน หรือภาษีก่อนคืนเงิน | CRITICAL_REQUEST | REC-01 |
| REC-S06 | เรียกชำระเงินเพิ่มหลายครั้งหลังจากผู้เสียหายจ่ายครั้งแรก | ESCALATION_STEP | REC-01 ไม่แยก repeat-fee story |
| JOB-S01 | ประกาศงานออนไลน์ที่เสนอรายได้สูงผิดปกติ | WARNING_SIGN | JOB-01/JOB-02/JOB-03 entry cue |
| JOB-S02 | รับเข้าทำงานทันทีโดยไม่มีการสัมภาษณ์หรือการตรวจสอบ | WARNING_SIGN | JOB-01; cue ไม่ใช่ข้อพิสูจน์อย่างเดียว |
| JOB-S03 | สัมภาษณ์ผ่านข้อความเพียงอย่างเดียว | WARNING_SIGN | JOB-01; ไม่สอนว่า chat interview ทุกครั้งคือ scam |
| JOB-S04 | เรียกค่าสมัคร ค่าอบรม ค่าอุปกรณ์ หรือเงินประกัน | CRITICAL_REQUEST | JOB-01 |
| JOB-S05 | ขอสำเนาบัตรประชาชน ข้อมูลบัญชี หรือเอกสารเกินความจำเป็น | STORY_ELEMENT | JOB-02; ห้ามสรุปว่าขอเอกสารสมัครงานทุกกรณีผิด |
| JOB-S06 | งานต่างประเทศหรือบริษัทที่ตรวจสอบไม่ได้ | VARIANT | JOB-01/V32; หากภายหลังพบ flow การเดินทาง/กักขัง ต้อง review แยก ไม่เติมเอง |
| JOB-S07 | เสนองานให้ใช้บัญชีส่วนตัวรับ โอน หรือส่งต่อเงิน | STORY_ELEMENT | JOB-03; MONEY_MULE เป็น tag ไม่สร้างหมวดที่ 10 |
| JOB-S08 | แอบอ้างฝ่ายทรัพยากรบุคคลหรือบริษัทที่มีอยู่จริง | PERSONA | ทั้ง JOB; ใช้ตัวตนสมมติในระบบ |

**RECOMMENDATION:** ต้นฉบับไม่มี bullet ที่ primaryClass=SAFE_RESPONSE; แนวทางตอบสนองปลอดภัยใน Story Bank เป็นข้อเสนอทางการศึกษาอ้างแหล่งเตือนภัย ไม่แอบอ้างว่าเป็นถ้อยคำเดิมของผู้ใช้. ไม่มี bullet ถูกทิ้งโดยไร้ disposition

## 3. Candidate Audit and MERGED ITEMS

**RECOMMENDATION:** working candidates ใช้ทดสอบการแยกเรื่อง ไม่ใช่การนับทุก bullet เป็น scenario. UNIQUE แปลว่าเก็บใน canonical bank หลังตรวจ; PARTIAL_OVERLAP ใช้ใน comparison matrix ไม่ใช่เหตุให้เพิ่มจำนวนเอง

| Candidate | Source seeds | Working idea | Result | Canonical destination / reason |
|---|---|---|---|---|
| UC01 | CC-S01/S05 | เจ้าหน้าที่แจ้งคดี | UNIQUE | CC-01 |
| UC02 | CC-S02 | พัสดุผิดกฎหมาย | VARIANT_ONLY | CC-01; เปลี่ยนข้อกล่าวหาแต่การกดดัน/ตรวจสอบเหมือนเดิม |
| UC03 | CC-S03 | ธนาคารแจ้งธุรกรรม | UNIQUE | CC-02; request/evidence ต้องใช้ code/news เติมอย่างเปิดเผย |
| UC04 | CC-S04 | บัญชีฟอกเงิน | VARIANT_ONLY | CC-01; allegation variant |
| UC05 | INV-S01/S03/S04 | กลุ่มลงทุนกำไรสูง | UNIQUE | INV-01 |
| UC06 | INV-S05/S06 | ถอนเงิน/ค่าปลดล็อก | DUPLICATE | INV-01; ตอนท้ายของ progression เดิม |
| UC07 | INV-S07 | หุ้น/คริปโต/Forex/ทอง | VARIANT_ONLY | INV-01; asset ไม่ใช่ flow |
| UC08 | ROM-S01/S03/S04/S07 | คนรักขอเงินฉุกเฉิน | UNIQUE | ROM-01 |
| UC09 | ROM-S05 | คนรักส่งพัสดุติดค่าธรรมเนียม | UNIQUE | ROM-02; intermediary claim และ verification chain ต่าง |
| UC10 | ROM-S06 | คนรักชวนลงทุน | DUPLICATE | INV-01 hybrid entry; ไม่เขียน full investment flow ซ้ำใน ROM |
| UC11 | ROM-S02 | ทหาร/แพทย์/นักธุรกิจ | VARIANT_ONLY | ROM-01/ROM-02; persona เท่านั้น |
| UC12 | ECO-S01/S02/S05/S06/S07 | ร้านรับเงินแล้วไม่ส่งของ | UNIQUE | ECO-01 |
| UC13 | ECO-S04 | มัดจำล่วงหน้า | DUPLICATE | ECO-01; payment step ไม่ใช่เรื่องใหม่ |
| UC14 | ECO-S03 ส่วนแรก | สินค้าไม่ตรงรายละเอียด | VARIANT_ONLY | ECO-01 outcome; ยังไม่มี independent post-sale dispute flow ใน source |
| UC15 | ECO-S03 ส่วนหลัง | COD ที่ไม่ได้สั่ง | UNIQUE | ECO-02 |
| UC16 | PHI-S01/S04/S05/S07 | พัสดุพาเข้า credential form | UNIQUE | PHI-01 |
| UC17 | PHI-S02 | บัญชีถูกระงับพาเข้า form | VARIANT_ONLY | PHI-01; lure เปลี่ยน |
| UC18 | PHI-S03 | เงินคืนพาเข้า form | VARIANT_ONLY | PHI-01; lure เปลี่ยน |
| UC19 | PHI-S06 | ลิงก์พาไปติดตั้งแอป | UNIQUE | PHI-02 |
| UC20 | TASK-S01–S05 | ทำภารกิจแล้วสำรองเงิน | UNIQUE | TASK-01 |
| UC21 | TASK-S06/S07 | ทำผิดขั้นตอน/ปลดถอน | DUPLICATE | TASK-01; escalation ไม่ใช่ story ใหม่ |
| UC22 | LOAN-S01/S02/S03/S07 | ค่าธรรมเนียมก่อนรับสินเชื่อ | UNIQUE | LOAN-01 |
| UC23 | LOAN-S04/S05/S06 | แอปเงินกู้เข้าถึงข้อมูลและข่มขู่ | UNIQUE | LOAN-02 |
| UC24 | REC-S01–S05 | ตามเงินคืนแต่จ่ายค่าดำเนินการ | UNIQUE | REC-01 |
| UC25 | REC-S06 | เรียกเพิ่มหลายครั้ง | DUPLICATE | REC-01; ไม่ใช่ premise ใหม่ |
| UC26 | JOB-S01–S04/S08 | ค่าสมัคร/ค่าอบรมปลอม | UNIQUE | JOB-01 |
| UC27 | JOB-S06 | งานต่างประเทศ | VARIANT_ONLY | JOB-01; ประเทศไม่เพิ่ม family |
| UC28 | JOB-S05 | รับสมัครเพื่อเก็บเอกสาร | UNIQUE | JOB-02; EXTENDED, DETAIL_PENDING |
| UC29 | JOB-S07 | งานรับ/ส่งต่อเงิน | UNIQUE | JOB-03 |
| NC01 | ข่าว N04; ไม่มี recruitment ใน INV เดิม | ผลตอบแทนจากชวนสมาชิก | UNIQUE | INV-02, NEWS_DERIVED_CANDIDATE |
| NC02 | ข่าว N08 + ECO-S07 บางส่วน | ผู้ขายเจอสลิปปลอม | UNIQUE | ECO-03, NEWS_DERIVED_CANDIDATE; learner role เพิ่มจากข่าว |
| NC03 | ข่าว N14 + CURRENT_CODE Recovery | แอปแจ้งความ/ช่วยคืนเงินขอควบคุมเครื่อง | UNIQUE | REC-02, NEWS_DERIVED_CANDIDATE; ขั้น remote ไม่มีใน REC source เดิม |

### MERGED ITEMS (source-level explanation)

| Original source group | Merged into | Reason |
|---|---|---|
| CC-S01/S02/S04/S05: คดี, พัสดุผิดกฎหมาย, ฟอกเงิน, โอนสาย/เอกสาร | CC-01 | อยู่ใน coercive investigation progression เดียว; persona/allegation เปลี่ยนได้ |
| INV-S01–S06: กำไรสูง, กลุ่ม, ลงทุนน้อย, ถอนน้อย, ค่าปลดล็อก | INV-01 | หนึ่งวงจรสร้างความเชื่อถือและล็อกการถอน ไม่ใช่ 6 stories |
| ROM-S01/S03/S04/S07 | ROM-01 | การสร้างสัมพันธ์และข้ออ้างฉุกเฉินเป็นเรื่องเดียว |
| ECO-S01/S02/S04–S07 และส่วนแรก ECO-S03 | ECO-01 | หน้าร้าน/มัดจำ/จ่ายนอกระบบ/หลักฐานปลอมเป็นช่วงและ outcome ของการซื้อเดียว |
| PHI-S01–S05/S07 | PHI-01 | ช่องทาง/ข้ออ้าง/QR เป็นตัวพาเข้า form เดียว เมื่อจุดตัดสินใจไม่เปลี่ยน |
| TASK-S01–S07 | TASK-01 | งานง่าย -> reward -> ฝากเงิน -> แก้รายการ -> ถอนติดขัด เป็น progression เดียว |
| LOAN-S01/S02/S03/S07 | LOAN-01 | อนุมัติและค่าธรรมเนียมเป็นขั้นตอนของเงินกู้ปลอม |
| REC-S01–S06 | REC-01 | ตัวตน/เอกสาร/ค่าธรรมเนียมซ้ำไม่สร้าง recovery หลาย families |
| JOB-S01–S04/S06/S08 | JOB-01 | รายได้/HR/ประเทศ/ค่าอบรมไม่ทำให้ fee-before-job เป็น flow ใหม่ |

## 4. Duplicate / Overlap Matrix

**RECOMMENDATION:** เปรียบเทียบ O=opening, T=trust, R=request, D=decision pattern, E=evidence, C=critical-risk behavior, Z=ending. ตารางนี้ครอบคลุมคู่ที่คล้ายกันมากที่สุดและ candidate ที่ถูกตัด ไม่อ้างว่าเป็นผลอัลกอริทึม similarity. มีเหตุผลความต่างอย่างน้อย 3 ด้านสำหรับทุก family ที่เก็บไว้ใน Story Bank

| Pair | O / T | R / D | E / C / Z | Result | Action |
|---|---|---|---|---|---|
| UC01–UC02–UC04 | สายแจ้งคดี/อำนาจรัฐเหมือนกัน | พิสูจน์ความบริสุทธิ์ด้วยเงินเหมือนกัน | เปลี่ยนชนิดข้อกล่าวหา ไม่เปลี่ยน response | VARIANT_ONLY | CC-01 เดียว |
| UC05–UC06 | สมาชิก/กำไรในเรื่องเดียว | เพิ่มทุนแล้วถอน/จ่ายเพิ่มเป็นช่วงต่อเนื่อง | ledger เดิม, loss เดิม | DUPLICATE | INV-01 |
| UC05–UC07 | investment entry เดียว | decision เดียว | เปลี่ยนสินทรัพย์ ไม่เพิ่ม evidence workflow | VARIANT_ONLY | V05–V09 |
| UC08–UC11 | acquaintance เดียว | ขอเงินแบบเดิม | เปลี่ยนอาชีพ/ประเทศ | VARIANT_ONLY | ROM persona variants |
| UC12–UC13 | ซื้อสินค้าร้านเดียว | มัดจำเป็น payment step | risk/ending เดิม | DUPLICATE | ECO-01 |
| UC12–UC14 | order เดียว | ก่อนซื้อ decision เดิม | หลังจ่ายได้ของผิดเป็น outcome; ยังไม่มี dispute flow | VARIANT_ONLY | ECO-01/V20 |
| UC16–UC17–UC18 | ข้อความลิงก์เหมือนกัน | credentials form เหมือนกัน | เปลี่ยนข้อความอ้าง ไม่เปลี่ยน action | VARIANT_ONLY | PHI-01 |
| UC20–UC21 | task group เดียว | ฝากและแก้ยอดเป็นวงจรเดียว | job ledger/withdrawal denial ต่อเนื่อง | DUPLICATE | TASK-01 |
| UC24–UC25 | recovery contact เดียว | ค่าดำเนินการซ้ำ | ใช้ case เดิม, stop-payment เดิม | DUPLICATE | REC-01 |
| UC26–UC27 | job invitation | จ่ายก่อนรับงานเหมือนกัน | เปลี่ยนประเทศอย่างเดียว | VARIANT_ONLY | JOB-01 |
| CC-01 vs CC-02 | call เหมือน; alleged case vs account alert | transfer under allegation vs code disclosure | case document vs OTP purpose; verification target/risk ต่าง | PARTIAL_OVERLAP | เก็บทั้งสองเมื่อ authoring รักษาความต่างนี้ |
| INV-01 vs INV-02 | investment เหมือน | portfolio/withdrawal vs recruitment/reward-source verification | profit ledger vs recruitment plan; invitation-to-others risk ต่าง | PARTIAL_OVERLAP | เก็บ INV-02 เฉพาะ member-recruitment mechanism |
| ROM-01 vs ROM-02 | relationship เหมือน | emergency support vs third-party parcel fee | event proof vs shipment/customs claim; verification route ต่าง | PARTIAL_OVERLAP | เก็บสองเรื่อง ไม่แยกตามอาชีพ |
| ECO-01 vs ECO-02 | order initiated vs unsolicited delivery | purchase payment vs accept/pay for unknown order | store vs household order log/parcel; refusal at door ต่าง | UNIQUE | เก็บ ECO-02 |
| ECO-01 vs ECO-03 | learner buyer vs seller | pay vs release goods on claimed payment | seller identity vs bank settlement; risk direction ต่าง | UNIQUE | เก็บ ECO-03 |
| PHI-01 vs PHI-02 | message entry ร่วม | form submission vs installation/permissions | URL/form vs publisher/permissions; revoke/block ต่าง | PARTIAL_OVERLAP | เก็บสองเรื่อง ไม่ใช่แค่ต่างลิงก์ |
| LOAN-01 vs LOAN-02 | loan need ร่วม | prepayment vs intrusive permission/coercion | invoice vs permission/threat evidence; device/privacy response ต่าง | PARTIAL_OVERLAP | เก็บสองเรื่อง แต่ไม่มี flow install ใน LOAN-01 โดยอัตโนมัติ |
| REC-01 vs REC-02 | prior victim/hope ร่วม | fee vs remote access | case-fee claim vs app/control prompt; stop-payment vs deny access | PARTIAL_OVERLAP | เก็บสองเรื่อง; REC-02 แยกข่าว/โค้ดชัด |
| JOB-01 vs JOB-02 | hiring ร่วม | fee vs document collection | payment demand vs data-purpose mismatch; privacy response ต่าง | PARTIAL_OVERLAP | JOB-02 รอรายละเอียด ไม่ฝืนเป็น core |
| JOB-01 vs JOB-03 | hiring ร่วม | pay employer vs operate own account for others | fee invoice vs duties/fund ownership; account-control risk ต่าง | UNIQUE | เก็บ JOB-03 |

## 5. Cross-Category Overlaps

| ID | Candidate overlap | Result | Canonical routing / boundary |
|---|---|---|---|
| X01 | Romance investment (UC10) vs INV-01 | DUPLICATE | primaryCategory=INVESTMENT, relatedCategories=[ROMANCE], emotional entry tag; ไม่สร้าง ROM-03 |
| X02 | E-commerce free product promotion -> Task | PARTIAL_OVERLAP | ถ้า decision หลักคือฝากเพื่อทำงาน ใช้ TASK-01; ถ้าซื้อสินค้าใช้ ECO-01. Entry offer ไม่เพิ่มเรื่อง |
| X03 | Call Center ส่งลิงก์ -> Phishing | PARTIAL_OVERLAP | หากแค่ opener ก่อน credential form ให้ PHI-01; CC-02 เฉพาะ live caller ขอ code/ให้ตัดสินใจในสาย |
| X04 | Job -> Money mule | UNIQUE | JOB-03; MONEY_MULE tag ไม่ใช่ category ใหม่; ไม่ copy old-game account case |
| X05 | Recovery -> Remote access | PARTIAL_OVERLAP | REC-02 เมื่อการช่วยเหยื่อเดิม/ขั้นรับแจ้งความเป็นแกน; generic service app ใช้ PHI-02 |
| X06 | Task vs Investment withdrawal lock | PARTIAL_OVERLAP | TASK-01 ต้องมี task performance/wage ledger; INV-01 ต้องมี investment claim/returns. หากเขียนเป็นยอดเงินกับจ่ายปลดอย่างเดียวให้รวม dataset leakage group |
| X07 | Loan app vs Phishing app | PARTIAL_OVERLAP | LOAN-02 ต้องมี loan application/contacts coercion; PHI-02 เป็น unsolicited service lure และ device permission boundary. ไม่ทำ generic app story ซ้ำ |
| X08 | Recovery fee vs Loan fee vs Job fee | PARTIAL_OVERLAP | ต่างที่ lifecycle/หลักฐาน/verification obligation; ห้ามคัดลอกบทเปลี่ยนคำนามแล้วนับ independent dataset |

## 6. Rejected / Not-a-Story Items

**RECOMMENDATION:** ไม่ลบเนื้อหาเหล่านี้ แต่ย้ายไปชนิดข้อมูลที่ถูกต้อง

| Item | Correct type | Why not a new family |
|---|---|---|
| Crypto, Forex, Gold, Stock | ASSET/THEME VARIANT | เปลี่ยนสิ่งที่อ้างลงทุน ไม่เปลี่ยน flow |
| Doctor, soldier, foreign businessperson | PERSONA | อาชีพ/สัญชาติไม่ใช่กลไก; ห้ามใช้เป็น risk label |
| High return / instant approval | WARNING_SIGN | ต้องมีคำขอและ decision context จึงเป็นเรื่อง |
| Fake review / social group | TACTIC | พบได้หลายหมวด |
| Fake document / fake slip | TACTIC/EVIDENCE | ผู้เรียนเป็น buyer หรือ seller ต้องระบุก่อนตั้งเรื่อง |
| OTP/password request | CRITICAL_REQUEST / TACTIC | เป็นคำขอเสี่ยง ไม่ใช่ทั้งเรื่องและไม่ตัดสิน critical อัตโนมัติ |
| Small withdrawal / small reward | ESCALATION_STEP | สร้าง trust ในเรื่องเดิม |
| Withdrawal fee / repair fee / repeat payment | CRITICAL_REQUEST / ESCALATION_STEP | มักเป็นขั้นต่อเนื่อง ไม่แยกเพียงชื่อค่าธรรมเนียม |
| Higher-ranking transfer | ESCALATION_STEP | ไม่สร้าง senior-officer family |
| QR code / Facebook / LINE / website color | CHANNEL/VARIANT | รูปแบบนำเข้าบทไม่ใช่ความต่างด้านการตัดสินใจ |
| Overseas job country | THEME VARIANT | ถ้า decision ยังคงจ่ายค่าดำเนินการ ไม่แยกประเทศ |
| Normal call | CONTROL_NORMAL | ไม่ใช่ scam family; ห้ามปลอม warning signs |

## 7. Selection and Open Gaps

**RECOMMENDATION:** Core 18 เรื่องให้ coverage กว้างกว่า current 9 เรื่อง แต่ไม่บังคับผู้เรียนเล่นครบ 18 ในหนึ่ง session. Demo 9 ให้หนึ่งเรื่องต่อหมวด; เลือก story จาก core ตามแผนการศึกษาที่ควบคุม exposure และความเหนื่อยล้า. ยังไม่เขียน State/Checkpoint หรือกฎผ่านจริงในรอบนี้

- **DETAIL_PENDING:** CC-S02 พัสดุตกค้างแต่ไม่มี request; PHI-S07 QR ที่เปลี่ยนผู้รับเงินจริง vs เปิดเว็บขโมยข้อมูล; JOB-02 ข้อมูลใดเกินจำเป็นในแต่ละช่วงสมัครงาน
- **NEWS_VALIDATED limitation:** ข่าวยืนยันว่ามีกลไก ไม่ได้ให้สถิติ prevalence ที่เทียบทุก family ได้. ไม่จัดอันดับความถี่จากจำนวนผลค้นหา
- **CURRENT_CODE:** REC-02 มี remote request แต่ต้นฉบับ REC ไม่กล่าวถึง; N14 สนับสนุนแอปแจ้งความปลอมควบคุมเครื่อง ไม่พิสูจน์ทุกฉาก recovery ที่ออกแบบ. ใช้ label partial specificity
- **RECOMMENDATION:** 16 user-derived families ไม่ได้แปลว่าผู้ใช้เขียนครบทุกองค์ประกอบแล้ว; requests/evidence/safe behavior ที่เติมจากข่าวหรือผู้ทบทวนติดป้ายใน bank
- **DATASET BLOCKER:** 19 families ยังไม่พอให้ทุก category กระจายครบ train/validation/test ภายใต้ strict family-level split; TASK มีเพียง family เดียว. ห้ามแก้ด้วย random row split หรือเรียก paraphrase ว่า family ใหม่
- **CONTENT REVIEW GATE:** ต้องอนุมัติ 3 news-derived additions, policy normal controls, JOB-02 และความต่างของกลุ่มที่ partial-overlap ก่อนเขียน specification ระดับ state/rule
- **GAME BOUNDARY:** เกมใหม่ 8 คดีจาก proposal เป็น phase แยก. หลักฐาน invoice/ticket/booking/insurance ของเกมไม่ถูกนำมานับเพิ่มใน dialogue bank

## 8. Review Questions Q1–Q12

**Q1. จากรายการเดิมมี unique จริงกี่เรื่อง?** 16 user-source-derived families หลังคัด 29 working candidates และลด 13 รายการ; เติม 3 news-derived candidates เป็น bank 19. นี่เป็น curated outline count ไม่ใช่จำนวน scripts ที่พร้อม deploy

**Q2. แต่ละ category มีอะไร?** CC-01/02; INV-01/02; ROM-01/02; ECO-01/02/03; PHI-01/02; TASK-01; LOAN-01/02; REC-01/02; JOB-01/02/03. ชื่อและ fields ครบอยู่ใน Story Bank

**Q3. อะไรตัดเพราะซ้ำ?** 5 candidate merges: investment withdrawal stage, romance investment copy, shopping deposit stage, task repair stage และ recovery repeat fee; ไม่มี source bullet ถูกลบ

**Q4. อะไรลดเป็น variant?** 8 candidate entries: illegal-parcel allegation, laundering allegation, investment assets, romance personas, wrong-item outcome, bank-message lure, refund-message lure, overseas location. มี variant catalog 32 options ทั้งหมด ไม่ใช่แค่ 8 ตัวเลือก

**Q5. อะไรเป็นเพียง tactic?** การแอบอ้าง/กดดัน/รีวิวปลอม/เอกสารปลอม/OTP request/ลิงก์/ค่าธรรมเนียม เป็นต้น; ใช้ controlled taxonomy 27 tags ไม่เพิ่ม family ทุก tag

**Q6. อะไรเป็น core?** ทุก scam family ยกเว้น JOB-02 รวม 18 โดย Demo 9 อยู่ในนั้น. เป็นคำแนะนำภายใต้ review ไม่ใช่ scope implementation ที่เริ่มแล้ว

**Q7. อะไรเป็น extended?** JOB-02 data-harvesting recruitment เพียง 1 เรื่องขณะนี้; ต้องกำหนด data necessity และ consent context ก่อน. ไม่ขยาย pool ให้ถึง 30–50 ด้วย variants

**Q8. Core coverage พอไหม?** พอสำหรับโครงงานต้นแบบที่มี fraud mechanisms หลายแบบ: authority transfer, code theft, investment lock, recruitment reward, relationship loan/parcel fee, buyer/seller/COD, credential/app boundaries, task deposit, loan fee/coercion, recovery fee/remote, job fee/mule. ไม่อ้างว่าครอบคลุม scam ทั้งหมด

**Q9. หมวดไหนซ้ำมาก?** Investment/Task/Recovery/Loan แชร์ upfront/withdrawal-fee progression; Romance-investment ซ้ำกับ Investment โดยตรง; PHI/Call Center/Loan/Recovery อาจกลายเป็น generic app/link story หากเขียนไม่รักษาบริบทและ evidence

**Q10. หมวดไหนบาง?** Task มี unique family เดียว; Recovery มีหนึ่งจากผู้ใช้และหนึ่งเติมจากข่าว/โค้ด; หลายหมวดมีสองเรื่องจึงยังไม่พอสำหรับ split สามชุดรายหมวด. ความบางไม่ใช่เหตุให้ตั้ง story จากค่าธรรมเนียมทุกชนิด

**Q11. พอสร้าง Qwen dataset หรือไม่?** พอเป็น ontology และ grouping key สำหรับเริ่มออกแบบ แต่ยังไม่ใช่ dataset-ready specification และยังจัด balanced 80/10/10 ทุก category ไม่ได้. Split families และ cross-category leakage groups ก่อน augmentation; ทุก variant/paraphrase ของ family อยู่ชุดเดียว

**Q12. ต้องเพิ่มจากข่าวตรงไหน?** รอบนี้เสนอ INV-02 recruitment-based returns, ECO-03 seller/fake receipt และ REC-02 fake complaint app/remote control. ข่าวไม่ได้เพิ่มหมวดที่ 10. รอบถัดไปควรค้น independent decision mechanisms ในหมวดที่บาง ไม่เพิ่มชื่อประเทศ/สินทรัพย์; QR direct-payment และ JOB-02 ยังต้องรายละเอียดก่อนรับเข้า core

## 9. Verification and Handoff — historical curation baseline

ตรวจได้จาก source ledger, candidate ledger, variant/tag registries และ current mapping โดยไม่ต้องรัน runtime. ไฟล์เนื้อหาไม่ถูก import อัตโนมัติ; ไม่สร้าง 3,600 examples. ขอบเขตการเปลี่ยนแปลงของ commit นี้มีเพียงเอกสารใหม่สองไฟล์ ไม่มี source/code file เดิมเปลี่ยน

Document QA: ตรวจครบ 20 sections, 19 scam records + 2 controls, required fields ทุก record, datasetFamilyId ไม่ซ้ำ 21 ค่า, variants 32, tags 27, original ledger 62 ข้อตรงต้นฉบับทุกข้อความ, candidates 29 + 3 และชุด DEMO/CORE-only/EXTENDED/CONTROL = 9/9/1/2. Source reference IDs ทั้ง 17 แหล่งมี URL definitions ครบ และ SHA-256 ของรายการผู้ใช้ไม่เปลี่ยน. ไม่รัน application tests เพราะไม่ได้แก้ executable code; การตรวจนี้ไม่ยืนยัน runtime ของ stories ใหม่.

ข่าวอ้างอิงและวันที่เข้าถึงอยู่ใน [Sources ของ Story Bank](scenario-story-bank.md#20-sources). ผู้ทบทวนต้องตัดสิน content gates ก่อนงาน State/Checkpoint phase ต่อไป
