// UI-only browser verification against a running production Next server.
// Browser requests are bridged to the real application services IN MEMORY.
// This is not Auth.js/MySQL/live-provider E2E; no application authentication bypass is added.
// Run: node scripts/verify-ui.mjs [http://127.0.0.1:3216]
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { register } from "tsx/esm/api";
register();
const { createApplication } = await import("../src/application/composition.ts");
const { InMemoryTrainingRepository } = await import("../src/domain/repository.ts");
const { MockScenarioModelProvider } = await import("../src/dialogue/mock-provider.ts");
const { QuizService } = await import("../src/quiz/service.ts");
const { InMemoryQuizRepository } = await import("../src/quiz/memory-repository.ts");
const { publicError } = await import("../src/http/errors.ts");

const baseURL = process.argv[2] ?? "http://127.0.0.1:3216";
assert(["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname), "Local test server required");
const output = "frontend-artifacts/ui-refresh";
await mkdir(output, { recursive: true });
const phoneRepository = new InMemoryTrainingRepository();
let selectedStory = "CC-01";
const app = await createApplication(phoneRepository, new MockScenarioModelProvider(), Date.now, undefined, () => selectedStory);
const quiz = new QuizService(new InMemoryQuizRepository(), Date.now, max => max - 1);
const user = { id: "ui-test-only" };
const browser = await chromium.launch();
const evidence = { status: "FAILED", scope: "UI + real in-memory application services; test identity; not Auth/MySQL/live E2E", screenshots: [], checks: [], errors: [] };
try {
  const context = await browser.newContext({ baseURL, reducedMotion: "reduce" });
  context.setDefaultTimeout(15000);
  await context.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const body = request.postDataJSON();
    try {
      let data;
      if (path === "/api/auth/session") return route.fulfill({ json: { user: { id: user.id, email: "ui-preview@example.test" }, expires: "2099-01-01T00:00:00.000Z" } });
      if (path === "/api/scenarios") data = app.listScenarios();
      else if (/^\/api\/scenarios\/[^/]+\/start$/.test(path)) data = await app.start(path.split("/")[3], user, body);
      else if (/^\/api\/scenarios\/[^/]+$/.test(path)) data = app.scenario(path.split("/")[3]);
      else if (path.startsWith("/api/training/")) {
        const [, , , id, operation] = path.split("/");
        if (!operation) data = await app.resume(id, user);
        else if (["message", "action", "quit", "opening"].includes(operation)) data = await app[operation](id, user, body);
        else if (operation === "result") data = await app.result(id, user);
        else throw new Error("Unsupported UI test request");
      } else if (path === "/api/quiz") data = await quiz.overview(user.id);
      else if (path === "/api/quiz/attempts") data = await quiz.start(user.id, body);
      else if (path.startsWith("/api/quiz/attempts/")) {
        const [, , , , id, operation] = path.split("/");
        data = operation ? await quiz.write(id, user.id, operation === "save" ? "SAVE" : "SUBMIT", body) : await quiz.resume(id, user.id);
      } else throw new Error("Unsupported UI test request");
      await route.fulfill({ json: { data } });
    } catch (error) {
      const reply = publicError(error);
      evidence.errors.push({ path, code: reply.body.error.code });
      await route.fulfill({ status: reply.status, json: reply.body });
    }
  });
  const page = await context.newPage();
  page.on("pageerror", error => evidence.errors.push({ browser: error.name }));
  page.on("console", message => { if (message.type() === "error") evidence.errors.push({ console: message.text() }); });
  async function ready(target = page) {
    await target.waitForLoadState("networkidle");
    await expect(target.locator("[data-nextjs-dialog], .vite-error-overlay")).toHaveCount(0);
  }
  async function capture(name, width, target = page) {
    await target.setViewportSize({ width, height: 1000 });
    await ready(target);
    const overflow = await target.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
    assert(overflow.content <= overflow.width, `${name} overflows at ${width}: ${overflow.content}`);
    const path = `${output}/${name}-${width}.png`;
    await target.screenshot({ path, fullPage: true });
    evidence.screenshots.push(path);
  }
  async function allWidths(name, target = page) { for (const width of [375, 768, 1440]) await capture(name, width, target); }
  const anonymous = await browser.newContext({ baseURL, reducedMotion: "reduce" });
  anonymous.setDefaultTimeout(15000);
  await anonymous.route("**/api/auth/session", route => route.fulfill({ json: null }));
  const authPage = await anonymous.newPage();
  authPage.on("pageerror", error => evidence.errors.push({ authBrowser: error.name }));
  for (const path of ["/login", "/register"]) {
    await authPage.goto(path); await expect(authPage.getByLabel("รหัสผ่าน", { exact: true })).toBeVisible();
    await allWidths(path.slice(1), authPage); await capture(path.slice(1), 640, authPage); await expect(authPage).toHaveURL(baseURL + path);
  }
  await authPage.getByLabel("อีเมล", { exact: true }).fill("validation@example.test");
  await authPage.getByLabel("รหัสผ่าน", { exact: true }).fill("synthetic-not-a-real-secret");
  await authPage.getByLabel("ยืนยันรหัสผ่าน", { exact: true }).fill("different-synthetic-value");
  await authPage.getByRole("button", { name: "สร้างบัญชี", exact: true }).click();
  await expect(authPage.getByRole("alert").filter({ hasText: "รหัสผ่านทั้งสองช่องไม่ตรงกัน" })).toBeVisible();
  await expect(authPage.getByLabel("รหัสผ่าน", { exact: true })).toHaveValue("");
  await capture("registration-validation", 375, authPage);
  await authPage.goto("/dashboard"); await expect(authPage).toHaveURL(baseURL + "/login");
  await authPage.goto("/faq");
  await authPage.setViewportSize({ width: 1440, height: 1000 });
  await expect(authPage.getByRole("link", { name: "เข้าสู่ระบบ", exact: true })).toBeVisible();
  await authPage.setViewportSize({ width: 375, height: 1000 });
  await authPage.getByRole("button", { name: "เปิดเมนู" }).click();
  await expect(authPage.getByRole("link", { name: "เข้าสู่ระบบ", exact: true })).toBeVisible();
  evidence.checks.push("anonymous auth forms, local mismatch validation/password clearing, protected-page redirect; no registration/login network mutation");
  await anonymous.close();
  for (const [path, name] of [["/", "home"], ["/faq", "faq"], ["/scenarios", "scenarios"], ["/dashboard", "dashboard-empty"], ["/settings", "settings"], ["/games", "games"], ["/games/preview", "game-preview"], ["/games/preview/result", "game-result-preview"], ["/knowledge", "knowledge"], ["/knowledge/preview", "article-preview"], ["/quiz", "quiz"], ["/quiz/details/pre", "quiz-detail"]]) {
    await page.goto(path); await allWidths(name); await expect(page).toHaveURL(baseURL + path);
  }
  await page.goto("/scenarios");
  await expect(page.locator(".scenario-card")).toHaveCount(9);
  await page.getByLabel("ค้นหาสถานการณ์").fill("SMS");
  await expect(page.locator(".scenario-card")).toHaveCount(1);
  await page.getByLabel("ค้นหาสถานการณ์").fill("ไม่มีรายการนี้แน่นอน");
  await expect(page.getByRole("heading", { name: "ไม่พบสถานการณ์ที่ค้นหา" })).toBeVisible();
  await page.getByRole("button", { name: "ล้างตัวกรอง" }).click();
  await expect(page.locator(".scenario-card")).toHaveCount(9);
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.getByRole("button", { name: "เปิดเมนู" }).click();
  await expect(page.getByRole("navigation", { name: "เมนูพื้นที่เรียนรู้" })).toBeVisible();
  await capture("mobile-menu", 375);
  await page.getByRole("link", { name: "แบบทดสอบ", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "เปิดเมนู" })).toBeFocused();
  evidence.checks.push("9 scenarios, search, empty/reset, mobile disclosure and Escape focus");
  await page.locator(".scenario-card").filter({ has: page.getByRole("heading", { name: "SMS แจ้งพัสดุจากผู้ส่งสมมติ" }) }).getByRole("link", { name: "ดูรายละเอียด" }).click();
  await allWidths("scenario-detail");
  await page.getByRole("link", { name: "เริ่มจำลองสถานการณ์" }).click();
  await allWidths("scenario-prepare");
  await expect(page.getByRole("button", { name: "เริ่มฝึกสถานการณ์" })).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "เริ่มฝึกสถานการณ์" }).click();
  await expect(page).toHaveURL(/\/training\/[^/]+$/);
  const id = new URL(page.url()).pathname.split("/").at(-1);
  const before = await app.resume(id, user);
  for (const text of ["ขอพิจารณาข้อมูลก่อน", "ฉันขออ่านรายละเอียดอีกครั้ง"]) {
    await page.getByLabel("ข้อความของคุณ").fill(text);
    await page.getByRole("button", { name: "ส่งข้อความ", exact: true }).click();
    await expect(page.getByLabel("ข้อความของคุณ")).toHaveValue("");
    await expect(page.getByRole("log").getByText(text, { exact: true })).toBeVisible();
  }
  const after = await app.resume(id, user);
  assert.deepEqual(after.availableActions, before.availableActions);
  assert.equal(after.currentStatePublicLabel, before.currentStatePublicLabel);
  await page.reload(); await expect(page.getByLabel("ข้อความของคุณ")).toBeVisible();
  await allWidths("training-chat");
  async function choose(label) {
    const radio = page.getByRole("radio", { name: label, exact: true });
    const field = page.locator("fieldset").filter({ has: radio });
    await radio.check(); await field.getByRole("button", { name: "ยืนยันคำตอบ", exact: true }).click();
    await expect(radio).toHaveCount(0);
  }
  await choose("ตรวจสอบผู้ส่งจากช่องทางอื่น");
  await page.getByRole("button", { name: "ดูข้อความ", exact: true }).click();
  await page.getByRole("checkbox", { name: /ลิงก์ parcel-check/ }).check();
  await page.getByRole("checkbox", { name: /อ้างว่าจะยกเลิกพัสดุ/ }).check();
  await page.getByRole("button", { name: "ยืนยันหลักฐาน", exact: true }).click();
  await page.getByRole("button", { name: "พิจารณาคำขอในข้อความ", exact: true }).click();
  await choose("ปฏิเสธการให้ข้อมูล");
  await page.getByRole("button", { name: "ไปขั้นตอนตอบสนอง", exact: true }).click();
  await choose("ตรวจสอบกับช่องทางทางการ");
  await choose("ตรวจสอบ ยุติการติดต่อ และรายงาน");
  await page.getByRole("button", { name: "จบแบบฝึก", exact: true }).click();
  await page.getByRole("link", { name: "ดูผลการฝึก" }).click();
  await expect(page.getByRole("heading", { name: "ผ่านการฝึก", exact: true })).toBeVisible();
  const result = await app.result(id, user);
  assert.equal(result.outcome, "PASSED"); assert.equal(result.trainingScore, null);
  await allWidths("training-result");
  evidence.checks.push("details/acknowledgment, multi-turn text no automatic transition, refresh, full safe path and real categorical result");
  const call = app.listScenarios().find(s => s.category === "CALL_CENTER");
  const callSession = await app.start(call.id, user, { startId: randomUUID(), expectedRevision: 0 });
  const callId = callSession.session.sessionId;
  await page.goto("/training/" + callId); await allWidths("call-incoming");
  await expect(page.getByRole("button", { name: "รับสาย", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "ปฏิเสธสาย", exact: true })).toBeVisible();
  await expect(page.locator(".training-grid, .action-panel, .chat-panel")).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.getByRole("button", { name: "รับสาย", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("MITJEE Parcel");
  assert.deepEqual((await phoneRepository.get(callId, user.id)).messages.map(m => m.role), ["character"]);
  await allWidths("call-active");
  const phoneBefore = await phoneRepository.get(callId, user.id);
  await page.getByLabel("ตอบผู้โทรด้วยข้อความ").fill("เขาขอให้ผมโอนเงิน ขอพิจารณาข้อมูลก่อน");
  await page.getByRole("button", { name: "ส่งข้อความ", exact: true }).click();
  await expect(page.getByLabel("ตอบผู้โทรด้วยข้อความ")).toHaveValue("");
  const phoneAfter = await phoneRepository.get(callId, user.id);
  assert.equal(phoneAfter.state, phoneBefore.state);
  assert.deepEqual(phoneAfter.events, phoneBefore.events); assert.deepEqual(phoneAfter.opportunities, phoneBefore.opportunities);
  assert.equal(phoneAfter.result, null);
  await page.reload(); await expect(page.getByRole("log")).toContainText("เขาขอให้ผมโอนเงิน");
  await page.getByRole("button", { name: "ข้อมูลผู้โทร", exact: true }).click();
  await expect(page.getByText("ข้อมูลนี้ไม่ใช่การยืนยันตัวตนผู้โทร")).toBeVisible();
  await allWidths("call-internal-app");
  await page.getByRole("button", { name: "กลับสายสนทนา", exact: true }).click();
  async function phoneAction(label, choice) {
    const toggle = page.getByRole("button", { name: "ตัวเลือกขณะนี้", exact: true });
    await toggle.click();
    const sheet = page.getByRole("dialog", { name: "ตัวเลือกในขั้นตอนปัจจุบัน" });
    await expect(sheet).toBeVisible();
    if (choice) await choose(choice);
    else await sheet.getByRole("button", { name: label, exact: true }).click();
    await expect(sheet).toHaveCount(0);
  }
  await page.getByRole("button", { name: "ตัวเลือกขณะนี้", exact: true }).click();
  await allWidths("call-contextual-actions");
  await expect(page.getByRole("button", { name: "เลือกวิธีจัดการสาย", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "ตัวเลือกขณะนี้", exact: true })).toBeFocused();
  await phoneAction("วางสาย");
  await expect(page.getByRole("heading", { name: "สิ้นสุดสายจำลอง", exact: true })).toBeVisible();
  await allWidths("call-ending");
  await page.getByRole("button", { name: "ดูสรุปการฝึก", exact: true }).click();
  await page.getByRole("link", { name: "ดูผลการฝึก →", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ยังประเมินไม่ได้", exact: true })).toBeVisible();
  assert.equal((await app.result(callId, user)).outcome, "UNASSESSED");
  await allWidths("call-result");
  evidence.checks.push("Call Center v5 early hangup without a meaningful decision is UNASSESSED; automatic state turns, text/refresh and contextual apps; no live-provider verification");
  for (const story of ["CC-01", "CC-02", "CC-N01", "CC-N02"]) {
    selectedStory = story; const scam = !story.includes("N"), parcel = story.endsWith("01");
    await page.goto("/scenarios/call-center");
    await page.getByRole("link", { name: "เริ่มจำลองสถานการณ์", exact: true }).click();
    await expect(page.getByRole("button", { name: "เริ่มฝึกสถานการณ์", exact: true })).toBeDisabled();
    await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "เริ่มฝึกสถานการณ์", exact: true }).click();
    await expect(page).toHaveURL(/\/training\/[a-f0-9]+$/);
    const storySessionId = new URL(page.url()).pathname.split("/").at(-1);
    await page.getByRole("button", { name: "รับสาย", exact: true }).click();
    await expect(page.getByLabel("ตอบผู้โทรด้วยข้อความ")).toBeEnabled();
    while ((await phoneRepository.get(storySessionId, user.id)).state !== "MAIN_REQUEST") {
      const current = await app.resume(storySessionId, user);
      if (current.availableActions.some(a => a.input === "CHOICE")) await phoneAction(null, "ฟังข้อมูลต่อโดยยังไม่ให้ข้อมูลเพิ่มเติม");
      const next = (await app.resume(storySessionId, user)).availableActions.find(a => ["ดำเนินบทสนทนาต่อ", "ฟังคำขอถัดไป", "ฟังคำขอจากผู้โทร"].includes(a.label));
      assert.ok(next, "BACKEND_NEXT_BRANCH_MISSING"); await phoneAction(next.label);
      await expect(page.getByLabel("ตอบผู้โทรด้วยข้อความ")).toBeEnabled();
    }
    if (scam) {
      await page.getByRole("button", { name: parcel ? "ธนาคารจำลอง" : "ข้อความ", exact: true }).click();
      await expect(page.getByRole("heading", { name: parcel ? "รายการโอนจำลองตามคำขอ" : "MITJEE Bank · ข้อความจำลอง" })).toBeVisible();
      const otpLine = !parcel ? await page.getByText(/รหัสยืนยันจำลองของคุณคือ/).innerText() : null;
      await allWidths(`call-${story}-request-app`);
      await page.getByRole("button", { name: parcel ? "ดูรายละเอียดการโอนจำลอง" : "อ่านรหัสในข้อความจำลอง", exact: true }).click();
      await page.reload();
      if (otpLine) await expect(page.getByText(otpLine, { exact: true })).toBeVisible();
      assert.equal((await phoneRepository.get(storySessionId, user.id)).status, "ACTIVE");
      await page.getByRole("button", { name: parcel ? "เตรียมยืนยันการโอนจำลอง" : "เตรียมยืนยันการบอกรหัสจำลอง", exact: true }).click();
      const confirmation = page.getByRole("button", { name: parcel ? "ยืนยันการโอนเงินจำลอง" : "ยืนยันการบอกรหัสจำลองแก่ผู้โทร", exact: true });
      await expect(confirmation).not.toHaveClass(/button-warning/); await confirmation.click();
      await expect(page.getByRole("button", { name: "ยืนยันการกระทำจำลอง", exact: true })).not.toHaveClass(/button-warning/);
      await allWidths(`call-${story}-confirmation`);
      await page.getByRole("button", { name: "ยืนยันการกระทำจำลอง", exact: true }).click();
      await page.getByRole("link", { name: "ดูผลการฝึก →", exact: true }).click();
      await expect(page.getByRole("heading", { name: "พบการกระทำที่มีความเสี่ยงสำคัญ", exact: true })).toBeVisible();
      assert.equal((await app.result(storySessionId, user)).outcome, "CRITICAL_FAILURE");
    } else {
      await page.getByRole("button", { name: parcel ? "พัสดุ" : "ธนาคารจำลอง", exact: true }).click();
      await page.getByRole("button", { name: parcel ? "ตรวจคำสั่งซื้อของฉัน" : "เปรียบเทียบจำนวนเงิน เวลา และรายการ", exact: true }).click();
      await allWidths(`call-${story}-matched-app`);
      await page.getByRole("button", { name: "กลับสายสนทนา", exact: true }).click();
      await phoneAction(null, parcel ? "ให้เฉพาะข้อมูลจำเป็นต่อการจัดส่ง" : "รับทราบข้อมูลรายการ");
      await phoneAction("วางสาย"); await page.getByRole("button", { name: "ดูสรุปการฝึก", exact: true }).click();
      await page.getByRole("link", { name: "ดูผลการฝึก →", exact: true }).click();
      await expect(page.getByRole("heading", { name: "ผ่านการฝึก", exact: true })).toBeVisible();
      assert.equal((await app.result(storySessionId, user)).outcome, "PASSED");
    }
    await expect(page.getByRole("heading", { name: "ลำดับพฤติกรรมที่ยืนยัน", exact: true })).toBeVisible();
    await allWidths(`call-${story}-reflection`);
  }
  evidence.checks.push("All four v4 stories: detail/prepare/acknowledgment, every automatic caller beat, state-gated apps/refresh, stable OTP, neutral explicit critical controls for both scams, normal matched checks/acknowledgment/end/reflection at 375/768/1440");
  await page.goto("/quiz/details/pre");
  await page.getByRole("button", { name: "เริ่มทำแบบทดสอบ", exact: true }).click();
  await expect(page).toHaveURL(/\/quiz\/q-/);
  const attemptId = new URL(page.url()).pathname.split("/").at(-1);
  await allWidths("quiz-round");
  for (let i = 0; i < 20; i++) {
    await page.getByRole("button", { name: new RegExp(`^ไปข้อ ${i + 1} `) }).click();
    await page.getByRole("radio").first().check();
    const saved = page.waitForResponse(r => r.url().endsWith("/save") && r.request().method() === "POST");
    await page.getByRole("button", { name: i === 19 ? "บันทึกคำตอบ" : "บันทึกและไปข้อต่อไป", exact: true }).click();
    assert.equal((await saved).status(), 200);
  }
  await page.getByRole("button", { name: "ส่งคำตอบและดูผล", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ผล Quiz ของคุณ" })).toBeVisible();
  const attempt = await quiz.resume(attemptId, user.id);
  assert.equal(attempt.status, "COMPLETED");
  await allWidths("quiz-result");
  await page.goto("/dashboard"); await allWidths("dashboard-populated");
  evidence.checks.push("Quiz detail/start, 20 saved answers, submit, result and dashboard from QuizService (not fabricated UI scores)");
  await page.goto("/games/preview");
  await page.getByRole("radio").first().check();
  await expect(page.getByRole("status")).toContainText("เลือกในตัวอย่าง");
  await page.goto("/faq");
  await page.locator("details").first().locator("summary").click();
  await expect(page.locator("details").first()).toHaveAttribute("open", "");
  await page.goto("/"); await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "ข้ามไปยังเนื้อหา" })).toBeFocused();
  await page.keyboard.press("Enter"); await expect(page.getByRole("main")).toBeFocused();
  evidence.checks.push("preview controls, FAQ disclosure, skip link keyboard focus; no horizontal overflow at 375/768/1440");
  assert.deepEqual(evidence.errors, []);
  const failureContext = await browser.newContext({ baseURL });
  failureContext.setDefaultTimeout(15000);
  await failureContext.route("**/api/auth/session", route => route.fulfill({ json: { user: { id: user.id }, expires: "2099-01-01T00:00:00.000Z" } }));
  let releaseCatalog;
  const waitForCatalog = new Promise(resolve => { releaseCatalog = resolve; });
  let recovered = false;
  await failureContext.route("**/api/scenarios", async route => {
    await waitForCatalog;
    await route.fulfill(recovered ? { json: { data: app.listScenarios() } } : { status: 503, json: { error: { code: "INTERNAL_ERROR", message: "Synthetic unavailable response" } } });
  });
  const failurePage = await failureContext.newPage();
  await failurePage.goto("/scenarios");
  await expect(failurePage.getByRole("status").filter({ hasText: "กำลังโหลดข้อมูล" })).toBeVisible();
  await failurePage.screenshot({ path: `${output}/scenarios-loading.png` }); evidence.screenshots.push(`${output}/scenarios-loading.png`);
  releaseCatalog();
  await expect(failurePage.getByRole("alert").filter({ hasText: "ระบบไม่สามารถทำรายการได้" })).toBeVisible();
  await capture("scenarios-error", 375, failurePage);
  recovered = true;
  await failurePage.getByRole("button", { name: "ลองอีกครั้ง" }).click();
  await expect(failurePage.locator(".scenario-card")).toHaveCount(9);
  await failureContext.close();
  evidence.checks.push("loading, explicit 503 error presentation and user-driven successful retry (expected synthetic error, isolated from normal-flow error check)");
  evidence.status = "PASSED";
  console.log(`UI verification passed: ${evidence.screenshots.length} screenshots; ${evidence.checks.length} flow groups; no unexpected browser errors.`);
} finally {
  await writeFile(`${output}/verification.json`, JSON.stringify(evidence, null, 2));
  await browser.close();
}
