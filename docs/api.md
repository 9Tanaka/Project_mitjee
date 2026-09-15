# HTTP API and Authentication Boundary

STATUS: PLANNED / NOT IMPLEMENTED

[กลับ README](../README.md) · [Architecture](architecture.md) · [Security](security.md)

เอกสารนี้เป็นแนวทางสำหรับ phase ถัดไปเท่านั้น
ยังไม่มี HTTP routes, server, middleware, Auth.js, session authentication หรือ API authorization
method ของ Core/Orchestrator เป็น TypeScript library calls ไม่ใช่ endpoints ที่ใช้งานผ่านเครือข่ายแล้ว
Documentation milestone นี้ไม่สร้าง route/code หรือเพิ่ม feature

## Planned architecture

```text
Client → HTTP API → Authentication → DTO validation / authorization
       → Application / TrainingCore → TrainingRepository
```

boundary ในอนาคตต้องได้ ownerId จาก identity ที่ Backend ตรวจสอบแล้ว
ไม่เชื่อ ownerId ที่ผู้ใช้ส่งใน payload โดยตรง และต้องใช้ Core ตรวจ session ownership ต่อ
ข้อมูลที่ส่งกลับต้องเป็น public projection ไม่เปิด Template พร้อมเฉลย, internal rules หรือ sensitive context
การเปลี่ยน State/คะแนน/Critical Failure ยังต้องผ่าน Backend domain rules เดิม

## Proposed endpoints — ALL NOT IMPLEMENTED

| Method / path | แนวทางที่อาจใช้ |
|---|---|
| GET /api/scenarios | รายการ scenario แบบ public projection |
| GET /api/scenarios/:id | รายละเอียดก่อนเริ่มฝึก ไม่เปิด answer keys |
| POST /api/scenarios/:id/start | สร้าง Session ภายใต้ผู้ใช้ที่ยืนยันตัวตนแล้ว |
| GET /api/training/:sessionId | Resume / session projection |
| POST /api/training/:sessionId/message | ส่งข้อความเข้า Dialogue Orchestrator |
| POST /api/training/:sessionId/action | explicit command เข้า Core |
| POST /api/training/:sessionId/quit | ขอ QUIT_SESSION |
| GET /api/training/:sessionId/result | อ่าน Official Result หากมี |

เส้นทางเหล่านี้เป็น proposed design ไม่ใช่ API contract ที่ publish แล้ว
framework, DTOs, status-code mapping, Auth.js configuration, CSRF/CORS, rate limits,
idempotency transport headers และวิธีเลือก Template Version ผ่าน API ยังไม่ได้กำหนดรายละเอียดสุดท้าย
ต้องออกแบบและ review ก่อนเริ่ม implement โดยไม่ย้าย business rules ไปใน HTTP handlers

ไม่มีคำสั่ง start web server ใน package.json และยังไม่มี Frontend UI ให้เรียก API เหล่านี้
