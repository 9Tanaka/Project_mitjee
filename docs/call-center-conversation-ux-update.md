# MITJEE — Call Center Conversation UX: Latest Update

อัปเดต: 26 ตุลาคม 2026 (Asia/Bangkok)

## 1. สถานะและขอบเขต

- Repository: `D:/Projects/Project_mitjee`
- Branch: `feat/rule-based-evaluation`
- Current HEAD: `17a4ee430e6f6e645b6e2e41bec44b7f167d3d53`
- สถานะ: **IMPLEMENTED + VERIFIED LOCALLY — UNCOMMITTED**
- HEAD ข้างต้นเป็น checkpoint ของ Post-Decision Guidance ก่อนงาน UX รอบนี้ การเปลี่ยนแปลงที่สรุปในเอกสารนี้ยังอยู่ใน working tree
- ยังไม่ได้ commit, push หรือ deploy งาน UX รอบนี้

งานครอบคลุมเฉพาะ public `call-center` ที่ใช้งานอยู่ปัจจุบัน:

| Story | Template | Version | Variant |
|---|---|---:|---|
| CC-01 | `call-center-parcel` | 6 | `SCAM_CALL` |
| CC-02 | `call-center-bank` | 6 | `SCAM_CALL` |
| CC-N01 | `call-center-parcel` | 6 | `NORMAL_CALL` |
| CC-N02 | `call-center-bank` | 6 | `NORMAL_CALL` |

รวม 10 D checkpoint definitions, 46 choices และ 2 critical rules เดิม ไม่มีการขยายอีก 8 หมวดสถานการณ์หรือแก้ 21-story roadmap

## 2. ปัญหาที่แก้แล้ว

### 2.1 เสียงผู้โทรมีตัวควบคุมหลายจุด

หน้าเดิมเริ่มจากการให้ผู้เรียนเปิดเสียงเอง และแสดง checkbox, replay และ native audio player ทำให้การใช้งานไม่ต่อเนื่องเหมือนสายสนทนา

พฤติกรรมใหม่ของ public Call Center:

- หลังรับสาย ข้อความผู้โทรที่เพิ่ง commit จะขอเสียงและเล่นอัตโนมัติเมื่อ browser policy อนุญาต
- ใช้ตัวควบคุมระดับสาย: ปิด/เปิดเสียงผู้โทร และฟังข้อความผู้โทรล่าสุดซ้ำ
- ไม่แสดง native audio player ใต้ข้อความ ใช้ audio element ที่ซ่อนอยู่
- หาก autoplay ถูกบล็อก แสดงปุ่มเดียวว่า **“แตะเพื่อเปิดเสียงสนทนา”**
- หาก TTS, network หรือ audio playback ล้มเหลว ข้อความยังอ่านได้และเล่นต่อได้
- ใช้นโยบาย **latest-turn cancellation**: เมื่อมีเสียงผู้โทรใหม่ ให้หยุด/ยกเลิกเสียงก่อนหน้า ป้องกันการเล่นซ้อนและผล TTS เก่ามาแทนเสียงปัจจุบัน
- ไม่เล่นข้อความผู้โทรเก่าอัตโนมัติหลัง refresh/refetch
- VoiceControls อยู่ต่อเนื่องระหว่างสลับแอปในโทรศัพท์ และถูกถอดออกเมื่อจบรอบ รวมถึง Critical Failure
- ไมโครโฟนยังต้องเริ่มจากการกดของผู้เรียน ไม่มีการเปิดบันทึกเสียงอัตโนมัติ

### 2.2 ตัวเลือกที่ commit แล้วหายไปจากลำดับบทสนทนา

หน้าเดิมแสดงเฉพาะ `session.messages` จึงไม่เห็นว่าตัวเลือกที่ Backend ยืนยันแล้วแทนคำพูดหรือการกระทำใดของผู้เรียน

เพิ่ม read-only projection จากหลักฐานเดิม:

```text
Backend-authored choice/action mapping
  + committed action / finalized opportunity
  + committed dialogue receipts
  → public phone.transcript
  → learner/caller transcript in chronological order
```

ข้อกำหนดที่ implementation รักษาไว้:

- ไม่แสดงข้อความว่าผู้เรียนทำสำเร็จก่อน Backend ยืนยัน
- ใช้ committed revision จัดลำดับ ไม่อาศัย timestamp เพียงอย่างเดียว
- ใช้ opaque stable IDs ป้องกันข้อความซ้ำจาก rerender, refresh, replay และ retry
- ไม่เพิ่ม persistence เพื่อเก็บข้อความสำหรับแสดงผลซ้ำกับ Action เดิม
- ไม่ให้ AI สร้างหรือแปลความหมายของตัวเลือก
- รองรับ `NO_EVENT` สำหรับ phone controls/app checks ที่บันทึกสำเร็จแต่ไม่ finalize checkpoint ตาม contract เดิม โดยไม่ถือว่าเป็น accepted decision score
- `checked` แสดงการตรวจข้อมูลเฉพาะเมื่อมีหลักฐานการตรวจผ่านแอปที่กำหนดไว้จริง

### 2.3 หน้าจบไม่แยก Critical Failure ให้ชัดเจน

หน้าเดิมใช้การแสดงผลจบสายทั่วไปและซ่อน transcript ทำให้ผู้เรียนไม่เห็นจุดที่ยืนยันการกระทำสำคัญ

เมื่อมี authoritative critical result/event และ linked accepted confirmed simulated action ที่ตรงกัน:

1. แสดงการกระทำที่ผู้เรียนยืนยันใน transcript
2. หยุด active call presentation และยกเลิกเสียงที่ค้างอยู่
3. ไม่ร้องขอบทพูดผู้โทรต่อ
4. แสดง **“คุณถูกหลอกในสถานการณ์จำลอง”** พร้อมคำอธิบายเฉพาะการกระทำ
5. ระบุว่าเป็นแบบฝึก ไม่มีธุรกรรมหรือการเข้าถึงบัญชีจริง
6. ย้าย focus ไปยัง notification และมีปุ่ม **“ดูผลและวิธีรับมือ”**
7. ใช้ Result / Tutorial / Recovery เดิม

ตัวเลือก REVIEW ไม่ทำให้จบเป็น Critical Failure สายปกติทั้งสองเรื่องไม่มี scam-failure notification

## 3. Choice → Learner Turn

ข้อความทั้งหมดเป็น authored deterministic copy ใน `src/application/call-conversation-presentation.ts` ผูกกับ choice/action identifier ของ template ปัจจุบัน

| Choice / Action | ความหมายของข้อความที่แสดง | ข้อจำกัด |
|---|---|---|
| `caution` | ขอฟังรายละเอียดต่อ โดยยังไม่ให้ข้อมูลเพิ่มเติม | ไม่กล่าวว่าได้ตรวจสอบแล้ว |
| `trust` | เชื่อคำกล่าวอ้าง โดยยังไม่ได้ตรวจสอบผ่านช่องทางอื่น | ยังคง REVIEW และสนทนาต่อได้ |
| `checked` | ตรวจคำสั่งซื้อหรือเปรียบเทียบรายการในแอปจำลองของตนแล้ว | ต้องมีหลักฐาน check เดิม ไม่กล่าวว่าโทรยืนยันกับหน่วยงานแล้ว |
| `callback` | ขอจบสายและจะติดต่อช่องทางที่มีอยู่เอง | เป็นความตั้งใจ ไม่ใช่ verification success |
| `end` | ขอจบการสนทนา | ใช้ lifecycle/outcome เดิม |
| `refuse` | ปฏิเสธการโอนเงินหรือบอกรหัสตามบริบท | ไม่สร้าง Critical Failure |
| `confirm` | ยืนยันช่วงจัดส่งจำลองตามข้อมูลเรื่องปัจจุบัน | ใช้กับสายจัดส่งปกติ |
| `reschedule` | ขอเปลี่ยนช่วงจัดส่ง | ไม่อ้างว่ามีช่วงใหม่ที่ถูกยืนยันแล้ว |
| `limit` | ให้เฉพาะข้อมูลจำเป็นต่อการจัดส่ง | ไม่ใส่คำกล่าวหาว่าเป็นสายหลอก |
| `acknowledge` | รับทราบข้อมูลรายการ | ใช้บริบทสายแจ้งข้อมูลปกติ |
| Confirm simulated transfer | ยืนยันโอนเงินจำลอง 9,300 บาทตามคำขอ | ต้องมี authoritative critical evidence และ explicit confirmation |
| Confirm simulated OTP disclosure | ยืนยันบอกรหัส OTP จำลองแก่ผู้โทร | ไม่ใส่ค่ารหัสจริงลงใน authored action text |

## 4. Public Contract ที่เพิ่ม

เพิ่ม optional presentation fields ภายใน `phone`:

```typescript
transcript?: {
  id: string;
  role: "user" | "character";
  text: string;
  kind: "DIALOGUE" | "COMMITTED_ACTION";
}[];

criticalEnding?: {
  title: string;
  description: string;
  actionText: string;
};
```

- `session.messages` ยังคง contract เดิมสำหรับ dialogue/audio
- Frontend ใช้ public DTO เท่านั้น ไม่อ่าน fingerprint, private rule configuration หรือ authored fixture internals
- Projection ใหม่ผูกกับ exact v6 template/variant ทั้งสี่รายการ Historical versions ที่ไม่มี mapping ใช้ transcript/result behavior เดิมเป็น fallback

## 5. Authority และ Evaluation ที่ไม่เปลี่ยน

| ส่วน | Authority / พฤติกรรม |
|---|---|
| LLM / AI dialogue | Non-authoritative |
| STT / TTS | Non-authoritative |
| State / allowed transitions | Backend authoritative |
| Decision Rule | Backend authoritative; `DECISION_RULES_V1` เดิม |
| Critical Event | Backend validation + explicit simulated action + fresh confirmation |
| Post-decision recovery trigger | Deterministic ตามหลักฐานเดิม |
| Tutorial / Recovery content | Static authored content |
| `trainingScore` | `null` |

ยังคง outcomes `PASSED`, `NEEDS_PRACTICE`, `CRITICAL_FAILURE`, `UNASSESSED` ตามเดิม และ ABANDONED/EXPIRED ไม่มี official TrainingResult

ไม่มีการแก้ Core, State Machine semantics, EventValidator, critical rules, PostgreSQL persistence architecture, Prisma schema/migrations, CAS/revision, ownership, expiry, replay/idempotency, rollback หรือ published templates

## 6. ผล Verification

### Automated tests และ build

| Gate | ผลล่าสุด |
|---|---|
| Tests ใหม่: committed-action projection | 65 passed |
| Tests ใหม่: caller audio | 11 passed |
| Tests ใหม่: conversation UI | 9 passed |
| Full regression | 1,176 passed, 0 failed, 69 skipped |
| Existing frontend suite | 109 passed |
| TypeScript typecheck | PASS |
| Prisma generate | PASS ผ่าน build script |
| Prisma validate | PASS |
| Production build | PASS |
| Client bundle audit | PASS; 68 JavaScript artifacts |
| `git diff --check` | PASS |

Tests ใหม่ 85 กรณีและ frontend suite เป็นส่วนหนึ่งของ full regression อยู่แล้ว ห้ามบวกจำนวนเหล่านี้ซ้ำเพื่ออ้างจำนวนรวม

คำสั่ง full regression รอบสุดท้าย:

```sh
npm test -- --maxWorkers=2 --reporter=json --outputFile=test-results/call-conversation-full-final.json
```

Gate อื่นที่รันแล้ว:

```sh
npm run typecheck
npm run test:frontend
npm run prisma:validate
npm run build
npm run audit:client
git diff --check
```

รายงานทดสอบใน `test-results/` เป็น ignored local artifacts ไม่ใช่ไฟล์ที่ต้อง commit

### Browser verification

```sh
node scripts/verify-call-conversation-browser.mjs http://localhost:3000
```

ผล: **27/27 passed**, browser errors 0

| Story | เส้นทาง | จำนวนขนาดจอ |
|---|---|---:|
| CC-01 | caution → hang up | 3 |
| CC-01 | trust → refuse | 3 |
| CC-01 | caution → refuse | 3 |
| CC-01 | confirmed simulated transfer | 3 |
| CC-02 | trust → refuse | 3 |
| CC-02 | caution → refuse | 3 |
| CC-02 | confirmed simulated OTP disclosure | 3 |
| CC-N01 | normal delivery confirmation | 3 |
| CC-N02 | normal transaction acknowledgment | 3 |

ขนาดจอ: 375, 768 และ 1440px

ตรวจรวมถึง caller-first opening, ไม่มี visible native audio player, TTS failure แบบไม่ขวางการเล่น, muted transcript, contextual choices, chronological learner turns, refresh ไม่สร้างรายการซ้ำหรือเล่นเสียงเก่า, critical focus/ending, Result/Tutorial/Recovery และลิงก์ฝึกใหม่

หลักฐานอยู่ใน `frontend-artifacts/call-conversation/verification.json` และ screenshots ในโฟลเดอร์เดียวกัน เป็น ignored artifacts

**ขอบเขตหลักฐาน:** ใช้ production Next UI จริงร่วมกับ API bridge ไปยัง application/Core จริง, in-memory repository, synthetic identity, Mock dialogue และ synthetic WAV จึงไม่ใช่หลักฐาน live Auth/PostgreSQL/Groq/STT/TTS end-to-end และไม่ใช่การทดสอบไมโครโฟนจริง

## 7. ผลตรวจจาก Manual Playtest ล่าสุด: พิมพ์ OTP แต่ไม่มี Failure Banner

> บันทึกในหัวข้อนี้เป็นผลก่อนงาน OTP refinement รอบถัดมา เส้นทางยืนยันหลายปุ่มและข้อจำกัดเรื่อง OTP discoverability/AI acknowledgement ได้รับการปรับใน [call-center-otp-decision-ux.md](call-center-otp-decision-ux.md) แล้ว ให้ใช้เอกสารนั้นสำหรับพฤติกรรมปัจจุบัน ส่วนหลักการที่ free text ไม่เป็น Critical authority และการไม่เปิด opportunity ที่ finalize แล้ว ยังคงเดิม

### สิ่งที่ตรวจพบจริง

ผู้เรียนพิมพ์ข้อความที่ดูเหมือนรหัสในแชต และ AI ตอบเหมือนได้รับรหัสแล้ว จากนั้นผู้เรียนเลือก `trust`

การอ่านข้อมูลรอบล่าสุดจาก local playtest database แบบ read-only พบว่า:

- Session ยังเป็น `ACTIVE`, state เป็น `PLAYER_DECISION`
- มี accepted `trust` decisions ที่ CONTEXT_CLAIM, PRESSURE และ MAIN_REQUEST
- ไม่มี `SIMULATED_ACTION` สำหรับยืนยันการบอกรหัส
- ไม่มี Critical Event `DISCLOSE_OTP`
- ยังไม่มี TrainingResult และไม่มี `criticalEnding`

ไม่ได้บังคับจบรอบหรือแก้ข้อมูลรอบของผู้เรียนระหว่างตรวจสอบ

### คำอธิบายตาม contract ปัจจุบัน

```text
พิมพ์/พูดข้อความที่ดูเหมือน OTP
  → free-text dialogue
  → ไม่ยืนยัน Critical Event

เลือก trust
  → REVIEW
  → ไม่เท่ากับยืนยันบอกรหัส

เปิดแอปข้อความ → อ่านรหัสจำลอง → เตรียมยืนยัน
  → ยังไม่ใช่ Critical Failure

ยืนยันการบอกรหัสจำลอง + fresh confirmation + backend validation
  → SHARE_SIMULATED_OTP / DISCLOSE_OTP
  → CRITICAL_FAILURE
  → critical ending + Result / Recovery
```

AI ที่ตอบว่าได้รับรหัสแล้วไม่มี authority ในการรับรองว่า explicit simulator action เกิดขึ้นแล้ว การทำให้ free text ตัดสินแพ้โดยตรงจะขัดกับ core invariant เดิม จึงไม่ได้เปลี่ยนกฎดังกล่าว

### ผล reproduce

ทดสอบด้วย application/Core แบบ in-memory:

| กรณี | ผล |
|---|---|
| พิมพ์รหัส → trust → วางสาย | `NEEDS_PRACTICE`, ไม่มี Critical Event |
| Explicit confirmed simulated OTP action | `CRITICAL_FAILURE`, มี critical-ending presentation |
| Conversation UI recheck | 9/9 passed |

รายงาน UI recheck: `test-results/call-conversation-ui-recheck.json`

### วิธีทดสอบ OTP Critical Failure ผ่าน UI

เริ่มรอบใหม่ที่มีคำขอ OTP แล้วทำก่อนเลือก `trust` ที่ MAIN_REQUEST:

1. รอผู้โทรขอรหัสและ Backend เปิดแอปข้อความ
2. เปิด **“ข้อความ”** ในโทรศัพท์จำลอง
3. กด **“อ่านรหัสในข้อความจำลอง”**
4. กด **“เตรียมยืนยันการบอกรหัสจำลอง”**
5. กด **“ยืนยันการบอกรหัสจำลองแก่ผู้โทร”**
6. ยืนยันด้วย **“ยืนยันการกระทำจำลอง”**
7. ต้องเห็น **“คุณถูกหลอกในสถานการณ์จำลอง”** และ **“ดูผลและวิธีรับมือ”**

เมื่อเลือก `trust` ที่ MAIN_REQUEST และย้ายไป PLAYER_DECISION แล้ว จะไม่มี Messages/OTP confirmation path ของ MAIN_REQUEST ให้ทำต่อใน state นั้น การแก้เส้นทางนี้เป็นงาน State/Template semantics แยกต่างหาก ไม่ได้ทำใน UX phase นี้

### UX limitation ที่ยังไม่แก้

**ยังมีความคลุมเครือระหว่างคำตอบของตัวละคร AI กับการยืนยันการกระทำของ Backend** โดยเฉพาะเมื่อ AI ตอบเหมือนได้รับรหัสแล้ว แต่ผู้เรียนยังไม่ได้ยืนยันผ่านตัวควบคุมจำลอง

ผลตรวจล่าสุดเป็นการตรวจสอบและ reproduce เท่านั้น ยังไม่ได้เพิ่มคำชี้แจงเฉพาะจุดหรือปรับคำตอบ AI เพื่อแก้ความคลุมเครือนี้ ห้ามอ้างว่าประเด็นนี้ถูกแก้แล้ว

หากจะปรับต่อ ต้องรักษา free-text non-authority และไม่ให้ถ้อยคำของ AI/ค่า confidence กลายเป็น Critical Failure authority

## 8. ไฟล์ของงาน UX รอบนี้

### Runtime / presentation

- `src/application/call-conversation-presentation.ts` — เพิ่มใหม่
- `src/application/contracts.ts`
- `src/application/projections.ts`
- `src/public-api/phone.ts`
- `src/frontend/phone-simulator.tsx`
- `src/frontend/voice.tsx`
- `src/app/phone-simulator.css`

### Verification

- `tests/call-conversation-presentation.test.ts` — เพิ่มใหม่
- `tests/call-conversation.ui.test.tsx` — เพิ่มใหม่
- `tests/call-audio.ui.test.tsx` — เพิ่มใหม่
- `scripts/verify-call-conversation-browser.mjs` — เพิ่มใหม่

### Handoff documentation

- `docs/call-center-conversation-ux-update.md` — เอกสารนี้

## 9. Git และข้อจำกัดการส่งต่อ

- งาน UX และเอกสารนี้ยังไม่ได้ stage/commit
- README/docs เดิม 27 ไฟล์มีการแก้ค้างอยู่ก่อนงานนี้ ไม่ใช่ส่วนหนึ่งของ UX change set
- ห้ามรวม unrelated README/docs edits, `.env*`, credentials, generated Prisma client, build output หรือ ignored browser artifacts เข้ากับ commit ของ feature โดยอัตโนมัติ
- งานนี้ไม่ได้เปลี่ยน private environment, AI/speech provider selection หรือ production deployment
- Autoplay ยังขึ้นกับ browser policy โดยมี gesture fallback ให้ใช้งาน
- Historical templates ไม่มีการแก้ไข และ presentation mapping ใหม่จำกัดอยู่ที่ current v6 stories

**Implementation status:** Call Center conversation UX refinement verified locally.

**Open observation:** AI dialogue may imply receipt of a secret while no explicit simulated action has been confirmed; clarification UX remains a separate unresolved follow-up.
