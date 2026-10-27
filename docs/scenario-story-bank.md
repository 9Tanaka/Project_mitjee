# MITJEE Scenario Story Bank

Content curation only | เริ่มจัดทำ 2026-09-27 | PROPOSED_FOR_REVIEW | runtime alignment ตรวจซ้ำ 2026-10-02

Branch: `feat/rule-based-evaluation`; historical baseline ของงานคัดเนื้อหา: `491a48bcaa15260eb3837a50ca46b15d24ac4488` ไม่ใช่ current runtime HEAD. ฐานโค้ดที่ fetch และตรวจล่าสุดก่อนแก้เอกสาร: `7ce29f87d247c457789489a3e0e7091e005c24b2` (2026-10-02).
เอกสารนี้ไม่ใช่ runtime specification และไม่อนุมัติการสร้าง dataset หรือ State/Checkpoint โดยอัตโนมัติ. ดู [Deduplication Report](scenario-deduplication-report.md) สำหรับ original-item ledger และ candidate audit.

## 1. Method

อ่าน 62 dialogue bullets จากรายการผู้ใช้ แยกประเภทองค์ประกอบก่อนจัดกลุ่ม 29 working candidates. รวม DUPLICATE 5 และลด VARIANT_ONLY 8 เหลือ 16 user-derived families; เสนอจากข่าว/โค้ดอีก 3 รวม 19 scam families. ไม่รวม 54 bullets เกมเก่า และไม่รวม 2 normal controls.

ใช้ story-family test: ต้องต่างอย่างมีนัยสำคัญอย่างน้อย 3 ด้านของ contact, trust, deception, request, evidence, decision, safe response, critical risk หรือ ending. จำนวนเงิน ชื่อ สินทรัพย์ ประเทศ และสำนวนไม่ใช่ความต่างเพียงพอ. เหตุผลราย record เป็นข้อเสนอเชิงเนื้อหาที่รอ review ไม่ใช่หลักฐานว่าความต่างผ่านการทดลองกับผู้ใช้แล้ว.

คัด Demo 9 เป็น subset ของ Core 18; Extended-only 1. ทุก family เก็บที่ primaryCategory เดียวและอ้างอิง relatedCategories เมื่อเป็น hybrid. ไม่มี category ที่ 10.

**ข้อกำหนดร่วมของ records:** ทุก behavior/pressure/escalation ที่ source ไม่บอกตรง ๆ เป็น RECOMMENDATION; รายละเอียดเนื้อเรื่องยัง DETAIL_PENDING ก่อนเขียนบท. criticalCandidateBehavior เป็นความเสี่ยงเพื่อพิจารณา ไม่ใช่ rule ตัดสิน CRITICAL อัตโนมัติ. ใช้ตัวละคร เอกสาร ยอดเงิน URL ภายใน sandbox และข้อมูลรับรองสมมติเท่านั้น. ไม่ให้ตัวอย่างโจมตีที่นำไปใช้งานจริง.

## 2. Definitions

| Term | Meaning |
|---|---|
| CATEGORY | หมวดหลัก 9 ประเภทตาม proposal |
| STORY FAMILY | โครงหลอกและการตัดสินใจที่ต่างอย่างมีนัยสำคัญ |
| VARIANT | รายละเอียดเปลี่ยนโดยคง decision structure |
| TACTIC | กลวิธีหรือกลไกความเสี่ยงที่ใช้ร่วมหลาย family |
| PERSONA | บทบาท ไม่ใช่ family โดยอัตโนมัติ |
| ASSET / THEME | สินทรัพย์หรือหัวข้อ ไม่ใช่ family โดยอัตโนมัติ |
| CONTROL_NORMAL | การติดต่อปกติสำหรับเปรียบเทียบ แยกจาก scam totals |
| DEMO / CORE / EXTENDED | ลำดับความสำคัญที่เสนอ ไม่ใช่สถานะ implement |
| NEWS_VALIDATED | แหล่งภายนอกสนับสนุนรูปแบบ ไม่ยืนยันรายละเอียดสมมติทุกข้อ |

## 3. Source hierarchy

1. **USER_SOURCE:** `E:/locate/Listขอscenarioกับตำรวจ.txt` เป็นแนวคิดเดิม ไม่ใช่ final specification. Original IDs อ้าง source ledger ในรายงานคู่กัน.
2. **CURRENT_PROPOSAL:** `MITJEE_Proposal_Update_Qwen_Game_2026-09-26.docx` กำหนดทิศทาง Qwen, dialogue 9 categories และ investigation game 8 cases แยก domain.
3. **CURRENT_CODE:** ใช้ฐานโค้ดที่ตรวจล่าสุดใน [Current runtime alignment](#18-current-runtime-alignment) เพื่อยืนยันสิ่งที่เล่นได้; source/provenance ของการออกแบบเดิมยังคงไว้ ไม่ใช้ revisions เก่าเพิ่มจำนวนเรื่อง.
4. **NEWS_VALIDATED:** แหล่งกำกับดูแล/รัฐและข่าวที่อ้างหน่วยงานโดยตรง สนับสนุน pattern; ข่าวเก่าไม่ถูกอ้างเป็นสถิติความชุกปัจจุบัน.
5. **RECOMMENDATION / DETAIL_PENDING:** สิ่งที่เสนอเติมและส่วนรอผู้ทบทวนตัดสิน ต้องไม่ถูกอ่านเป็น requirement ของผู้ใช้.

`sourceOrigin` ระบุ USER_SOURCE, NEWS หรือ BOTH; `derivation` แยก USER_SOURCE_DERIVED กับ NEWS_DERIVED_CANDIDATE. BOTH ไม่ทำให้เรื่องใหม่กลายเป็น user-derived: ECO-03 และ REC-02 มี seed จากผู้ใช้ แต่โครงใหม่มาจากข่าว/โค้ด. แต่ละ newsSources ด้านล่างใช้ sourceUrls ผ่าน reference links [N01] เป็นต้น; **accessDate ของทุกรายการคือ 2026-09-27**.

## 4. Tactic taxonomy

27 tags ใช้ชื่อเดียวต่อความหมาย. เป็น content taxonomy ไม่ใช่ exact action/rule IDs; ครอบคลุม persuasion, evidence และ request mechanism ซึ่งระบุชนิดแยกไว้.

| Tag | Kind | Definition |
|---|---|---|
| IMPERSONATION | persuasion | สวมรอยบุคคล/องค์กร |
| AUTHORITY_PRESSURE | persuasion | อ้างอำนาจกดดัน |
| URGENCY | persuasion | เร่งให้ข้ามการตรวจสอบ |
| SOCIAL_PROOF | persuasion | อ้างคนอื่นยอมรับหรือได้ผล |
| FAKE_DOCUMENT | evidence | เอกสารอ้างความน่าเชื่อถือปลอม |
| SMALL_INITIAL_REWARD | progression | ให้ผลตอบแทนเล็กน้อยช่วงแรก |
| ESCALATING_PAYMENT | progression | ขอเงินเพิ่มต่อเนื่อง |
| UPFRONT_FEE | request | จ่ายก่อนรับบริการ/ผลประโยชน์ |
| WITHDRAWAL_LOCK | progression | อ้างถอนเงินไม่ได้ |
| OFF_PLATFORM_PAYMENT | request | พาจ่ายนอกช่องทางคุ้มครอง |
| PHISHING_LINK | request | พาลิงก์ไปขอข้อมูลลับ |
| QR_REDIRECTION | transport | QR พาไปหน้าหรือปลายทางอื่น |
| OTP_REQUEST | request | ขอรหัสยืนยัน |
| PASSWORD_REQUEST | request | ขอรหัสผ่าน |
| REMOTE_ACCESS | request | ขอควบคุมเครื่อง |
| APP_INSTALL | request | ขอให้ติดตั้งแอป |
| CONTACT_LIST_ACCESS | request | ขอเข้าถึงรายชื่อผู้ติดต่อ |
| EMOTIONAL_MANIPULATION | persuasion | ใช้ความผูกพัน/ความเห็นใจ |
| THREAT | persuasion | ข่มขู่ผลเสีย |
| MONEY_MULE | request | ให้ใช้บัญชีรับ/ส่งเงินแทน |
| RECOVERY_FEE | request | ค่าติดตามเงินคืน เป็นชนิดเฉพาะของ upfront fee |
| FAKE_REVIEW | evidence | รีวิวปลอม เป็นหลักฐานชนิดหนึ่งของ social proof |
| FAKE_RECEIPT | evidence | หลักฐานชำระเงินปลอม ไม่ใช้แทนเอกสารทุกประเภท |
| ISOLATION | persuasion | ห้ามปรึกษาหรือแยกจากผู้ช่วยตรวจ |
| GUARANTEED_RETURN | persuasion | รับประกันผลตอบแทน |
| DATA_HARVESTING | request | เก็บข้อมูลเกินความจำเป็น/เพื่อสวมรอย |
| RECRUITMENT_REWARD | progression | ผลตอบแทนผูกกับชวนสมาชิก |

### Named variants

32 options ต่อไปนี้ไม่ใช่ 32 เรื่อง และไม่ใช่จำนวน combinations. Contact channel เป็น attribute ใน record แต่ยังไม่นับเป็น option เพิ่ม. Persona ทุกคนสังเคราะห์; สัญชาติ/อาชีพไม่ใช่เหตุให้ตัดสินว่าเป็น scam.

| ID | Family | Kind | Option |
|---|---|---|---|
| V01 | CC-01 | theme | พัสดุผิดกฎหมาย |
| V02 | CC-01 | theme | ฟอกเงิน/บัญชีม้าในข้อกล่าวหา |
| V03 | CC-01 | persona | เจ้าหน้าที่สอบสวนสมมติ |
| V04 | CC-02 | persona | ฝ่ายความปลอดภัยธนาคารสมมติ |
| V05 | INV-01 | asset | หุ้น |
| V06 | INV-01 | asset | สินทรัพย์ดิจิทัล |
| V07 | INV-01 | asset | Forex |
| V08 | INV-01 | asset | ทองคำ |
| V09 | INV-01 | asset | ธุรกิจออนไลน์ |
| V10 | INV-01, INV-02 | persona | ผู้แนะนำการลงทุน |
| V11 | INV-01, INV-02 | persona | ผู้มีชื่อเสียงออนไลน์สมมติ |
| V12 | ROM-01, ROM-02 | persona | ทหารสมมติ |
| V13 | ROM-01, ROM-02 | persona | แพทย์สมมติ |
| V14 | ROM-01, ROM-02 | persona | นักธุรกิจสมมติ |
| V15 | ROM-01, ROM-02 | theme | อยู่ต่างประเทศ ไม่ใช่ risk signal |
| V16 | ROM-01 | theme | เจ็บป่วยฉุกเฉิน |
| V17 | ROM-01 | theme | ปัญหาการเดินทาง |
| V18 | ECO-01 | payment timing | มัดจำ |
| V19 | ECO-01 | outcome | ไม่ส่งสินค้า |
| V20 | ECO-01 | outcome | สินค้าไม่ตรงรายละเอียด ยังไม่แยก after-sales flow |
| V21 | PHI-01 | theme | พัสดุตกค้าง |
| V22 | PHI-01 | theme | บัญชีธนาคารมีปัญหา |
| V23 | PHI-01 | theme | เงินคืนภาษี |
| V24 | PHI-01 | transport | QR ไปแบบฟอร์ม ไม่ใช่ QR โอนตรง |
| V25 | TASK-01 | activity | กดถูกใจ/ติดตาม |
| V26 | TASK-01 | activity | รีวิว |
| V27 | TASK-01 | activity | กดคำสั่งซื้อ |
| V28 | LOAN-01 | fee label | ค่าประกัน |
| V29 | LOAN-01 | fee label | ค่าดำเนินการ |
| V30 | REC-01 | persona | ทนายสมมติ |
| V31 | REC-01 | persona | เจ้าหน้าที่สมมติ |
| V32 | JOB-01 | theme | งานต่างประเทศ |

## 5. Category 1 Call Center

### CC-01
- storyFamilyId: CC-01; category / primaryCategory: Call Center; titleThai: คดีปลอมบังคับโอนเงินเพื่อตรวจสอบ; titleEnglish: Fabricated case and inspection transfer.
- sourceOrigin: USER_SOURCE; derivation: USER_SOURCE_DERIVED; provenance: CC-S01/S02/S04/S05 + NEWS_VALIDATED; CURRENT_CODE: ไม่ตรงเรื่องหลักปัจจุบัน; RECOMMENDATION: โครงคำขอโอนและทางออก; DETAIL_PENDING: เนื้อคดีและหลักฐานสมมติ.
- oneSentencePremise: ผู้โทรอ้างคดีและอำนาจเจ้าหน้าที่เพื่อให้โอนเงินแทนการตรวจสอบอิสระ.
- initialContact: สายเรียกเข้าสมมติ; trustMechanism: โอนสายและเอกสารราชการจำลอง; pressureMechanism: ขู่ผลทางคดี เร่งเวลาและแยกจากผู้ช่วย.
- mainRequest: โอนเงินจำลองเพื่อพิสูจน์ความบริสุทธิ์; escalation: ยกระดับผู้แอบอ้าง/เอกสารเมื่อผู้เรียนลังเล.
- expectedSafeBehavior: ตรวจหน่วยงานผ่านช่องทางที่ค้นเองและไม่โอน; potentialReviewBehavior: ขอหลักฐานแต่เชื่อช่องทางที่คู่สนทนาส่ง; criticalCandidateBehavior: ยืนยันโอนตามข้อกล่าวหา; safeTermination: วางสาย เก็บหลักฐานและตรวจอิสระ.
- relatedCategories: SMS / Phishing; tacticTags: IMPERSONATION, AUTHORITY_PRESSURE, FAKE_DOCUMENT, THREAT, URGENCY, ISOLATION.
- personaVariants: V03; themeVariants: V01, V02.
- newsSources: [N01]; shortEvidenceSummary: ตำรวจเตือนการอ้างคดีแล้วหลอกโอนเงินตรวจสอบ ไม่ใช่การรับรองบทสมมติ.
- estimatedComplexity: MEDIUM; recommendedMode: TEXT_OR_VOICE; datasetFamilyId: CC-FAMILY-CASE-TRANSFER.
- matchedControl [RECOMMENDATION]: CC-N01; matchedDimension: parcel / delivery surface context; ใช้พัสดุเป็นบริบทเปิดของฉบับจับคู่ ก่อนอ้างคดีและขอโอนเงิน ไม่สร้าง family ใหม่และยังคง case-transfer identity กับ variants เดิม.
- uniqueness: เทียบ CC-02 ต่างคำขอเงินแทนรหัส, หลักฐานคดีแทนธุรกรรม และ safe decision ตรวจข้อกล่าวหาแทนรักษาการยืนยันบัญชี.

### CC-02
- matchedControl [RECOMMENDATION]: CC-N02; matchedDimension: bank / transaction notification; ความต่างอยู่ที่คำขอ OTP กับการให้ตรวจแอปเอง ไม่ใช่ชื่อธนาคาร.
- storyFamilyId: CC-02; category / primaryCategory: Call Center; titleThai: สายธนาคารปลอมขอรหัสยืนยัน; titleEnglish: Bank security caller requesting verification codes.
- sourceOrigin: USER_SOURCE; derivation: USER_SOURCE_DERIVED; provenance: CC-S03 + NEWS_VALIDATED + CURRENT_CODE; RECOMMENDATION: รายละเอียดการตรวจกลับ; DETAIL_PENDING: บทเต็ม.
- oneSentencePremise: ผู้โทรอ้างตรวจธุรกรรมผิดปกติและขอรหัสที่ใช้ยืนยันบัญชี.
- initialContact: สายธนาคารสมมติ; trustMechanism: อ้างฝ่ายความปลอดภัย; pressureMechanism: เร่งแก้ธุรกรรม.
- mainRequest: แจ้ง OTP จำลองให้ผู้โทร; escalation: อ้างว่าจำเป็นต่อการป้องกันความเสียหาย.
- expectedSafeBehavior: ไม่บอกรหัสและติดต่อธนาคารจากช่องทางที่มีอยู่เดิม; potentialReviewBehavior: ยอมคุยต่อโดยยังไม่ตรวจตัวตน; criticalCandidateBehavior: ส่งรหัสในบทจำลอง; safeTermination: ยุติและตรวจบัญชีทางช่องทางอิสระ.
- relatedCategories: SMS / Phishing; tacticTags: IMPERSONATION, AUTHORITY_PRESSURE, URGENCY, OTP_REQUEST.
- personaVariants: V04; themeVariants: ไม่มี option เพิ่ม.
- newsSources: [N02]; shortEvidenceSummary: BOT อธิบายผู้แอบอ้างทางโทรศัพท์ขอข้อมูลและ OTP; ชื่อฝ่ายธนาคารเป็นรายละเอียดจาก source/code.
- estimatedComplexity: LOW; recommendedMode: TEXT_OR_VOICE; datasetFamilyId: CC-FAMILY-CALLER-CREDENTIALS.
- uniqueness: เทียบ PHI-01 ต่าง contact สนทนาตรง, evidence จากการอ้างตัว/คำขอ และ decision ปฏิเสธบอกรหัสแทนตรวจ destination/form. ถ้าบทภายหลังเปลี่ยนเป็นส่งลิงก์อย่างเดียวต้องตรวจ dedup ใหม่.

## 6. Category 2 Investment

### INV-01
- storyFamilyId: INV-01; category / primaryCategory: Investment; titleThai: ลงทุนได้กำไรช่วงแรกแต่ถอนเงินติดค่าปลดล็อก; titleEnglish: Investment profit followed by withdrawal lock.
- sourceOrigin: USER_SOURCE; derivation: USER_SOURCE_DERIVED; provenance: INV-S01–S07, ROM investment bullet + NEWS_VALIDATED + CURRENT_CODE; RECOMMENDATION: safe/review boundaries; DETAIL_PENDING: เนื้อหาย่อย.
- oneSentencePremise: กลุ่มลงทุนแสดงผลตอบแทนก่อนเรียกเงินเพิ่มเมื่อถอนก้อนใหญ่.
- initialContact: โฆษณา/กลุ่มสนทนา หรือความสัมพันธ์เป็น hybrid; trustMechanism: รีวิว กำไรและถอนเล็กน้อย; pressureMechanism: กลัวเสียเงินเดิม.
- mainRequest: เพิ่มทุนและจ่ายค่าปลดล็อก; escalation: ยอดในจอเพิ่มแต่ถอนติดเงื่อนไข.
- expectedSafeBehavior: ตรวจผู้ให้บริการอิสระและหยุดจ่าย; potentialReviewBehavior: เชื่อกำไรในจอแต่ยังไม่โอนเพิ่ม; criticalCandidateBehavior: จ่ายเพิ่มเพื่อเอาทุนเดิมคืน; safeTermination: หยุดธุรกรรม เก็บหลักฐาน.
- relatedCategories: Romance / Relationship, Task Scam; tacticTags: GUARANTEED_RETURN, SOCIAL_PROOF, FAKE_REVIEW, SMALL_INITIAL_REWARD, WITHDRAWAL_LOCK, ESCALATING_PAYMENT, EMOTIONAL_MANIPULATION.
- personaVariants: V10, V11; themeVariants: V05–V09.
- newsSources: [N03]; shortEvidenceSummary: AOC รายงานลงทุนหุ้นได้ผลช่วงแรก ก่อนถอนติดเงื่อนไขและเรียกเงินเพิ่ม.
- estimatedComplexity: HIGH; recommendedMode: TEXT; datasetFamilyId: INV-FAMILY-WITHDRAWAL-LOCK.
- uniqueness: เทียบ INV-02 ต่างผลตอบแทนจากยอดลงทุนแทนสมาชิก, หลักฐานพอร์ต/ถอนแทนเครือข่าย และ decision หยุดค่าปลดล็อกแทนปฏิเสธชวนคน.

### INV-02
- storyFamilyId: INV-02; category / primaryCategory: Investment; titleThai: ลงทุนที่ให้ผลตอบแทนจากการชวนสมาชิก; titleEnglish: Recruitment-dependent investment returns.
- sourceOrigin: NEWS; derivation: NEWS_DERIVED_CANDIDATE; provenance: NEWS_VALIDATED; CURRENT_CODE: ไม่มี; RECOMMENDATION: เสนอเพิ่มเพื่อกลไกต่าง; DETAIL_PENDING: โครงรายได้สมมติ.
- oneSentencePremise: อ้างธุรกิจลงทุนแต่การได้ผลตอบแทนผูกกับเงินหรือสมาชิกใหม่.
- initialContact: คำเชิญลงทุน; trustMechanism: ภาพธุรกิจและสมาชิกสำเร็จ; pressureMechanism: ต้องชวนคนเพื่อรักษาสิทธิ.
- mainRequest: ลงเงินและนำคนใหม่เข้าระบบ; escalation: ผลตอบแทนเพิ่มตามการชวน.
- expectedSafeBehavior: ตรวจที่มารายได้และไม่ส่งคำชวนต่อ; potentialReviewBehavior: สนใจโบนัสโดยไม่ตรวจรายได้จริง; criticalCandidateBehavior: นำเงิน/ผู้อื่นเข้าสู่ข้อเสนอเสี่ยงที่ระบุในบท; safeTermination: ปฏิเสธลงทุนและชวนสมาชิก.
- relatedCategories: Job Scam; tacticTags: RECRUITMENT_REWARD, GUARANTEED_RETURN, SOCIAL_PROOF.
- personaVariants: V10, V11; themeVariants: ไม่มี option เพิ่ม.
- newsSources: [N04]; shortEvidenceSummary: ก.ล.ต. เตือนโบนัสชวนสมาชิกในกลโกงลงทุน ไม่ได้หมายความว่าการแนะนำสมาชิกทุกแบบผิดกฎหมาย.
- estimatedComplexity: HIGH; recommendedMode: TEXT; datasetFamilyId: INV-FAMILY-RECRUITMENT-RETURNS.
- uniqueness: เทียบ INV-01 ต่างกลไกผลตอบแทน, คำขอชวนบุคคลที่สาม และหลักฐาน/การตรวจเส้นทางรายได้.

## 7. Category 3 Romance

### ROM-01
- storyFamilyId: ROM-01; category / primaryCategory: Romance / Relationship; titleThai: คนรักออนไลน์ขอเงินฉุกเฉิน; titleEnglish: Relationship-based emergency money request.
- sourceOrigin: USER_SOURCE; derivation: USER_SOURCE_DERIVED; provenance: ROM source + NEWS_VALIDATED + CURRENT_CODE; RECOMMENDATION: แนวทางรักษาขอบเขต; DETAIL_PENDING: เหตุฉุกเฉิน.
- oneSentencePremise: ตัวละครสร้างความผูกพันก่อนขอเงินช่วยเหตุฉุกเฉิน.
- initialContact: แชตทำความรู้จัก; trustMechanism: สนใจต่อเนื่องและประวัติสมมติ; pressureMechanism: ความเห็นใจและความรู้สึกผิด.
- mainRequest: เงินช่วยเหลือ/ยืมเงิน; escalation: อ้างรอไม่ได้หรือหลีกเลี่ยงการยืนยัน.
- expectedSafeBehavior: แยกความสัมพันธ์จากการเงินและตรวจอิสระ; potentialReviewBehavior: ยอมรับเรื่องเล่าโดยไม่ตรวจแต่ยังไม่จ่าย; criticalCandidateBehavior: โอนตามเหตุฉุกเฉินที่ยังไม่ยืนยัน; safeTermination: รักษาขอบเขต ปฏิเสธคำขอและหยุดติดต่อเมื่อเสี่ยง.
- relatedCategories: Investment; tacticTags: EMOTIONAL_MANIPULATION, IMPERSONATION, URGENCY.
- personaVariants: V12–V14; themeVariants: V15–V17.
- newsSources: [N05]; shortEvidenceSummary: ประกาศตำรวจผ่าน PRD อธิบายสร้างความรักแล้วขอทรัพย์สินและแยก hybrid ลงทุน.
- estimatedComplexity: MEDIUM; recommendedMode: TEXT; datasetFamilyId: ROM-FAMILY-EMERGENCY-HELP.
- uniqueness: เทียบ ROM-02 ต่างคำขอช่วยบุคคลโดยตรง, หลักฐานเหตุฉุกเฉินแทนพัสดุ และการตรวจตัวบุคคลแทนตรวจข้ออ้างบริษัทขนส่ง.

### ROM-02
- storyFamilyId: ROM-02; category / primaryCategory: Romance / Relationship; titleThai: ของขวัญจากคนรักติดค่าธรรมเนียมปลอม; titleEnglish: Relationship gift and fabricated parcel fees.
- sourceOrigin: USER_SOURCE; derivation: USER_SOURCE_DERIVED; provenance: ROM gift source + NEWS_VALIDATED; CURRENT_CODE: ไม่มี; RECOMMENDATION: บทบาทขนส่งสมมติ; DETAIL_PENDING: หลักฐาน.
- oneSentencePremise: คนรักอ้างส่งของมีค่าแล้วมีผู้เรียกค่าปล่อยพัสดุ.
- initialContact: ความสัมพันธ์ออนไลน์ก่อนข่าวส่งของ; trustMechanism: ความผูกพันและหลักฐานส่งสมมติ; pressureMechanism: ของถูกกัก/เสียของ.
- mainRequest: ค่าธรรมเนียมเพื่อรับของ; escalation: ผู้แอบอ้างขนส่งเรียกค่าใช้จ่ายเพิ่ม.
- expectedSafeBehavior: ตรวจพัสดุและค่าธรรมเนียมอิสระ ไม่เชื่อลิงก์จากคู่สนทนา; potentialReviewBehavior: เชื่อเอกสารโดยลำพัง; criticalCandidateBehavior: ชำระให้ผู้เรียกที่ไม่ยืนยัน; safeTermination: หยุดจ่ายและยุติการติดต่อ.
- relatedCategories: E-commerce / Online Shopping, Call Center; tacticTags: EMOTIONAL_MANIPULATION, FAKE_DOCUMENT, IMPERSONATION, UPFRONT_FEE, ESCALATING_PAYMENT.
- personaVariants: V12–V14; themeVariants: V15.
- newsSources: [N05], [N17]; shortEvidenceSummary: คำเตือนของขวัญจากความสัมพันธ์และอ้างค่าศุลกากร.
- estimatedComplexity: HIGH; recommendedMode: TEXT; datasetFamilyId: ROM-FAMILY-GIFT-FEES.
- uniqueness: เทียบ ECO-02 ต่างความสัมพันธ์ตั้งต้น, หลักฐานของขวัญจากผู้ส่ง และการเรียกหลายทอดแทนจุดรับพัสดุที่บ้าน.

## 8. Category 4 E-commerce

### ECO-01
- storyFamilyId: ECO-01; category / primaryCategory: E-commerce / Online Shopping; titleThai: ร้านค้าชวนจ่ายนอกระบบแล้วไม่ส่งสินค้าตามตกลง; titleEnglish: Off-platform shopping and non-delivery.
- sourceOrigin: USER_SOURCE; derivation: USER_SOURCE_DERIVED; provenance: ECO source + NEWS_VALIDATED + CURRENT_CODE; RECOMMENDATION: เกณฑ์ตรวจร้าน; DETAIL_PENDING: สินค้า.
- oneSentencePremise: ร้านใช้รีวิวและราคาเร่งให้ผู้ซื้อจ่ายนอกระบบคุ้มครอง.
- initialContact: โฆษณา/หน้าร้าน; trustMechanism: รีวิวและยอดขาย; pressureMechanism: ส่วนลดจำกัดเวลา.
- mainRequest: โอนตรงหรือมัดจำ; escalation: ชวนออกแพลตฟอร์ม.
- expectedSafeBehavior: ตรวจหลายหลักฐานและใช้ช่องทางคุ้มครอง; potentialReviewBehavior: ดูรีวิวอย่างเดียว; criticalCandidateBehavior: ชำระแก่ร้านที่ยังไม่ยืนยันในเส้นทางเสี่ยงของบท; safeTermination: ยุติซื้อและรายงานร้าน.
- relatedCategories: Task Scam; tacticTags: FAKE_REVIEW, SOCIAL_PROOF, URGENCY, OFF_PLATFORM_PAYMENT.
- personaVariants: ไม่มี option เพิ่ม; themeVariants: V18–V20.
- newsSources: [N06]; shortEvidenceSummary: ETDA รายงานปัญหาซื้อออนไลน์ไม่ส่ง/ไม่ตรงรายละเอียด; จุดชวนออกแพลตฟอร์มจาก user source.
- estimatedComplexity: MEDIUM; recommendedMode: TEXT; datasetFamilyId: ECO-FAMILY-OFF-PLATFORM-SHOP.
- uniqueness: เทียบ TASK-01 ต่างบทบาทผู้ซื้อ, หลักฐานคำสั่งซื้อ/คุ้มครอง และเป้าหมายรับสินค้าแทนรับค่าตอบแทน.

### ECO-02
- storyFamilyId: ECO-02; category / primaryCategory: E-commerce / Online Shopping; titleThai: พัสดุเก็บเงินปลายทางที่ไม่ได้สั่ง; titleEnglish: Unordered cash-on-delivery parcel.
- sourceOrigin: USER_SOURCE; derivation: USER_SOURCE_DERIVED; provenance: ECO-S03 + NEWS_VALIDATED; CURRENT_CODE: ไม่มี; RECOMMENDATION: ตรวจคนในบ้าน; DETAIL_PENDING: จุดตัดสินใจรับของ.
- oneSentencePremise: มีพัสดุเรียกเก็บเงินทั้งที่ผู้เรียนยังยืนยันคำสั่งซื้อไม่ได้.
- initialContact: แจ้งส่ง/รับพัสดุ; trustMechanism: ชื่อผู้รับและหีบห่อ; pressureMechanism: เร่งให้ชำระขณะส่ง.
- mainRequest: จ่าย COD; escalation: อ้างคนในบ้านเป็นผู้สั่ง.
- expectedSafeBehavior: ตรวจคำสั่งซื้อและผู้เกี่ยวข้องก่อนจ่าย; potentialReviewBehavior: เชื่อเพราะชื่อที่อยู่ตรง; criticalCandidateBehavior: ชำระทั้งที่ไม่มีคำสั่งซื้อยืนยันตามบท; safeTermination: ปฏิเสธรับเมื่อยืนยันไม่ได้และเก็บข้อมูล.
- relatedCategories: Call Center; tacticTags: IMPERSONATION, URGENCY.
- personaVariants: ไม่มี option เพิ่ม; themeVariants: ไม่มี option เพิ่ม.
- newsSources: [N07]; shortEvidenceSummary: ข่าวโกดังพัสดุปลอมกล่าวถึง COD ที่ผู้รับไม่ได้สั่ง.
- estimatedComplexity: LOW; recommendedMode: TEXT; datasetFamilyId: ECO-FAMILY-UNORDERED-COD.
- uniqueness: เทียบ ECO-01 ต่างผู้เรียนไม่ได้เริ่มซื้อ, หลักฐานพัสดุ/ประวัติคำสั่งซื้อ และ decision รับ-ไม่รับแทนเลือกวิธีชำระร้าน.

### ECO-03
- storyFamilyId: ECO-03; category / primaryCategory: E-commerce / Online Shopping; titleThai: ผู้ขายถูกหลอกด้วยหลักฐานชำระเงินปลอม; titleEnglish: Seller targeted with fabricated payment evidence.
- sourceOrigin: BOTH; derivation: NEWS_DERIVED_CANDIDATE; provenance: ECO fake-slip seed + NEWS_VALIDATED; CURRENT_CODE: ไม่มี; RECOMMENDATION: เปลี่ยน learner เป็นผู้ขายอย่างเปิดเผย; DETAIL_PENDING: รายการขาย.
- oneSentencePremise: ผู้ซื้อแสดงสลิปเพื่อให้ผู้ขายส่งของทั้งที่เงินยังไม่เข้า.
- initialContact: คำสั่งซื้อ; trustMechanism: ภาพหลักฐานชำระ; pressureMechanism: เร่งจัดส่ง.
- mainRequest: ส่งของตามสลิป; escalation: อ้างโอนแล้วไม่ต้องรอตรวจ.
- expectedSafeBehavior: ตรวจเงินจริงผ่านระบบตนเองก่อนส่ง; potentialReviewBehavior: ตรวจภาพสลิปแต่ไม่ดูยอดเข้า; criticalCandidateBehavior: ส่งมอบสินค้าจำลองโดยไม่มีเงินรับยืนยัน; safeTermination: ระงับส่งและตรวจรายการ.
- relatedCategories: Job Scam; tacticTags: FAKE_RECEIPT, URGENCY.
- personaVariants: ไม่มี option เพิ่ม; themeVariants: ไม่มี option เพิ่ม.
- newsSources: [N02], [N08]; shortEvidenceSummary: BOT เตือนสลิปปลอม; ข่าวตำรวจปี 2026 มีร้านค้าถูกผู้ซื้อหลอกด้วยหลักฐานโอน. ไม่คัดลอกเส้นทางซื้อของบุคคลที่สามทั้งหมด.
- estimatedComplexity: MEDIUM; recommendedMode: TEXT; datasetFamilyId: ECO-FAMILY-SELLER-FAKE-RECEIPT.
- uniqueness: เทียบ ECO-01 ต่างบทบาทเป็นผู้ขาย, หลักฐานยอดรับแทนร้านค้า และความเสี่ยงส่งสินค้าก่อนเงินจริงแทนโอนซื้อ.

## 9. Category 5 SMS/Phishing

### PHI-01
- storyFamilyId: PHI-01; category / primaryCategory: SMS / Phishing; titleThai: ข้อความพาไปแบบฟอร์มขโมยข้อมูล; titleEnglish: Message-driven credential phishing.
- sourceOrigin: USER_SOURCE; derivation: USER_SOURCE_DERIVED; provenance: PHI source + NEWS_VALIDATED + CURRENT_CODE; RECOMMENDATION: สื่อจำลอง; DETAIL_PENDING: แบบฟอร์ม.
- oneSentencePremise: ข้อความบริการพาผู้เรียนไปเว็บเลียนแบบเพื่อขอข้อมูลยืนยันบัญชี.
- initialContact: SMS/อีเมล/แชต; trustMechanism: โลโก้/หน้าเว็บสมมติ; pressureMechanism: สิทธิหรือบริการจะหมด.
- mainRequest: กรอกข้อมูลรับรองจำลอง; escalation: แบบฟอร์มขอรหัสเพิ่ม.
- expectedSafeBehavior: ตรวจปลายทางและเปิดบริการด้วยตนเอง; potentialReviewBehavior: เชื่อ HTTPS/หน้าตาเพียงอย่างเดียว; criticalCandidateBehavior: ส่งรหัสผ่านหรือ OTP ในแบบฟอร์มเสี่ยง; safeTermination: ปิดหน้าและรายงานข้อความ.
- relatedCategories: Call Center; tacticTags: PHISHING_LINK, QR_REDIRECTION, PASSWORD_REQUEST, OTP_REQUEST, IMPERSONATION, URGENCY.
- personaVariants: ไม่มี option เพิ่ม; themeVariants: V21–V24.
- newsSources: [N09]; shortEvidenceSummary: BOT อธิบาย SMS/อีเมลพาไปเว็บปลอมขอรหัส.
- estimatedComplexity: MEDIUM; recommendedMode: TEXT; datasetFamilyId: PHI-FAMILY-CREDENTIAL-FORM.
- uniqueness: เทียบ PHI-02 ต่างคำขอข้อมูลแทนแอป, evidence โดเมน/ฟอร์มแทนสิทธิ์ และ safe response รักษารหัสแทนปฏิเสธติดตั้ง.

### PHI-02
- storyFamilyId: PHI-02; category / primaryCategory: SMS / Phishing; titleThai: ข้อความบริการปลอมพาไปติดตั้งแอป; titleEnglish: Service message leading to unsafe app installation.
- sourceOrigin: USER_SOURCE; derivation: USER_SOURCE_DERIVED; provenance: PHI app source + NEWS_VALIDATED; CURRENT_CODE: ไม่มี family แยก; RECOMMENDATION: หน้าสิทธิ์ภายใน sandbox; DETAIL_PENDING: บริการ.
- oneSentencePremise: ข้อความอ้างบริการจำเป็นให้ติดตั้งแอปและเปิดสิทธิ์เสี่ยง.
- initialContact: ข้อความพร้อมทางไปหน้าติดตั้งจำลอง; trustMechanism: อ้างแอปหน่วยงาน; pressureMechanism: ต้องใช้เพื่อแก้ปัญหา.
- mainRequest: ยอมติดตั้ง/อนุญาตสิทธิ์จำลอง; escalation: ขอสิทธิ์ควบคุมหรืออ่านข้อมูล.
- expectedSafeBehavior: ไม่ติดตั้งจากคำชวนและตรวจช่องทางบริการเอง; potentialReviewBehavior: เข้าไปอ่านแล้วเชื่อโลโก้; criticalCandidateBehavior: ยืนยันสิทธิ์เสี่ยงตามบท; safeTermination: ยกเลิกหน้าติดตั้ง.
- relatedCategories: Fake Loan, Recovery Scam; tacticTags: APP_INSTALL, REMOTE_ACCESS, IMPERSONATION, URGENCY.
- personaVariants: ไม่มี option เพิ่ม; themeVariants: ไม่มี option เพิ่ม.
- newsSources: [N09]; shortEvidenceSummary: BOT แยกการหลอกติดตั้งมัลแวร์จากเว็บขโมยรหัส. การกดลิงก์เพียงครั้งเดียวไม่เท่ากับเงินหายอัตโนมัติ.
- estimatedComplexity: MEDIUM; recommendedMode: TEXT; datasetFamilyId: PHI-FAMILY-SERVICE-APP.
- uniqueness: เทียบ PHI-01 ต่างชนิดคำขอ, หลักฐานหน้าติดตั้ง/สิทธิ์ และขอบเขตอุปกรณ์ที่เสี่ยง. เทียบ REC-02 ต้องรักษา context การแก้เหตุเดิมและการยืนยันผู้ช่วย ไม่เขียน generic app flow ซ้ำ.

## 10. Category 6 Task Scam

### TASK-01
- storyFamilyId: TASK-01; category / primaryCategory: Task Scam; titleThai: ทำภารกิจแล้วต้องเติมเงินเพื่อถอนค่าตอบแทน; titleEnglish: Paid tasks escalating to withdrawal deposits.
- sourceOrigin: USER_SOURCE; derivation: USER_SOURCE_DERIVED; provenance: TASK source + NEWS_VALIDATED + CURRENT_CODE; RECOMMENDATION: ขอบเขตพฤติกรรม; DETAIL_PENDING: ภารกิจ.
- oneSentencePremise: งานง่ายจ่ายเล็กน้อยก่อนให้สำรองเงินและอ้างถอนค่าตอบแทนไม่ได้.
- initialContact: เสนองาน/กลุ่มภารกิจ; trustMechanism: จ่ายผลตอบแทนช่วงแรก; pressureMechanism: เสียเงินเดิมหรือทำทีมเสียหาย.
- mainRequest: เติมเงินทำงาน/แก้บัญชี; escalation: ยอดภารกิจเพิ่มและอ้างทำผิด.
- expectedSafeBehavior: ไม่จ่ายเพื่อรับค่าตอบแทนและหยุดเติม; potentialReviewBehavior: เชื่อเพราะเคยรับเงิน; criticalCandidateBehavior: เติมซ้ำเพื่อถอน; safeTermination: หยุดทำ เก็บหลักฐาน.
- relatedCategories: Job Scam, E-commerce / Online Shopping, Investment; tacticTags: SMALL_INITIAL_REWARD, SOCIAL_PROOF, ESCALATING_PAYMENT, WITHDRAWAL_LOCK, UPFRONT_FEE.
- personaVariants: ไม่มี option เพิ่ม; themeVariants: V25–V27.
- newsSources: [N10]; shortEvidenceSummary: ผู้หางานถูกพาเข้าภารกิจ มีผลตอบแทนแรกและข้ออ้างผิดขั้นตอน/เติมเงิน.
- estimatedComplexity: HIGH; recommendedMode: TEXT; datasetFamilyId: TASK-FAMILY-DEPOSIT-WITHDRAWAL.
- uniqueness: เทียบ INV-01 ต่างสัญญางาน, หลักฐานงาน/ค่าตอบแทน และเหตุเรียกเงินแก้ภารกิจ; ห้ามต่างเพียงคำว่า task แทน investment. ถ้า authored flow ไม่รักษา 3 ด้านให้รวม leakage group.

## 11. Category 7 Fake Loan

### LOAN-01
- storyFamilyId: LOAN-01; category / primaryCategory: Fake Loan; titleThai: สินเชื่ออนุมัติแต่ต้องจ่ายก่อนรับเงิน; titleEnglish: Approved loan blocked by advance fees.
- sourceOrigin: USER_SOURCE; derivation: USER_SOURCE_DERIVED; provenance: LOAN fee source + NEWS_VALIDATED; CURRENT_CODE: ไม่ใช่ main request fixture; RECOMMENDATION: การตรวจผู้ให้บริการ; DETAIL_PENDING: เอกสาร.
- oneSentencePremise: แจ้งอนุมัติสินเชื่อแล้วให้จ่ายค่าธรรมเนียมก่อนจ่ายเงินกู้.
- initialContact: โฆษณาสินเชื่อ; trustMechanism: วงเงินและผลอนุมัติ; pressureMechanism: ความจำเป็นใช้เงิน.
- mainRequest: จ่ายค่าประกัน/ดำเนินการ; escalation: อ้างข้อมูลผิดแล้วเรียกเพิ่ม.
- expectedSafeBehavior: ตรวจผู้ให้บริการอิสระและไม่จ่ายตามผู้แอบอ้าง; potentialReviewBehavior: เชื่อใบอนุมัติอย่างเดียว; criticalCandidateBehavior: จ่ายค่าปลดวงเงินตามบทหลอก; safeTermination: หยุดสมัครและหยุดจ่าย.
- relatedCategories: Job Scam, Recovery Scam; tacticTags: UPFRONT_FEE, ESCALATING_PAYMENT, FAKE_DOCUMENT, URGENCY.
- personaVariants: ไม่มี option เพิ่ม; themeVariants: V28, V29.
- newsSources: [N11]; shortEvidenceSummary: BOT อธิบายสินเชื่อปลอมเรียกค่าธรรมเนียมและแก้เลขบัญชี.
- estimatedComplexity: MEDIUM; recommendedMode: TEXT; datasetFamilyId: LOAN-FAMILY-ADVANCE-FEE.
- uniqueness: เทียบ LOAN-02 ต่างเงินล่วงหน้าแทนข้อมูลเครื่อง, หลักฐานใบอนุมัติแทนสิทธิ์แอป และการหยุดจ่ายแทนควบคุมสิทธิ์.

### LOAN-02
- storyFamilyId: LOAN-02; category / primaryCategory: Fake Loan; titleThai: แอปเงินกู้ขอข้อมูลเครื่องและข่มขู่ผ่านคนใกล้ชิด; titleEnglish: Intrusive loan app and contact-based intimidation.
- sourceOrigin: USER_SOURCE; derivation: USER_SOURCE_DERIVED; provenance: LOAN app source + NEWS_VALIDATED + CURRENT_CODE บางส่วน; RECOMMENDATION: branch ข่มขู่; DETAIL_PENDING: ต้องแยกแอปปลอม/สินเชื่อเอาเปรียบในคำอธิบาย.
- oneSentencePremise: ผู้ให้กู้สมมติขอรายชื่อผู้ติดต่อแล้วใช้ข้อมูลเป็นแรงกดดัน.
- initialContact: ข้อเสนอสินเชื่อและหน้าติดตั้ง; trustMechanism: อ้างขั้นตอนอนุมัติ; pressureMechanism: กลัวไม่ได้กู้หรือข้อมูลถูกเปิดเผย.
- mainRequest: อนุญาตเข้าถึงข้อมูลไม่จำเป็น; escalation: ข่มขู่ว่าจะติดต่อคนใกล้ชิด.
- expectedSafeBehavior: ตรวจผู้ให้บริการ จำกัดข้อมูล/สิทธิ์และขอความช่วยเหลือ; potentialReviewBehavior: อ่านสิทธิ์แต่ยอมเพราะต้องการกู้; criticalCandidateBehavior: เปิดรายชื่อ/สิทธิ์ควบคุมตามบทเสี่ยง; safeTermination: ยกเลิกและเก็บหลักฐานข่มขู่.
- relatedCategories: SMS / Phishing; tacticTags: APP_INSTALL, CONTACT_LIST_ACCESS, DATA_HARVESTING, THREAT.
- personaVariants: ไม่มี option เพิ่ม; themeVariants: ไม่มี option เพิ่ม.
- newsSources: [N12]; shortEvidenceSummary: DSI รายงานแอปกู้ขอรายชื่อและคุกคามคนใกล้ชิด; ไม่สรุปว่าแอปกู้ทุกชนิดเป็นปลอม.
- estimatedComplexity: HIGH; recommendedMode: TEXT; datasetFamilyId: LOAN-FAMILY-CONTACT-COERCION.
- uniqueness: เทียบ PHI-02 ต่าง evidence สิทธิ์รายชื่อและเงื่อนไขกู้, การข่มขู่บุคคลที่สาม และ safe response ปกป้องเครือข่ายคนใกล้ชิด; generic app prompt อย่างเดียวไม่พอ.

## 12. Category 8 Recovery

### REC-01
- storyFamilyId: REC-01; category / primaryCategory: Recovery Scam; titleThai: ตามเงินคืนแต่เรียกค่าดำเนินการเพิ่ม; titleEnglish: Recovery promise requiring advance fees.
- sourceOrigin: USER_SOURCE; derivation: USER_SOURCE_DERIVED; provenance: REC source + NEWS_VALIDATED; CURRENT_CODE: ไม่ตรง main request ปัจจุบัน; RECOMMENDATION: ตรวจช่องทางช่วยเหลือ; DETAIL_PENDING: เหตุเสียหายเดิม.
- oneSentencePremise: ผู้ติดต่ออ้างช่วยเหยื่อเดิมได้เงินคืนแต่ต้องจ่ายก่อน.
- initialContact: ติดต่อหลังเหตุเสียหายสมมติ; trustMechanism: อ้างรู้เรื่องเดิมและเอกสารคดี; pressureMechanism: ความหวัง/โอกาสคืนเงินจำกัด.
- mainRequest: ค่าติดตาม/ดำเนินการ; escalation: เรียกเพิ่มเพื่อปล่อยเงิน.
- expectedSafeBehavior: ตรวจผู้ช่วยผ่านช่องทางอิสระ ไม่จ่ายตามคำรับประกัน; potentialReviewBehavior: เชื่อเพราะอีกฝ่ายรู้เหตุเดิม; criticalCandidateBehavior: จ่ายซ้ำเพื่อคืนเงิน; safeTermination: หยุดจ่าย เก็บหลักฐานและติดต่อช่องทางที่ตรวจแล้ว.
- relatedCategories: Fake Loan, Call Center; tacticTags: RECOVERY_FEE, IMPERSONATION, FAKE_DOCUMENT, ESCALATING_PAYMENT, URGENCY.
- personaVariants: V30, V31; themeVariants: ไม่มี option เพิ่ม.
- newsSources: [N13]; shortEvidenceSummary: ThaiCERT 2026 เตือนเหยื่อซ้ำผ่านคำรับประกันคืนเงินและค่าดำเนินการ.
- estimatedComplexity: MEDIUM; recommendedMode: TEXT; datasetFamilyId: REC-FAMILY-ADVANCE-RECOVERY-FEE.
- uniqueness: เทียบ REC-02 ต่างคำขอจ่ายแทนควบคุมเครื่อง, หลักฐานค่าคดีแทนแอป และ safe boundary เงินแทนสิทธิ์.

### REC-02
- storyFamilyId: REC-02; category / primaryCategory: Recovery Scam; titleThai: แอปแจ้งความหรือช่วยเงินคืนที่ขอควบคุมเครื่อง; titleEnglish: Fake complaint assistance requesting remote access.
- sourceOrigin: BOTH; derivation: NEWS_DERIVED_CANDIDATE; provenance: REC help seed + CURRENT_CODE + NEWS_VALIDATED_PARTIAL_SPECIFICITY; RECOMMENDATION: เชื่อม fake complaint กับ recovery context; DETAIL_PENDING: ข่าวเคสที่ยืนยันการรวมสองส่วนโดยตรง.
- oneSentencePremise: ผู้แอบอ้างช่วยหลังถูกหลอกให้ติดตั้ง/เปิดการควบคุมเครื่องเพื่อดำเนินเรื่อง.
- initialContact: ผู้ช่วยติดตามเหตุเดิม; trustMechanism: อ้างศูนย์แจ้งความ; pressureMechanism: ต้องทำทันทีเพื่อช่วยเงิน.
- mainRequest: เปิด remote access จำลอง; escalation: อ้างเป็นขั้นตอนบังคับ.
- expectedSafeBehavior: ตรวจช่องทางแจ้งเหตุและปฏิเสธการควบคุมเครื่อง; potentialReviewBehavior: ยอมอ่านขั้นตอนจากผู้ช่วยโดยไม่ตรวจตัวตน; criticalCandidateBehavior: ยืนยันเปิด remote access; safeTermination: ตัดการเชื่อมต่อจำลองและเลือกช่องทางช่วยเหลืออิสระ.
- relatedCategories: SMS / Phishing, Call Center; tacticTags: IMPERSONATION, APP_INSTALL, REMOTE_ACCESS, URGENCY.
- personaVariants: ไม่มี option เพิ่ม; themeVariants: ไม่มี option เพิ่ม.
- newsSources: [N13], [N14]; shortEvidenceSummary: N14 กล่าวถึงแอปแจ้งความปลอมที่ใช้ remote desktop; N13 สนับสนุน recovery fraud แต่ไม่กล่าว remote. การรวมเป็นเรื่องนี้ยังเป็นข้อเสนอ ไม่อ้างว่าข่าวเดียวพิสูจน์ทุกขั้น.
- estimatedComplexity: HIGH; recommendedMode: TEXT; datasetFamilyId: REC-FAMILY-REMOTE-ASSISTANCE.
- uniqueness: เทียบ PHI-02 ต้องต่าง contact หลังสูญเสียเดิม, evidence ช่องทางคดี/ผู้ช่วย และ decision ตรวจการช่วยเหลือพร้อมรักษาหลักฐาน; ถ้าเขียนเหลือแค่ลิงก์ติดตั้งให้ merge/reclassify. Core selection มีเงื่อนไข review นี้.

## 13. Category 9 Job

### JOB-01
- storyFamilyId: JOB-01; category / primaryCategory: Job Scam; titleThai: งานปลอมเรียกค่าสมัครหรือค่าอบรม; titleEnglish: Fake recruitment requiring candidate fees.
- sourceOrigin: USER_SOURCE; derivation: USER_SOURCE_DERIVED; provenance: JOB source + NEWS_VALIDATED + CURRENT_CODE; RECOMMENDATION: ตรวจฝ่ายบุคคล; DETAIL_PENDING: ประกาศ.
- oneSentencePremise: รับเข้าทำงานง่ายแล้วเรียกเงินก่อนเริ่มงาน.
- initialContact: ประกาศ/ผู้รับสมัคร; trustMechanism: บริษัทและผลรับเข้าทำงานสมมติ; pressureMechanism: ตำแหน่งจำกัด.
- mainRequest: ค่าสมัคร/อบรม/อุปกรณ์; escalation: ต้องจ่ายก่อนยืนยันงาน.
- expectedSafeBehavior: ตรวจประกาศและผู้รับสมัครจากองค์กรอิสระ; potentialReviewBehavior: เชื่อรายได้สูงโดยไม่ตรวจ; criticalCandidateBehavior: ชำระแก่ผู้แอบอ้างในบท; safeTermination: ปฏิเสธและรายงานประกาศ.
- relatedCategories: Task Scam, Fake Loan; tacticTags: IMPERSONATION, UPFRONT_FEE, URGENCY.
- personaVariants: ไม่มี option เพิ่ม; themeVariants: V32.
- newsSources: [N15]; shortEvidenceSummary: ข่าวอ้างคำเตือนกรมการจัดหางานเรื่องค่ารับสมัครปลอม. ไม่ตัดสินค่าธรรมเนียมทุกบริบทเป็น scam โดยลำพัง.
- estimatedComplexity: MEDIUM; recommendedMode: TEXT; datasetFamilyId: JOB-FAMILY-RECRUITMENT-FEE.
- uniqueness: เทียบ TASK-01 ต่างก่อนเริ่มงาน, หลักฐาน HR/ประกาศ และเงื่อนไขรับเข้าทำงานแทนยอดภารกิจ/ถอน.

### JOB-02
- storyFamilyId: JOB-02; category / primaryCategory: Job Scam; titleThai: รับสมัครงานเพื่อเก็บเอกสารเกินจำเป็น; titleEnglish: Recruitment used to harvest identity documents.
- sourceOrigin: USER_SOURCE; derivation: USER_SOURCE_DERIVED; provenance: JOB document source + NEWS_VALIDATED_GENERAL_PATTERN; CURRENT_CODE: ไม่มี; RECOMMENDATION: แยกเฉพาะเมื่อไม่มี fee/mule เป็นกลไกหลัก; DETAIL_PENDING: independent data-only progression และความจำเป็นของเอกสาร.
- oneSentencePremise: ผู้รับสมัครขอเอกสารสำคัญโดยยังไม่ยืนยันองค์กรหรือความจำเป็น.
- initialContact: ประกาศและสัมภาษณ์; trustMechanism: แบบฟอร์ม HR; pressureMechanism: ส่งเอกสารทันทีเพื่อรักษาสิทธิ.
- mainRequest: ส่งข้อมูลระบุตัวตนจำลองเกินจำเป็น; escalation: ขอเพิ่มก่อนอธิบายวัตถุประสงค์.
- expectedSafeBehavior: ตรวจองค์กร วัตถุประสงค์และลดข้อมูล; potentialReviewBehavior: เชื่อแบบฟอร์มโดยไม่ตรวจผู้รับ; criticalCandidateBehavior: เปิดเผยชุดข้อมูลสำคัญตามขอบเขตที่ต้องกำหนดภายหลัง; safeTermination: ไม่ส่งและขอตรวจสอบก่อน.
- relatedCategories: SMS / Phishing; tacticTags: DATA_HARVESTING, IMPERSONATION, URGENCY.
- personaVariants: ไม่มี option เพิ่ม; themeVariants: ไม่มี option เพิ่ม.
- newsSources: [N15]; shortEvidenceSummary: คำเตือนรับสมัครปลอมรวมความเสี่ยงข้อมูลส่วนบุคคล แต่ยังไม่พอพิสูจน์ independent family ทุกขั้น.
- estimatedComplexity: MEDIUM; recommendedMode: TEXT; datasetFamilyId: JOB-FAMILY-DOCUMENT-HARVEST.
- uniqueness: เทียบ JOB-01 ต่าง request เอกสาร, evidence ความจำเป็น/ผู้รับข้อมูล และ safe response ลดข้อมูลแทนหยุดค่าธรรมเนียม. จัด EXTENDED จนยืนยันโครงต่างอย่างน้อย 3 ด้านครบ.

### JOB-03
- storyFamilyId: JOB-03; category / primaryCategory: Job Scam; titleThai: งานรับและส่งต่อเงินผ่านบัญชีส่วนตัว; titleEnglish: Recruitment into personal-account money forwarding.
- sourceOrigin: USER_SOURCE; derivation: USER_SOURCE_DERIVED; provenance: JOB account source + NEWS_VALIDATED; CURRENT_CODE: ไม่มี dedicated flow; RECOMMENDATION: บัญชี/รายการสมมติ; DETAIL_PENDING: job description.
- oneSentencePremise: งานอ้างรายได้ง่ายแต่หน้าที่คือใช้บัญชีส่วนตัวรับและส่งเงินแทน.
- initialContact: ประกาศงานแอดมิน/การเงินสมมติ; trustMechanism: อ้างบริษัทและค่าจ้าง; pressureMechanism: ต้องทำรายการตามเวลางาน.
- mainRequest: ให้ใช้บัญชีรับ/ส่งเงินแทน; escalation: เพิ่มธุรกรรมและขอสิทธิ์ใช้บัญชี.
- expectedSafeBehavior: ตรวจหน้าที่และปฏิเสธใช้บัญชีแทนผู้อื่น; potentialReviewBehavior: ยอมรับงานโดยยังไม่ทำรายการ; criticalCandidateBehavior: ยืนยันส่งต่อเงิน/ให้ใช้บัญชีในบท; safeTermination: ไม่ดำเนินรายการ เก็บหลักฐานและขอคำแนะนำทางการ.
- relatedCategories: Call Center; tacticTags: MONEY_MULE, IMPERSONATION, URGENCY.
- personaVariants: ไม่มี option เพิ่ม; themeVariants: ไม่มี option เพิ่ม.
- newsSources: [N16]; shortEvidenceSummary: ข่าวอ้างตำรวจเตือนงานออนไลน์ที่นำผู้สมัครเข้าสู่บัญชีม้า; ไม่ให้ข้อสรุปทางกฎหมายรายบุคคล.
- estimatedComplexity: HIGH; recommendedMode: TEXT; datasetFamilyId: JOB-FAMILY-MONEY-FORWARDING.
- uniqueness: เทียบ JOB-01 ต่างการรับส่งแทนจ่ายค่าจ้าง, หลักฐานหน้าที่/เส้นทางรายการ และผลเสี่ยงบัญชีถูกใช้แทนสูญค่าสมัคร.

## 14. Normal Call Controls

Matched-control refinement | 2026-09-30 | base HEAD `4062a8b837728a3aed56df48ea35eaeaf0c3fa87` | CONTENT REFINEMENT ONLY

ไม่รวม controls ใน 19 scam families และไม่เพิ่ม ID ใหม่ รอบนี้คง CC-N01 และแทนเนื้อหา CC-N02 ด้วยบริบทธนาคาร ทั้งสองยังเป็น CONTROL / CONDITIONAL_CONTENT ไม่อนุมัติ policy การประเมินโดยอัตโนมัติ

**เหตุผลการจับคู่ [RECOMMENDATION]:** ใช้ SAME / SIMILAR SURFACE CONTEXT + DIFFERENT UNDERLYING BEHAVIOR เพื่อให้ผู้เรียนแยกจากพฤติกรรมและคำขอ การเทียบสายคดีปลอมกับสายปกติที่หัวข้อไม่เกี่ยวกันทำให้เดาประเภทจากหัวข้อได้ง่าย จึงใช้คู่พัสดุและคู่ธนาคาร ไม่สอนว่า “ตำรวจ = scam”, “ธนาคาร = scam”, “สายแปลก = scam” หรือ “ปฏิเสธทุกสาย = correct”

| Pair | Scam | Normal | Same context | Key difference |
|---|---|---|---|---|
| A | CC-01 | CC-N01 | parcel / delivery | สายหลอกเริ่มเรื่องพัสดุแล้วอ้างอำนาจ คดี เอกสาร และขอโอนเงิน; สายปกติยืนยันการจัดส่งที่มีคำสั่งซื้ออยู่แล้วและตอบเพียงข้อมูลจำเป็น |
| B | CC-02 | CC-N02 | bank / transaction notification | สายหลอกขอ OTP และเร่งให้ทำตามในสาย; สายปกติให้เปิดแอปเอง ไม่ขอข้อมูลลับหรือเงิน และยอมรับการวางสาย/ติดต่อกลับ |

สิ่งที่ผู้เรียนควรสังเกต:
1. ผู้โทรกำลังขออะไร
2. ขอข้อมูลลับหรือไม่
3. ขอให้โอนเงินหรือไม่
4. ยอมให้ตรวจสอบผ่านช่องทางอิสระหรือไม่
5. ใช้ความเร่งด่วน ข่มขู่ หรือขอเก็บเป็นความลับหรือไม่
6. สามารถวางสายและติดต่อกลับเองได้หรือไม่

**ข้อจำกัด controls:** ไม่มีคำขอ OTP, password, transfer, upfront fee, remote access หรือ app install; ไม่มีคำขู่ secrecy/isolation เส้นตายปลอม warning ปลอม หรือ critical action ความยากมาจากบริบทใกล้กัน ไม่ใช่แต่งพฤติกรรมอันตรายให้สายปกติ การรับสาย การขอตรวจ และการวางสายอย่างสุภาพไม่ใช่ความผิด ความสุภาพเพียงอย่างเดียวก็ไม่ยืนยันตัวตน

**การเลือกคู่บริบทในอนาคต [RECOMMENDATION]:** PARCEL CONTEXT → CC-01 หรือ CC-N01; BANK CONTEXT → CC-02 หรือ CC-N02 ยังเป็น target design ไม่ใช่ runtime selector ของ Story IDs เหล่านี้. **CURRENT_CODE:** Backend เลือก NORMAL_CALL / SCAM_CALL ด้วย `randomInt(2)` อัตรา 50/50 แล้ว แต่คู่ปัจจุบันคือห้องสมุดนัดรับหนังสือกับผู้แอบอ้างธนาคารขอ OTP ไม่ใช่ matched controls ข้างต้น. การจับคู่บริบทใหม่ยังไม่กำหนดอัตราแยกรายเรื่อง; ใช้หน้าจอเริ่มต้นและชื่อบริบทกลาง ไม่ให้ป้าย “normal/scam” เป็นคำเฉลย.

### CC-N01
- storyFamilyId: CC-N01; type: CONTROL_NORMAL; category / primaryCategory: Call Center; titleThai: สายยืนยันการจัดส่งปกติ; titleEnglish: Normal delivery confirmation.
- sourceOrigin: USER_SOURCE; derivation: USER_SOURCE_DERIVED; provenance: CC-S06 รองรับแนวคิดสายยืนยันจัดส่ง; RECOMMENDATION: รายละเอียดบทและการจับคู่กับ CC-01; DETAIL_PENDING: เนื้อสนทนาและ control outcome policy.
- status / selectionTier: CONTROL; approval: CONDITIONAL_CONTENT.
- matchedScamFamily: CC-01; matchedDimension: parcel / delivery surface context.
- oneSentencePremise: ผู้จัดส่งยืนยันการจัดส่งของคำสั่งซื้อสมมติที่ผู้เรียนมีอยู่แล้ว ผู้เรียนเปิดรายการของตนเองเทียบได้และตอบเฉพาะข้อมูลที่จำเป็นต่อการจัดส่ง.
- initialContact: สายจากผู้จัดส่งสมมติ; trustMechanism: เทียบเลขพัสดุ เวลา และร้านค้ากับคำสั่งซื้อเดิม; pressureMechanism: ไม่มี; mainRequest: ยืนยันช่วงเวลารับสินค้า; escalation: ไม่มี.
- expectedSafeBehavior: ตรวจคำสั่งซื้อเองก่อนตอบเฉพาะเรื่องจัดส่ง; potentialReviewBehavior: ยังไม่กำหนด ไม่ลงโทษความระมัดระวัง; criticalCandidateBehavior: ไม่มี; safeTermination: ยืนยันเวลา ขอเลื่อน หรือวางสายแล้วติดต่อผ่านช่องทางเดิม.
- safetyBoundary: ไม่มีคำขอ OTP/รหัสผ่าน/โอนเงิน/ค่าธรรมเนียม/ติดตั้งแอป/ควบคุมเครื่อง ไม่มีความลับ คำขู่ หรือการบังคับให้โอนสาย; ไม่มี harmful action.
- relatedCategories: E-commerce / Online Shopping; tacticTags: []; personaVariants: []; themeVariants: [].
- newsSources: ไม่ใช้ข่าว scam มายืนยัน normal; sourceUrls: ไม่เกี่ยวข้อง; accessDate: 2026-09-27; shortEvidenceSummary: แนวคิดสายจัดส่งมาจากผู้ใช้ รายละเอียด matched control เป็นข้อเสนอ ไม่อ้างสถิติ.
- estimatedComplexity: LOW; recommendedMode: TEXT_OR_VOICE; datasetFamilyId: CC-CONTROL-DELIVERY.

### CC-N02
- storyFamilyId: CC-N02; type: CONTROL_NORMAL; category / primaryCategory: Call Center; titleThai: สายธนาคารปกติแจ้งให้ตรวจสอบรายการ; titleEnglish: Normal bank transaction notification.
- sourceOrigin: USER_SOURCE; derivation: USER_SOURCE_DERIVED control concept + RECOMMENDATION for bank-transaction matched context; provenance: CC-S06 รองรับเพียงแนวคิดสายปกติทั่วไป ไม่ได้ระบุบทธนาคารนี้โดยตรง; DESIGN RECOMMENDATION / MATCHED CONTROL เมื่อ 2026-09-30; DETAIL_PENDING: บทธนาคารและ control outcome policy.
- status / selectionTier: CONTROL; approval: CONDITIONAL_CONTENT.
- matchedScamFamily: CC-02; matchedDimension: bank / abnormal transaction surface context.
- oneSentencePremise: ฝ่ายธนาคารสมมติแจ้งให้ผู้เรียนตรวจรายการผ่านช่องทางที่ผู้เรียนเปิดเอง โดยไม่ขอ OTP รหัสผ่าน หรือการโอนเงิน.
- initialContact: สายจากฝ่ายบริการ/ความปลอดภัยธนาคารสมมติ; trustMechanism: ข้อมูลอ้างอิงทั่วไปที่ผู้เรียนเทียบกับแอปธนาคารจำลองของตนเองได้; pressureMechanism: ไม่มีแรงกดดันให้ข้ามการตรวจสอบ; mainRequest: เปิดแอปธนาคารจำลองเองเพื่อตรวจรายการ หรือรับทราบว่าควรติดต่อกลับผ่านช่องทางเดิม; escalation: ไม่มี.
- expectedSafeBehavior: เปิดแอปหรือช่องทางธนาคารเอง ตรวจยอด เวลา และรายการ จำกัดข้อมูลตอบกลับ และวางสาย/โทรกลับได้; potentialReviewBehavior: ยังไม่กำหนด ไม่ลงโทษความระมัดระวัง; criticalCandidateBehavior: ไม่มี; safeTermination: รับทราบแล้วตรวจผ่านแอป หรือวางสายแล้วติดต่อช่องทางเดิม.
- safetyBoundary: ไม่มีคำขอ OTP/รหัสผ่าน/โอนเงิน/ค่าธรรมเนียม/ติดตั้งแอป/ควบคุมเครื่อง ไม่มีคำขู่ ความลับ การแยกจากผู้อื่น หรือเส้นตายที่ทำให้ข้ามการตรวจสอบ; ไม่มี harmful action.
- relatedCategories: []; tacticTags: []; personaVariants: []; themeVariants: [].
- newsSources: ไม่เกี่ยวข้อง; sourceUrls: ไม่เกี่ยวข้อง; accessDate: 2026-09-27 สำหรับแนวคิด control เดิม; contentRevisionDate: 2026-09-30; shortEvidenceSummary: บทธนาคารเป็นข้อเสนอ matched control ไม่ใช่ incident ข่าวหรือข้ออ้างว่าธนาคารจริงทุกแห่งติดต่อแบบนี้.
- estimatedComplexity: LOW; recommendedMode: TEXT_OR_VOICE; datasetFamilyId: CC-CONTROL-BANK-TRANSACTION; identifier นี้เป็นแผนเนื้อหา ไม่ได้สร้าง dataset หรือแก้ registry.

## 15. Cross-category Hybrid Map

| Case | Overlap | Disposition |
|---|---|---|
| X01 | Romance ชวนลงทุน -> INV-01 | DUPLICATE ถ้า underlying withdrawal flow เดียว; primary Investment, related Romance, ไม่สร้าง ROM-03 |
| X02 | ร้านค้า -> งานกดคำสั่งซื้อ | PARTIAL_OVERLAP; ซื้อสินค้า ECO-01, ทำงานรับค่าตอบแทน TASK-01 |
| X03 | Call Center -> Phishing | PARTIAL_OVERLAP; CC-02 ขอรหัสด้วยการคุย, PHI-01 ขอผ่านแบบฟอร์ม; ลิงก์เป็นแค่ escalation ไม่เพิ่มเรื่อง |
| X04 | Job -> Money Mule | primary JOB-03; MONEY_MULE เป็น tag ไม่ใช่หมวดสิบ |
| X05 | Recovery -> Remote Access | REC-02 related Phishing; remote เป็นกลไกและต้องรักษาความต่างจาก PHI-02 |
| X06 | Task -> Investment withdrawal lock | TASK-01 ต้องมีงาน/ค่าตอบแทน; INV-01 ต้องมีการลงทุน/ผลตอบแทน ถ้าเปลี่ยนเพียงคำนามให้รวม leakage group |
| X07 | Loan -> App permissions | LOAN-02 ต่างการใช้ contacts ข่มขู่; generic install อย่างเดียวไม่พอ |
| X08 | Recovery/Loan/Job fees | ไม่แยกตามชื่อค่าธรรมเนียม; ตรวจ lifecycle หลักฐานและ safe decision; shared-flow grouping ก่อน dataset split |

รายการผสมหลายหมวดไม่ใช่โอกาสนับซ้ำ. Game 8 cases อยู่ separate future phase; เรื่องตั๋ว/ที่พัก/ทุน/ประกันและ BEC ไม่ถูกเติมเป็น dialogue categories.

## 16. Core Project Set

**ข้อเสนอ:** Core 18 รวม Demo 9; จำนวนไม่ใช่ implementation commitment. เลือกความต่างของ learner role, evidence, request, safe response และความซับซ้อน ไม่ใช้จำนวนข่าวแทน prevalence. ผู้ทดลองไม่จำเป็นต้องเล่นครบ 18 เรื่องต่อครั้ง; session length/counterbalancing รอ study design.

Master Table ใช้ DEMO หมายถึงสมาชิก Core ที่เหมาะสาธิต; CORE คืออีก 9 เรื่อง. Risk เป็น candidate เท่านั้น. Variants อ้าง registry ไม่ใช่ template counts. Current mappings เป็น partial semantic matches.

| Category | Story Family ID | Thai Title | Premise | Origin | Primary Tactics | Critical Risk | Main Decision Pattern | Variants | Current Implementation Mapping | News Validation | Complexity | Recommended Set |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Call Center | CC-01 | คดีปลอมบังคับโอน | อ้างคดีให้โอนตรวจ | USER_SOURCE | AUTHORITY_PRESSURE, THREAT | โอน | ตรวจหน่วยงานอิสระ | V01–V03 | ไม่มี | N01 | MEDIUM | CORE |
| Call Center | CC-02 | ธนาคารปลอมขอรหัส | ตรวจธุรกรรมขอ OTP | USER_SOURCE | OTP_REQUEST | ให้รหัส | ยืนยันผ่านช่องทางเดิม | V04 | call-center-scam v1 | N02 | LOW | DEMO |
| Investment | INV-01 | ลงทุนถอนติดล็อก | กำไรแรกแล้วขอเพิ่ม | USER_SOURCE | WITHDRAWAL_LOCK | จ่ายเพิ่ม | ตรวจผู้ให้บริการ/หยุด | V05–V11 | investment-scam v1 | N03 | HIGH | DEMO |
| Investment | INV-02 | ผลตอบแทนชวนสมาชิก | รายได้จากสมาชิกใหม่ | NEWS | RECRUITMENT_REWARD | ลงเงิน/ชวนคน | ตรวจรายได้จริง | V10–V11 | ไม่มี | N04 | HIGH | CORE |
| Romance | ROM-01 | คนรักขอเงินฉุกเฉิน | ผูกพันก่อนขอช่วย | USER_SOURCE | EMOTIONAL_MANIPULATION | โอน | แยกสัมพันธ์จากเงิน | V12–V17 | romance-scam v1 | N05 | MEDIUM | DEMO |
| Romance | ROM-02 | ของขวัญติดค่าธรรมเนียม | ส่งของแล้วเรียกค่าปล่อย | USER_SOURCE | UPFRONT_FEE | จ่าย | ตรวจพัสดุอิสระ | V12–V15 | ไม่มี | N05, N17 | HIGH | CORE |
| E-commerce | ECO-01 | ร้านชวนจ่ายนอกระบบ | รีวิวเร่งให้โอนตรง | USER_SOURCE | OFF_PLATFORM_PAYMENT | จ่ายเสี่ยง | ตรวจร้าน/คุ้มครอง | V18–V20 | ecommerce-scam v1 | N06 | MEDIUM | DEMO |
| E-commerce | ECO-02 | COD ไม่ได้สั่ง | พัสดุเรียกเงิน | USER_SOURCE | URGENCY | จ่ายโดยไม่ยืนยัน | ตรวจคำสั่งซื้อ | ไม่มี | ไม่มี | N07 | LOW | CORE |
| E-commerce | ECO-03 | สลิปปลอมหลอกผู้ขาย | ภาพโอนเร่งส่งของ | BOTH | FAKE_RECEIPT | ส่งของ | ตรวจยอดเข้าจริง | ไม่มี | ไม่มี | N02, N08 | MEDIUM | CORE |
| SMS/Phishing | PHI-01 | แบบฟอร์มขโมยข้อมูล | ข้อความพาไปเว็บ | USER_SOURCE | PHISHING_LINK | ให้รหัส | ตรวจ destination | V21–V24 | sms-phishing-demo v4 | N09 | MEDIUM | DEMO |
| SMS/Phishing | PHI-02 | ข้อความพาติดตั้งแอป | อ้างบริการขอสิทธิ์ | USER_SOURCE | APP_INSTALL | เปิดสิทธิ์ | ตรวจแหล่ง/ปฏิเสธ | ไม่มี | ไม่มี | N09 | MEDIUM | CORE |
| Task | TASK-01 | เติมเพื่อถอนค่าภารกิจ | งานง่ายแล้วเงินติด | USER_SOURCE | SMALL_INITIAL_REWARD | เติมเงิน | หยุดจ่ายเพื่อทำงาน | V25–V27 | task-scam v1 | N10 | HIGH | DEMO |
| Fake Loan | LOAN-01 | อนุมัติแต่จ่ายก่อน | ค่าปลดเงินกู้ | USER_SOURCE | UPFRONT_FEE | จ่าย | ตรวจผู้ให้บริการ | V28–V29 | ไม่มี | N11 | MEDIUM | CORE |
| Fake Loan | LOAN-02 | แอปกู้เข้าถึงรายชื่อ | ขอสิทธิ์แล้วข่มขู่ | USER_SOURCE | CONTACT_LIST_ACCESS | เปิดข้อมูล | จำกัดสิทธิ์/ขอช่วย | ไม่มี | fake-loan-scam v1 บางส่วน | N12 | HIGH | DEMO |
| Recovery | REC-01 | ค่าช่วยเงินคืน | เหยื่อเดิมถูกเรียกเพิ่ม | USER_SOURCE | RECOVERY_FEE | จ่ายซ้ำ | ตรวจผู้ช่วย | V30–V31 | ไม่มี | N13 | MEDIUM | CORE |
| Recovery | REC-02 | ช่วยแจ้งความขอคุมเครื่อง | อ้างช่วยแล้วขอ remote | BOTH | REMOTE_ACCESS | เปิด remote | ตรวจช่องทางแจ้งเหตุ | ไม่มี | recovery-scam v1 | N13–N14 บางส่วน | HIGH | DEMO |
| Job | JOB-01 | งานเรียกค่าอบรม | จ่ายก่อนเริ่มงาน | USER_SOURCE | UPFRONT_FEE | จ่าย | ตรวจ HR/ประกาศ | V32 | job-scam v1 | N15 | MEDIUM | DEMO |
| Job | JOB-02 | งานเก็บเอกสาร | ขอข้อมูลเกินจำเป็น | USER_SOURCE | DATA_HARVESTING | ส่งข้อมูล | ตรวจวัตถุประสงค์ | ไม่มี | ไม่มี | N15 ภาพรวม | MEDIUM | EXTENDED |
| Job | JOB-03 | งานรับส่งเงิน | ใช้บัญชีตนแทนบริษัท | USER_SOURCE | MONEY_MULE | ส่งต่อเงิน | ปฏิเสธใช้บัญชีแทน | ไม่มี | ไม่มี dedicated flow | N16 | HIGH | CORE |
| Call Center | CC-N01 | ยืนยันส่งของปกติ | ตรวจเวลาส่ง | USER_SOURCE | ไม่มี | ไม่มี | ตรวจคำสั่งซื้อเดิม | ไม่มี | ไม่ implement | ไม่เกี่ยวข้อง | LOW | CONTROL |
| Call Center | CC-N02 | ธนาคารแจ้งตรวจรายการปกติ | เปิดแอปเองตรวจรายการ | USER_SOURCE control concept + RECOMMENDATION bank context | ไม่มี | ไม่มี | ตรวจแอป/ช่องทางธนาคารที่เปิดเอง | ไม่มี | ไม่ implement | ไม่เกี่ยวข้อง | LOW | CONTROL / CONDITIONAL_CONTENT |

Selection gates: REC-02 ต้อง review ความต่างจาก PHI-02 และ source specificity; LOAN-02 ต้องแยก fake loan กับการกู้ที่ละเมิดข้อมูล; INV-02/ECO-03 เป็น additions ที่ต้องอนุมัติ. จำนวน Core 18 เป็นข้อเสนอมีเงื่อนไข ไม่ใช่รับรองว่า stories พร้อมเขียนทันที.

## 17. Extended Story Bank

Extended-only: **JOB-02 จำนวน 1**. คงไว้เพราะ data minimization ต่างจาก fee/mule แต่ต้องมีหลักฐานและบทที่แสดง independent data-only flow. หากรายละเอียดสุดท้ายเป็นเพียงขั้นสมัคร JOB-01 ให้ลดเป็นองค์ประกอบและปรับ count; ไม่ยืนยัน uniqueness อย่างไม่มีเงื่อนไข.

Whole bank = 19 scam families (18 core + 1 extended). ไม่สร้าง 30–50 เรื่องจากการเปลี่ยนประเทศ สินทรัพย์หรือจำนวนเงิน. QR direct-payment, standalone wrong-goods dispute และ independent task mechanisms เป็น research gaps ไม่ใช่ accepted families. 32 variants อยู่ส่วน 4.

<a id="18-current-repo-mapping"></a>

## 18. Current runtime alignment

**Superseding implementation note — Call Center Part 1, 2026-10-06:** new sessions now pin
v3 parcel/bank × scam/normal story identities and use a dedicated phone simulator with a
caller-first opening. All four share foundation-only identity/verification content; this
does not complete the target stories in this document. Published v1/v2 are unchanged for
historical sessions. The dated 2026-10-02 mapping below is historical, not the current new-start
selection. See [Call Center foundation](call-center-foundation.md); the other eight categories
remain unchanged in this phase.

**CURRENT_CODE ตรวจ 2026-10-02 ที่ `7ce29f87d247c457789489a3e0e7091e005c24b2`:** เรียก `app.listScenarios()` ด้วย in-memory repository ได้ 9 cards / 9 categories. ทั้งเก้าหมวดมีเส้นทางฝึกผ่าน [Frontend](../src/frontend/training.tsx); [catalog](../src/application/catalog.ts) ใช้ SMS v4 และ scam fixtures v1 อีกแปดหมวด. `registeredTemplates` มี 10 tuples เพราะเพิ่ม NORMAL_CALL ในหมวด Call Center เดิม ไม่ใช่ card ที่สิบ และไม่ใช่ 21 runtime stories.

### Demo vs target — canonical summary

| Scope | Count / status |
|---|---|
| Public scenario cards | 9 |
| Public categories | 9; เล่นเป็น category-level demo ผ่านข้อความได้ |
| Target storyboard stories | 21; แบบเนื้อหา ไม่ใช่จำนวนเรื่องที่เล่นได้แล้ว |
| Scam story families | 19 ใน content taxonomy |
| Normal matched controls | 2 เป้าหมาย: CC-N01 / CC-N02 |
| Current dedicated 21-story runtime | ยังไม่มี; ไม่มีการเลือก Story ID ทั้ง 21 ใน Frontend |
| Call Center backend NORMAL/SCAM selection | Implemented: `randomInt(2)` ให้โอกาส 50/50 ต่อการเริ่มใหม่ |
| Call Center target controls CC-N01/CC-N02 | ออกแบบแล้ว แต่ยังไม่เป็น runtime story แยก |
| Current runtime normal control | ห้องสมุดสมมตินัดรับหนังสือ; ต่างจาก target controls ทั้งสอง |

### Current runtime mapping ราย Story ID

สถานะต่อไปนี้ใช้ตรวจเอกสารเท่านั้น ไม่ใช่ enum ใหม่ในระบบ: `IMPLEMENTED_CLOSE_MATCH` หมายถึงกลไกหลักใกล้เคียง ไม่รับรอง parity ทุกเฟรม; `IMPLEMENTED_PARTIAL` หมายถึงตรงเพียงบางแนวคิด; `NOT_IMPLEMENTED_AS_SEPARATE_STORY` คือออกแบบไว้แต่ไม่มี runtime story แยก; `TARGET_CONTROL_NOT_IMPLEMENTED` คือ matched control ที่ยังไม่ถูกนำมาใช้. Story IDs เป็น content IDs ไม่ใช่ runtime template IDs.

| Story ID | Current runtime status | Current implementation mapping | Notes |
|---|---|---|---|
| CC-01 | NOT_IMPLEMENTED_AS_SEPARATE_STORY | ไม่มี fixture คดีปลอม/พัสดุพาเข้าเรื่องคดีโดยเฉพาะ | ไม่ใช่ main request ของ SCAM_CALL ปัจจุบัน |
| CC-02 | IMPLEMENTED_CLOSE_MATCH | `call-center-scam` v1 / SCAM_CALL | แอบอ้างเจ้าหน้าที่การเงิน แจ้งรายการผิดปกติ ขู่ระงับบัญชี ขอ OTP; ไม่ครบทุกเฟรมของ storyboard |
| CC-N01 | TARGET_CONTROL_NOT_IMPLEMENTED | ไม่มี runtime สายจัดส่งปกติ | NORMAL_CALL ปัจจุบันเป็นห้องสมุด ไม่ใช่ delivery control |
| CC-N02 | TARGET_CONTROL_NOT_IMPLEMENTED | ไม่มี runtime สายธนาคารปกติ | NORMAL_CALL ปัจจุบันไม่ใช่ bank-transaction control |
| INV-01 | IMPLEMENTED_CLOSE_MATCH | `investment-scam` v1 | รับรองกำไร/ยอดกำไร/ค่าปลดล็อกถอน; ยังไม่ใช่ progression ยาวครบทุกเฟรม |
| INV-02 | NOT_IMPLEMENTED_AS_SEPARATE_STORY | ไม่มี recruitment-return flow แยก | คงเป็น target content |
| ROM-01 | IMPLEMENTED_CLOSE_MATCH | `romance-scam` v1 | ความสัมพันธ์ออนไลน์ ขอเงินฉุกเฉินและให้เก็บเป็นความลับ |
| ROM-02 | NOT_IMPLEMENTED_AS_SEPARATE_STORY | ไม่มี gift/parcel-fee flow แยก | ไม่เพิ่มจาก persona variants |
| ECO-01 | IMPLEMENTED_CLOSE_MATCH | `ecommerce-scam` v1 | ร้านค้า/รีวิวตรวจไม่ได้/ให้จ่ายนอกแพลตฟอร์ม |
| ECO-02 | NOT_IMPLEMENTED_AS_SEPARATE_STORY | ไม่มี unknown-order COD flow แยก | คงเป็น target content |
| ECO-03 | NOT_IMPLEMENTED_AS_SEPARATE_STORY | ไม่มี learner-as-seller/fake-slip flow แยก | ไม่เท่ากับ runtime ที่ผู้เรียนเป็นผู้ซื้อ |
| PHI-01 | IMPLEMENTED_CLOSE_MATCH | `sms-phishing-demo` v4; dedicated SMS fixture | ข้อความพัสดุ ลิงก์ รหัสผ่าน/OTP; ไม่รับรองหน้าจอ form ครบตาม storyboard; v1–v3 คือ revisions |
| PHI-02 | NOT_IMPLEMENTED_AS_SEPARATE_STORY | ไม่มี SMS app-install story แยก | แนวคิดติดตั้งแอปในหมวดอื่นไม่ทำให้เรื่องนี้ implement แล้ว |
| TASK-01 | IMPLEMENTED_CLOSE_MATCH | `task-scam` v1 | ภารกิจ ค่าตอบแทนเล็กน้อย เติมเงินเพื่อถอน |
| LOAN-01 | NOT_IMPLEMENTED_AS_SEPARATE_STORY | ไม่มี fee-before-loan story แยก | description กล่าวค่าธรรมเนียม ไม่ใช่ flow แยก |
| LOAN-02 | IMPLEMENTED_PARTIAL | `fake-loan-scam` v1 | ติดตั้งแอปไม่รู้ที่มา/สิทธิ์ข้อมูล; critical คือ INSTALL_UNTRUSTED_APP; ยังไม่มี contacts-coercion progression เต็ม |
| REC-01 | NOT_IMPLEMENTED_AS_SEPARATE_STORY | ไม่มี recovery-fee story แยก | ไม่อนุมานจาก description เรื่องค่าดำเนินการ |
| REC-02 | IMPLEMENTED_PARTIAL | `recovery-scam` v1 | ขอควบคุมเครื่องเพื่อช่วยเงินคืน; critical คือ GRANT_REMOTE_CONTROL; ไม่ครบฉากแอปแจ้งความ/การกู้คืนทุกขั้น |
| JOB-01 | IMPLEMENTED_CLOSE_MATCH | `job-scam` v1 | ตรวจบริษัทไม่ได้/เรียกค่าฝึกอบรมก่อนเริ่ม |
| JOB-02 | NOT_IMPLEMENTED_AS_SEPARATE_STORY | ไม่มี data-only recruitment flow แยก | คงเป็น EXTENDED / CONDITIONAL_CONTENT |
| JOB-03 | NOT_IMPLEMENTED_AS_SEPARATE_STORY | ไม่มี money-mule job flow แยก | description กล่าวบัญชีไม่เท่ากับ implement เรื่องนี้ |

**CURRENT_RUNTIME_CONTROL_DIFFERS:** [normal-call.ts](../src/fixtures/normal-call.ts) ระบุ `characterRole` ว่า “เจ้าหน้าที่ห้องสมุดสมมติติดต่อยืนยันช่วงเวลานัดรับหนังสือ ผู้ใช้ไม่ต้องให้ข้อมูลส่วนบุคคล”. ใช้ `call-center-scam` v1 / NORMAL_CALL, D1 ตรวจบริบท, W1 `NO_WARNINGS_EXPECTED` (ไม่เลือกหลักฐาน = SAFE, เลือก neutral evidence = REVIEW), D2 ข้อมูลนัดหมายสมมติที่ไม่อ่อนไหว, S1 จบสายหรือติดต่อกลับทางการ; critical rules = 0. กฎของ fixture นี้ implement แล้ว แต่ไม่ใช่การอนุมัติหรือ implement rubric ของ CC-N01/CC-N02 โดยอัตโนมัติ. ไม่เปลี่ยนแบบ target ทั้งสองให้กลับเป็นห้องสมุด.

[training-service.ts](../src/application/training-service.ts) เลือก variant ที่ Backend ด้วย injectable selector; ค่าเริ่มต้น `randomInt(2)`. 50/50 เป็นโอกาสต่อ start ใหม่ ไม่ใช่รับรองสัดส่วนตัวอย่างสั้น ๆ. owner/scenario/startId เดิมคืน session และ variant ที่บันทึกแล้ว ไม่สุ่มซ้ำ; concurrent insert ใช้ผู้ชนะที่ persisted. Browser และ AI ไม่มีสิทธิ์เลือก variant. ยังไม่มี selector จับคู่ PARCEL/BANK กับสี่ Story IDs.

**TARGET STORY FLOW != CURRENT GENERIC RUNTIME FLOW:** [scam-scenarios.ts](../src/fixtures/scam-scenarios.ts) สร้างแปด non-SMS scam templates ด้วย `contact → build_trust → request_action → user_verification → end_scenario` และ 4 checkpoints (`d1`, `w1`, `d2`, `s1`). การตรวจผู้ติดต่อ/หลักฐาน/คำขอ/ยุติและตรวจหรือรายงานเป็นกฎ deterministic ของ Backend. NORMAL_CALL เป็น fixture แยกที่ใช้ห้าชื่อ state และสี่ checkpoint เช่นกัน ไม่ได้สร้างจาก scam factory. SMS มี 6 states / 6 checkpoint definitions (เส้นทางตรง 5, optional อีก 1). Frame และ evidence screens ใน storyboard ไม่ใช่ state/หน้าจอที่ implement ครบแล้ว; ชื่อ state เป็น Demo model ไม่ใช่ชื่อที่ Proposal บังคับโดยตรง.

Critical Failure ต้องมาจาก explicit simulated action ที่ Backend validate; free text/AI candidate ไม่ให้คะแนน ไม่ finalize checkpoint และไม่เปลี่ยน state เอง. [tests/additional-scenarios.test.ts](../tests/additional-scenarios.test.ts) ครอบคลุม generic paths; การ map family ข้างต้นเป็นการเทียบความหมายกับโค้ด ไม่ใช่ผลทดลอง content parity.

**ข้อความเก่าที่พบในโค้ด:** description/characterRole ของ SCAM_CALL v1 ใน `scam-scenarios.ts` ยังกล่าวถึงการใช้ข้อความก่อนเปิดเสียง แม้ public catalog กำหนด `TEXT_VOICE` และ voice infrastructure มีแล้ว จึงไม่ใช้ข้อความเก่านี้สรุปว่าเสียงยังไม่ implement งาน documentation นี้ไม่แก้ published fixture; การทบทวนเนื้อหา/ออก version ใหม่ต้องเป็นงานแยก

**Infrastructure implemented, live verification แยกต่างหาก:** Call Center text, Voice UI/Azure STT-TTS adapter, authenticated WebSocket, HTTP/text fallback และ Mock/OpenAI/Groq adapters มีแล้ว. ตาม [รายงาน 2026-10-02](realtime-verification.md) Live Azure/Groq = NOT RUN (ไม่มี private credentials), current dedicated MySQL/Auth live/browser E2E = NOT RUN (ไม่มี test DB); OpenAI Luna ผล live ก่อนหน้าเป็น `credit_balance_exhausted` และยังรอเครดิต. ไม่แปลง skipped tests เป็นผ่าน ไม่อ้าง production-ready และไม่รัน live ใหม่ในงานเอกสารนี้. Voice readback/แก้ transcript/ยืนยัน action ด้วยเสียงตาม storyboard ยังเป็น target UX; runtime ปัจจุบันใช้เสียงเพื่อสนทนาและยังยืนยัน action ผ่าน controls เดิม.

**ขอบเขตอื่น:** Quiz ปัจจุบันจาก `quizBank` มี 210 ข้อ, 7 กลุ่ม × 30, สุ่ม 20 ด้วยสัดส่วน 3+3+3+3+3+3+2. หากใช้แผนคลัง 200 ข้อ (29+29+29+29+29+29+26) ต้องแยกเป็น PROPOSED / DOCUMENT TARGET ไม่ใช่ค่าของ runtime และไม่ใช่การอนุมัติให้ลดคลังปัจจุบัน; ดู [Quiz](quiz.md). Game 8 และ Knowledge Base 16 เป็น planned domains แยก ยังไม่ implement. ชุด storyboard ไม่ได้สร้างตาราง DB, migration หรือ dataset ใหม่.

## 19. Dataset Family Guidance

ทุก record มี datasetFamilyId; ไม่ใช่ row ID. ขั้นตอนเชิงแนวคิด: อนุมัติ family -> ตรวจ cross-category semantic overlap -> กำหนด leakage groups -> แบ่ง train/validation/test ตามกลุ่ม -> จึงเขียน/เพิ่มตัวอย่าง. ทุก persona/theme/paraphrase และ revisions ของ family เดียวต้องอยู่ split เดียว.

INV-01 ที่มี romance opening ต้องใช้ family/group เดียวกับ INV-01 ปกติ. หาก TASK-01 กับ INV-01 หรือ PHI-02 กับ REC-02 ใช้บทแม่เดียวกันจริง ต้องรวม leakage group แม้มีชื่อ family คนละชื่อ. Family uniqueness ใน content ไม่รับประกัน statistical independence.

Proposal เป้าหมาย 3,600 ตัวอย่าง (400/category) และ 80/10/10 เป็นเป้าปริมาณเดิม ไม่สามารถ random split rows เพื่อให้ตัวเลขสวย. มี 19 families แต่หลายหมวดมี 2 และ Task มี 1 จึงยังแยกทุกหมวดลงทั้งสามชุดแบบไม่รั่วไม่ได้. อย่างน้อย 3 independent families/category = 27 เป็นเพียง lower bound ถ้าต้องการทุกหมวดในทุก split; shared groups และขนาด test ที่มีความหมายอาจต้องมากกว่า. ไม่สร้าง families เทียมเพื่อเติมจำนวน.

ทางเลือกที่ต้อง review: เพิ่มเรื่องต่างจริงจากข่าวในหมวดบาง หรือกำหนด evaluation แบบ held-out families โดยยอมรับว่าบางหมวดไม่อยู่ครบทุก splitและรายงานข้อจำกัด. Normal controls อยู่ separate group และต้องมีตัวอย่างอิสระเพียงพอ ไม่เอา paraphrases ข้ามชุด ไม่รวม CC-N01/CC-N02 ใน 19 scam families หากอนาคตมี normal/scam classifier หรือ evaluation ต้องเก็บลิงก์ CC-01 ↔ CC-N01 และ CC-02 ↔ CC-N02 ไว้ชัดเจน และพิจารณา shared context/template ใน leakage grouping ไม่ถือว่าชื่อต่างกันแล้วเป็นอิสระ รอบนี้ไม่สร้างตัวอย่างฝึกหรือกำหนดการแบ่งชุด controls

**Rule-Based compatibility:** expectedSafeBehavior / potentialReviewBehavior / criticalCandidateBehavior เป็นแนวทางแยกพฤติกรรม ไม่คำนวณคะแนนเอง ไม่กำหนดสูตร/rule IDs ไม่ให้ Qwen ตัดสินผลลัพธ์. หลักฐาน observable, opportunities, omission และ ambiguity ต้องออกแบบใน phase ถัดไปหลัง review. จำนวน/ค่าฝึกและการเลือกโมเดลไม่เปลี่ยนในงานนี้.

## 20. Sources

ทุก URL เป็นหน้าข่าว/ความรู้ ไม่ใช่ URL โจมตี. accessDate: **2026-09-27**. บางแหล่งเป็นคำเตือนย้อนหลัง ใช้ยืนยันการมีอยู่ของกลไกเท่านั้น. วันที่ไม่ปรากฏชัดระบุว่าไม่ยืนยัน ไม่ใช้ crawl date เป็น publication date.

| ID | Source / date confidence | Evidence and limitation |
|---|---|---|
| N01 | [ตำรวจ สภ.หนองขาหย่าง][N01], 2026-06-30 ตามหน้าที่ค้น | อ้างตำรวจ/คดีและโอนเงินตรวจ; ตรวจผ่าน search excerpt |
| N02 | [ธนาคารแห่งประเทศไทย: ภัยทางการเงิน][N02], วารสาร 2022 | โทรขอข้อมูล/OTP และสลิปปลอม; pattern reference ย้อนหลัง |
| N03 | [MDES / AOC 1441][N03], ไม่ยืนยันวันเผยแพร่ | ลงทุนหุ้น/ถอน/ค่าธรรมเนียม; ข่าวเหตุจริงใช้สนับสนุนกลไกไม่คัดตัวตน |
| N04 | [ก.ล.ต. Scam Center][N04], ไม่ระบุวัน | โบนัสจากชวนสมาชิกและลงทุนปลอม; ไม่เหมารวม referral ที่ชอบด้วยกฎหมาย |
| N05 | [PRD เผยแพร่คำเตือนตำรวจเรื่อง Romance][N05], 2022-02-14 | ความสัมพันธ์ขอทรัพย์/แยก hybrid investment |
| N06 | [ETDA สถิติร้องเรียนออนไลน์ปี 2024][N06], รายงานเผยแพร่ 2025 | ไม่ส่ง/สินค้าไม่ตรง; ไม่อ้างว่าเป็นบทจำลองเดียวกัน |
| N07 | [Thai PBS Verify: โกดังพัสดุปลอม][N07], ไม่ยืนยันวัน | COD ที่ไม่ได้สั่ง; ไม่ให้โทษผู้รับที่ถูกกดดัน |
| N08 | [Thai PBS Verify อ้างเหตุสลิปปลอมร้านอาหาร][N08], 2026-07-14 | seller-targeted fake receipt; โครงเรื่องใหม่ไม่คัดขั้นตอนหลอกทั้งหมด |
| N09 | [BOT: ภัยออนไลน์][N09], ไม่ระบุวัน | credential phishing และการหลอกติดตั้งแอป |
| N10 | [Thai PBS Verify: งานเสริมสู่สูญเงิน][N10], ไม่ยืนยันวัน | ภารกิจ/จ่ายแรก/เติมเพิ่ม; ข้อมูลเหยื่อไม่นำมาใช้ |
| N11 | [BOT: กู้ออนไลน์ต้องรู้ทันโจร][N11], ไม่ระบุวัน | ค่ากู้ล่วงหน้าและข้ออ้างแก้ข้อมูล |
| N12 | [DSI: เครือข่ายแอปเงินกู้][N12], ข่าวย้อนหลัง วันในข้อความไม่ชัด | รายชื่อผู้ติดต่อและการข่มขู่; ไม่ยืนยันสินเชื่อทุกแบบเป็น fake app |
| N13 | [ThaiCERT: ระวังตกเป็นเหยื่อซ้ำสอง][N13], 2026-04-10 | recovery promises/fees; ไม่พิสูจน์ remote-access branch |
| N14 | [BOT พระสยาม ฉบับ 2/2022 PDF][N14] | fake complaint app + remote desktop; อ่านเนื้อหาด้วย PDF parser เพราะหน้าเว็บจำกัดขนาด; ไม่ยืนยัน recovery ทั้งลำดับ |
| N15 | [Thai PBS Verify อ้างกรมการจัดหางาน][N15], 2025-05-08 | recruitment fees/ข้อมูล; [หน้า DOE][DOE] อ่านได้เพียง indexed excerpt เพราะหน้าเต็มป้องกันการเข้าถึง |
| N16 | [Thai PBS อ้างตำรวจเตือนงานออนไลน์/บัญชีม้า][N16], ไม่ยืนยันวัน | หลอกสมัครงานใช้บัญชี; ไม่ใช้เป็นคำปรึกษากฎหมาย |
| N17 | [Anti-Fake News Center: Romance gift][N17], ไม่ยืนยันวัน | ของขวัญและค่าธรรมเนียมขนส่ง/ศุลกากรปลอม |

Primary local references:
- User-list SHA-256: `3bf2f4367485fba2f27b453a2fe3ee9dadbe1b1120ad35af1391e108bcb6c813`.
- Proposal SHA-256: `55b41b0a383348f30a905dcfbd3c41abdcf7ed77bee323ad8c1f2795f05f227b`.
- Current repository: `491a48bcaa15260eb3837a50ca46b15d24ac4488`, [scenario catalog](scenario-catalog.md), [architecture recheck](qwen-proposal-recheck.md).
- Full classification, merger/variant decisions, pairwise overlap evidence และคำตอบ Q1–Q12: [Deduplication Report](scenario-deduplication-report.md).

[N01]: https://nongkhayang.uthaithani.police.go.th/archives/10214
[N02]: https://www.bot.or.th/th/research-and-publications/articles-and-publications/bot-magazine-issues/Phrasiam-65-3/the-knowledge-65-3-4.html
[N03]: https://mdes.go.th/news/detail/9180-AOC-1441-เตือนภัย--โจรออนไลน์--หลอกลงทุนเทรดหุ้น---คืนเงินภาษี-พบสูญเงินกว่า-47-ล้านบาท
[N04]: https://www.sec.or.th/TH/Pages/SCAMCENTER-01-03.aspx
[N05]: https://www.prd.go.th/th/content/category/detail/id/33/iid/76152
[N06]: https://www.etda.or.th/th/pr-news/etda_stat_online_fraund.aspx?feed=590fb9ad-c550-4bc5-9a56-459ad4891d74
[N07]: https://www.thaipbs.or.th/verify/video/8945
[N08]: https://www.thaipbs.or.th/verify/shorts/14079
[N09]: https://www.bot.or.th/th/satang-story/fraud/online-fraud.html
[N10]: https://www.thaipbs.th/verify/article/content/1470
[N11]: https://www.bot.or.th/th/satang-story/fraud/fake-loan-apps.html
[N12]: https://www.dsi.go.th/th/Detail/b02b0d96e25a2a21d09f13e8cf9986fe
[N13]: https://www.thaicert.or.th/2026/04/10/เตือนภัย-ระวังตกเป็นเหย/
[N14]: https://www.bot.or.th/content/dam/bot/documents/th/research-and-publications-pdf/articles-and-publications/bot-magazine/botmag-2-65.pdf
[N15]: https://www.thaipbs.or.th/verify/article/content/1869
[DOE]: https://www.doe.go.th/prd/main/news/param/site/1/cat/7/sub/0/pull/detail/view/detail/object_id/69559
[N16]: https://www.thaipbs.or.th/now/content/633
[N17]: https://www.antifakenewscenter.com/คลังความรู้/เตือนภัย-romance-scam-หลอกรัก-ให้ลง-2/
