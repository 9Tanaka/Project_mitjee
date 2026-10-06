// Real browser → protected HTTP → remote MySQL/Groq. No route interception/mock auth.
// Uses a fresh synthetic account, leaves its history intact, never prints credentials/cookies/raw provider content.
import { chromium, expect as baseExpect } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { register } from "tsx/esm/api";
register();
const expect = baseExpect.configure({ timeout: 60000 });
const storyFlag = process.argv.indexOf("--story");
const expectedStory = storyFlag >= 0 ? process.argv[storyFlag + 1] : null;
assert.ok(expectedStory === null || ["CC-01", "CC-02", "CC-N01", "CC-N02"].includes(expectedStory), "INVALID_EXPECTED_STORY");
const criticalPath = process.argv.includes("--critical");
assert.ok(!criticalPath || ["CC-01", "CC-02"].includes(expectedStory), "CRITICAL_STORY_REQUIRED");
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const origin = process.argv.slice(2).find(value => value.startsWith("https://")) ?? "https://mitjee-ui-preview-git-feat-rule-based-895992-9tanakas-projects.vercel.app";
assert.equal(new URL(origin).origin, origin, "PREVIEW_ORIGIN_ONLY");
assert.equal(new URL(origin).hostname, "mitjee-ui-preview-git-feat-rule-based-895992-9tanakas-projects.vercel.app", "APPROVED_PREVIEW_ONLY");
const report = { status: "FAILED", scope: "Real Preview browser/Auth.js/MySQL/Groq; no intercepted API", origin,
  stages: [], requests: [], sessionId: null, receipts: [], result: null, browserErrorCount: 0, failureStage: null, failureCategory: null };
const output = `frontend-artifacts/part3-preview/${expectedStory ? expectedStory + (criticalPath ? '-critical' : '-safe') : process.argv.includes('--start-only') ? 'timing' : 'smoke'}`;
function assertConcealed(payload) {
  assert.ok(!/CC-(?:01|02|N01|N02)|SCAM_CALL|NORMAL_CALL/.test(JSON.stringify(payload)), "PUBLIC_STORY_LEAK");
}
let stage = "PUBLIC_ACCESS", check = "public-page", browser, database, page, context;
try {
  browser = await chromium.launch();
  context = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  context.setDefaultTimeout(60000);
  page = await context.newPage();
  page.on("pageerror", () => report.browserErrorCount++);
  page.on("response", response => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith("/api/")) {
      const headers = response.headers(), category = headers["x-mitjee-failure-category"], failureStage = headers["x-mitjee-failure-stage"];
      report.requests.push({ path: path.startsWith("/api/training/") ? path.replace(/\/api\/training\/[^/]+/, "/api/training/:session") : path, method: response.request().method(), status: response.status(),
        ...(category && ["DATABASE_TRANSACTION", "DATABASE_CONNECTION", "DATABASE_UNIQUE", "DATABASE_FOREIGN_KEY", "TEMPLATE_IMMUTABILITY", "TEMPLATE_VALIDATION", "SCHEMA_VALIDATION", "SESSION_NOT_FOUND", "DOMAIN_FAILURE", "UNKNOWN_INTERNAL"].includes(category) ? { category } : {}),
        ...(failureStage && ["AUTH", "INPUT", "INITIALIZATION", "APPLICATION", "OUTPUT"].includes(failureStage) ? { failureStage } : {}) });
    }
  });
  const navigation = await page.goto("/register");
  assert.equal(new URL(page.url()).origin, origin, "PREVIEW_PROTECTION_REDIRECT"); assert.equal(navigation.status(), 200, "PREVIEW_ROUTE_UNAVAILABLE");
  await expect(page.getByRole("button", { name: "สร้างบัญชี", exact: true })).toBeVisible(); report.stages.push(stage);
  stage = "REGISTER";
  const email = `call-part3-${randomUUID()}@example.test`, password = randomBytes(24).toString("base64url");
  await page.getByLabel("อีเมล", { exact: true }).fill(email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.getByLabel("ยืนยันรหัสผ่าน", { exact: true }).fill(password);
  const registration = page.waitForResponse(r => new URL(r.url()).pathname === "/api/auth/register" && r.request().method() === "POST");
  await page.getByRole("button", { name: "สร้างบัญชี", exact: true }).click();
  assert.equal((await registration).status(), 201, "REGISTER_HTTP_FAILURE");
  await expect(page).toHaveURL(/\/login\?registered=1$/); report.stages.push(stage);
  stage = "LOGIN";
  check = "login-navigation";
  await page.getByLabel("อีเมล", { exact: true }).fill(email); await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page).toHaveURL(origin + "/scenarios", { timeout: 60000 });
  check = "verified-session";
  const auth = await context.request.get("/api/auth/session");
  const ownerId = (await auth.json()).user?.id; assert.ok(ownerId, "VERIFIED_SESSION_MISSING");
  if (process.argv.includes("--start-only")) {
    // Isolate start/replay on the real authenticated API; no catalog interception or mock auth.
    report.scope = "Real Preview registration/Auth.js/start/replay; no AI request";
    report.stages.push("LOGIN"); stage = "START_API_DIAGNOSTIC"; check = "authenticated-start-replay";
    for (let i = 0; i < 2; i++) {
      const input = { startId: randomUUID(), expectedRevision: 0 };
      for (const expected of [201, 200]) {
        const startedAt = Date.now();
        const response = await context.request.post("/api/scenarios/call-center/start", { data: input, headers: { Origin: origin }, timeout: 60000 });
        const headers = response.headers(), category = headers["x-mitjee-failure-category"];
        report.requests.push({ path: "/api/scenarios/call-center/start", method: "POST", status: response.status(), ms: Date.now() - startedAt,
          ...(category && ["DATABASE_TRANSACTION", "DATABASE_CONNECTION", "DATABASE_UNIQUE", "DATABASE_FOREIGN_KEY", "TEMPLATE_IMMUTABILITY", "TEMPLATE_VALIDATION", "SCHEMA_VALIDATION", "DOMAIN_FAILURE", "UNKNOWN_INTERNAL"].includes(category) ? { category } : {}) });
        assert.equal(response.status(), expected, "START_HTTP_FAILURE");
        const data = (await response.json()).data;
        assert.equal(data.duplicate, expected === 200); assert.equal(data.session.phone.state, "INCOMING_CALL");
        assert.deepEqual(data.session.messages, []);
        if (expected === 201) {
          const resumeAt = Date.now(); const resumed = await context.request.get(`/api/training/${data.session.sessionId}`);
          report.requests.push({ path: "/api/training/:session", method: "GET", status: resumed.status(), ms: Date.now() - resumeAt });
          assert.equal(resumed.status(), 200); assert.equal((await resumed.json()).data.sessionId, data.session.sessionId);
        }
      }
    }
    report.stages.push(stage); report.status = "PASSED";
  } else {
  check = "catalog-after-refresh";
  await page.reload(); await expect(page.getByRole("heading", { name: "ฝึกรับสาย Call Center", exact: true })).toBeVisible({ timeout: 60000 }); report.stages.push(stage);
  stage = "CATALOG_DETAIL_PREPARE";
  check = "detail-navigation";
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "ฝึกรับสาย Call Center", exact: true }) });
  await card.getByRole("link", { name: "ดูรายละเอียด" }).click(); await expect(page).toHaveURL(origin + "/scenarios/call-center");
  await page.getByRole("link", { name: "เริ่มจำลองสถานการณ์", exact: true }).click();
  check = "prepare-disabled-until-acknowledged";
  await expect(page.getByRole("button", { name: "เริ่มฝึกสถานการณ์", exact: true })).toBeDisabled();
  const startResponse = page.waitForResponse(r => new URL(r.url()).pathname === "/api/scenarios/call-center/start" && r.request().method() === "POST");
  await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "เริ่มฝึกสถานการณ์", exact: true }).click();
  check = "start-training-http";
  assert.equal((await startResponse).status(), 201, "START_HTTP_FAILURE");
  check = "start-training-navigation";
  await expect(page).toHaveURL(/\/training\/[a-f0-9]+$/);
  const sessionId = new URL(page.url()).pathname.split("/").at(-1); report.sessionId = sessionId;
  await expect(page.getByRole("button", { name: "รับสาย", exact: true })).toBeVisible(); report.stages.push(stage);
  stage = "ANSWER_PENDING_AUTOMATIC_OPENING";
  check = "answer-pending-and-caller-opening";
  const answer = page.waitForResponse(r => new URL(r.url()).pathname.endsWith("/action") && r.request().method() === "POST");
  const opening = page.waitForResponse(r => new URL(r.url()).pathname.endsWith("/opening") && r.request().method() === "POST");
  await page.getByRole("button", { name: "รับสาย", exact: true }).click();
  const answerResponse = await answer; assert.equal(answerResponse.status(), 200);
  const answered = (await answerResponse.json()).data.session;
  assert.equal(answered.phone.state, "CALL_CONNECTED"); assert.equal(answered.phone.openingStatus, "PENDING"); assert.deepEqual(answered.messages, []);
  await expect(page.getByText("เชื่อมต่อสายแล้ว กำลังรอบทพูดจากผู้โทร", { exact: true })).toBeVisible();
  await mkdir("frontend-artifacts/part2-preview", { recursive: true });
  await page.screenshot({ path: "frontend-artifacts/part2-preview/connected-pending.png", fullPage: true });
  assert.equal((await opening).status(), 200); await expect(page.getByLabel("ตอบผู้โทรด้วยข้อความ")).toBeEnabled();
  const ready = await context.request.get(`/api/training/${sessionId}`); const initial = (await ready.json()).data;
  assertConcealed(initial); assertConcealed(page.url()); assertConcealed(await page.locator("main").innerText());
  assert.deepEqual(initial.messages.map(m => m.role), ["character"]); report.stages.push(stage);
  stage = "LIVE_TEXT_AND_CONTEXTUAL_ACTIONS";
  check = "live-message-and-contextual-exit";
  if (process.argv.includes("--paced")) await new Promise(r => setTimeout(r, 30000));
  const message = page.waitForResponse(r => new URL(r.url()).pathname.endsWith("/message") && r.request().method() === "POST");
  await page.getByLabel("ตอบผู้โทรด้วยข้อความ").fill("ขอชื่อและข้อมูลอ้างอิงก่อนครับ ผมจะตรวจสอบผ่านช่องทางที่มีอยู่เอง");
  await page.getByRole("button", { name: "ส่งข้อความ", exact: true }).click();
  const messageResponse = await message; assert.equal(messageResponse.status(), 200);
  const replied = (await messageResponse.json()).data;
  assertConcealed(replied);
  assert.ok(replied.turn.characterMessage.trim()); assert.equal(replied.session.phone.state, initial.phone.state);
  assert.deepEqual(replied.session.availableActions, initial.availableActions);
  assert.equal(replied.session.status, "ACTIVE");
  if (expectedStory) {
    let current = replied.session;
    let lastCallerAt = Date.now();
    async function command(label, choice) {
      const action = current.availableActions.find(a => a.label === label); assert.ok(action, "REQUIRED_STORY_ACTION_MISSING");
      if (process.argv.includes("--paced") && ["ดำเนินบทสนทนาต่อ", "ฟังคำขอถัดไป", "ฟังคำขอจากผู้โทร"].includes(label)) {
        await new Promise(r => setTimeout(r, Math.max(0, 30000 - (Date.now() - lastCallerAt))));
      }
      const toggle = page.getByRole("button", { name: "ตัวเลือกขณะนี้", exact: true });
      if (current.phone.activeApp === "CALL" && await toggle.isVisible()) {
        await toggle.click();
      }
      const actionResponse = page.waitForResponse(r => new URL(r.url()).pathname.endsWith("/action") && r.request().method() === "POST");
      if (choice) {
        await page.getByRole("radio", { name: choice, exact: true }).check();
        await page.getByRole("button", { name: "ยืนยันคำตอบ", exact: true }).click();
      } else if (action.input === "CONFIRM") {
        await page.getByRole("button", { name: action.label, exact: true }).click();
        await page.getByRole("button", { name: "ยืนยันการกระทำจำลอง", exact: true }).click();
      } else await page.getByRole("button", { name: label, exact: true }).click();
      const response = await actionResponse; assert.equal(response.status(), 200, "STORY_ACTION_FAILED");
      current = (await response.json()).data.session;
      if (current.status === "ACTIVE") { assertConcealed(current); assertConcealed(await page.locator("main").innerText()); }
      await expect(page.locator(".phone-training")).toHaveAttribute("data-call-state", current.phone.state);
      if (current.phone.openingStatus === "PENDING" && current.phone.callStatus === "CONNECTED") {
        await expect(page.locator(".phone-training")).toHaveAttribute("data-caller-status", "READY");
        const resumed = await context.request.get(`/api/training/${sessionId}`); assert.equal(resumed.status(), 200);
        current = (await resumed.json()).data; lastCallerAt = Date.now();
      }
    }
    await command("ดำเนินบทสนทนาต่อ"); await command("ดำเนินบทสนทนาต่อ");
    const parcel = ["CC-01", "CC-N01"].includes(expectedStory), normal = expectedStory.startsWith("CC-N");
    if (normal) {
      await command(parcel ? "เปิดพัสดุ" : "เปิดธนาคารจำลอง");
      await command(parcel ? "ตรวจคำสั่งซื้อของฉัน" : "เปรียบเทียบจำนวนเงิน เวลา และรายการ");
      await command("กลับสายสนทนา");
    }
    await command("คุณจะทำอะไรต่อ?", "ฟังข้อมูลต่อโดยยังไม่ให้ข้อมูลเพิ่มเติม");
    await command("ฟังคำขอถัดไป");
    if (!normal) {
      await command("คุณจะทำอะไรต่อ?", "ฟังข้อมูลต่อโดยยังไม่ให้ข้อมูลเพิ่มเติม");
      await command("ฟังคำขอจากผู้โทร");
      await command(parcel ? "เปิดธนาคารจำลอง" : "เปิดข้อความ");
      await command(parcel ? "ดูรายละเอียดการโอนจำลอง" : "อ่านรหัสในข้อความจำลอง");
      if (criticalPath) {
        await command(parcel ? "เตรียมยืนยันการโอนจำลอง" : "เตรียมยืนยันการบอกรหัสจำลอง");
        const confirmation = current.availableActions.find(a => a.input === "CONFIRM"); assert.ok(confirmation);
        await command(confirmation.label);
      } else {
        await command("กลับสายสนทนา");
        await command("คุณจะทำอะไรต่อ?", parcel ? "ไม่ดำเนินการโอนตามคำขอ" : "ไม่บอกรหัสตามคำขอ");
        await command("จบสายหลังปฏิเสธคำขอ"); await command("ดูสรุปการฝึก");
      }
    } else {
      await command("คุณจะทำอะไรต่อ?", parcel ? "ยืนยันช่วงจัดส่งจำลอง" : "รับทราบข้อมูลรายการ");
      await command("จบการแจ้งข้อมูล"); await command("ดูสรุปการฝึก");
    }
    await page.getByRole("link", { name: "ดูผลการฝึก →", exact: true }).click();
    await expect(page).toHaveURL(origin + `/training/${sessionId}/result`);
    report.stages.push(stage);
  } else {
  // Opening/identity are not scored checkpoints in v5. Reach the first meaningful decision.
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "ตัวเลือกขณะนี้", exact: true }).click();
    await page.getByRole("button", { name: "ดำเนินบทสนทนาต่อ", exact: true }).click();
    await expect(page.getByLabel("ตอบผู้โทรด้วยข้อความ")).toBeEnabled();
  }
  await page.getByRole("button", { name: "ตัวเลือกขณะนี้", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "ตัวเลือกในขั้นตอนปัจจุบัน" })).toBeVisible();
  await page.screenshot({ path: "frontend-artifacts/part2-preview/contextual-actions.png", fullPage: true });
  await page.getByRole("button", { name: "วางสาย", exact: true }).click();
  await page.getByRole("button", { name: "ดูสรุปการฝึก", exact: true }).click();
  await page.getByRole("link", { name: "ดูผลการฝึก →", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ผ่านการฝึก", exact: true })).toBeVisible(); report.stages.push(stage);
  }
  stage = "OWNED_RECEIPT_EVIDENCE";
  check = "owned-persisted-result";
  const { createDatabase } = await import("../src/server/database.ts");
  const { PrismaTrainingRepository } = await import("../src/persistence/prisma-repository.ts");
  database = createDatabase(); const repo = new PrismaTrainingRepository(database);
  const saved = await repo.get(sessionId, ownerId);
  assert.equal(saved.templateVersion, 5); assert.equal(saved.state, "END_SCENARIO"); assert.equal(saved.status, criticalPath ? "FAILED" : "COMPLETED");
  if (expectedStory) {
    const template = await repo.getTemplate(saved.templateId, saved.templateVersion, saved.variant);
    assert.equal(template.callCenter.storyId, expectedStory, "SERVER_STORY_OVERRIDE_MISMATCH");
    report.story = expectedStory; report.path = criticalPath ? "explicit-critical" : "safe";
  }
  assert.ok(saved.dialogueTurns.length >= 4 && saved.dialogueTurns.every(t => !t.usedFallback && t.failureReason === null));
  assert.equal(saved.events.filter(e => e.critical).length, criticalPath ? 1 : 0); assert.equal(saved.result.trainingScore, null);
  assert.equal(saved.result.outcome, criticalPath ? "CRITICAL_FAILURE" : "PASSED");
  if (expectedStory) assert.equal(saved.result.decisionSummary.encountered, expectedStory.startsWith("CC-N") ? 2 : 3);
  assert.equal(saved.actions.filter(a => a.kind === "CHARACTER_OPENING").length, 1);
  report.receipts = saved.dialogueTurns.map(t => ({ turnId: t.id, usedFallback: t.usedFallback, attempts: t.attempts, failureReason: t.failureReason, state: t.state }));
  report.result = { templateVersion: saved.templateVersion, outcome: saved.result.outcome, trainingScore: saved.result.trainingScore, officialResultCount: await database.trainingResult.count({ where: { sessionId } }) };
  assert.equal(report.result.officialResultCount, 1); report.stages.push(stage);
  stage = "LOGOUT";
  check = "logout-revokes-access";
  await page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click(); await expect(page).toHaveURL(origin + "/login");
  assert.equal((await context.request.get(`/api/training/${sessionId}`)).status(), 401); report.stages.push(stage);
  assert.equal(report.browserErrorCount, 0); report.status = "PASSED";
  }
} catch (error) {
  report.failureStage = stage; report.failureCheck = check;
  report.failureCategory = error instanceof assert.AssertionError ? "VERIFICATION_ASSERTION" : stage === "OWNED_RECEIPT_EVIDENCE" ? "DATABASE_EVIDENCE_ERROR" : "BROWSER_OR_RUNTIME_FAILURE";
  if (page && context) {
    const path = new URL(page.url()).pathname;
    report.failurePage = ["/login", "/register", "/scenarios"].includes(path) ? path : "OTHER_APP_ROUTE";
    report.failureUI = { catalogVisible: await page.getByRole("heading", { name: "ฝึกรับสาย Call Center", exact: true }).isVisible().catch(() => false),
      loginVisible: await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).isVisible().catch(() => false),
      authLoading: await page.getByText("กำลังตรวจสอบการเข้าสู่ระบบ…", { exact: true }).isVisible().catch(() => false) };
    try { const auth = await context.request.get("/api/auth/session"); report.authenticatedAtFailure = !!(await auth.json()).user?.id; } catch { report.authenticatedAtFailure = null; }
    await mkdir("frontend-artifacts/part2-preview", { recursive: true });
    await page.screenshot({ path: "frontend-artifacts/part2-preview/failure.png", fullPage: true, mask: [page.locator("input")] }).catch(() => {});
  }
  process.exitCode = 1;
}
finally { await database?.$disconnect().catch(() => {}); await browser?.close(); }
await mkdir(output, { recursive: true });
await writeFile(`${output}/verification.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
