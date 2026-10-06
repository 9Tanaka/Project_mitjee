// Local UI bridge is explicitly Mock/in-memory; --preview uses real Auth/MySQL/Groq with no interception.
import { chromium, expect } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { register } from "tsx/esm/api";
register();
const preview = process.argv.includes("--preview");
const origin = preview ? "https://mitjee-ui-preview-git-feat-rule-based-895992-9tanakas-projects.vercel.app" : process.argv.find(x => x.startsWith("http://")) ?? "http://127.0.0.1:3217";
if (!preview) assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
const storyArg = process.argv.indexOf("--story");
const stories = preview ? [process.argv[storyArg + 1]] : ["CC-01", "CC-02", "CC-N01", "CC-N02"];
assert.ok(stories.every(s => ["CC-01", "CC-02", "CC-N01", "CC-N02"].includes(s)));
const widths = preview ? [375] : [375, 768, 1440];
const output = "frontend-artifacts/call-ux/" + (preview ? "preview-" + stories[0] : "local");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const report = { status: "FAILED", scope: preview ? "Real Preview browser/Auth/MySQL/Groq, no interception" : "Local production browser + in-memory/Mock application; synthetic identity, not live E2E", cases: [] };
try {
 for (const story of stories) for (const width of widths) {
  const evidence = { story, width, status: "FAILED", stages: [], browserErrors: 0, serverFailures: [], receipts: [] }; report.cases.push(evidence);
  const context = await browser.newContext({ baseURL: origin, viewport: { width, height: 960 }, reducedMotion: "reduce" });
  context.setDefaultTimeout(60000); const page = await context.newPage();
  page.on("pageerror", () => evidence.browserErrors++);
  page.on("response", r => { if (new URL(r.url()).pathname.startsWith("/api/") && r.status() >= 500) evidence.serverFailures.push({ status: r.status(), category: r.headers()["x-mitjee-failure-category"] ?? "UNCLASSIFIED" }); });
  let database, repo, app, owner, id, lastCallerAt = 0;
  try {
   if (preview) {
    const nextEnv = (await import("@next/env")).default; nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
    await page.goto("/register"); assert.equal(new URL(page.url()).origin, origin);
    const email = `call-ux-${randomUUID()}@example.test`, password = randomBytes(24).toString("base64url");
    await page.getByLabel("อีเมล", { exact: true }).fill(email); await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password); await page.getByLabel("ยืนยันรหัสผ่าน", { exact: true }).fill(password);
    await page.getByRole("button", { name: "สร้างบัญชี", exact: true }).click(); await expect(page).toHaveURL(/\/login\?registered=1$/);
    await page.getByLabel("อีเมล", { exact: true }).fill(email); await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password); await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
    await expect(page).toHaveURL(origin + "/scenarios"); owner = { id: (await (await context.request.get("/api/auth/session")).json()).user.id };
    await page.reload(); await expect(page.getByRole("button", { name: "ออกจากระบบ", exact: true })).toBeVisible();
    await page.goto("/scenarios/call-center"); await page.getByRole("link", { name: /เริ่มจำลองสถานการณ์/ }).click();
    await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "เริ่มฝึกสถานการณ์", exact: true }).click(); await expect(page).toHaveURL(/\/training\/[a-f0-9]+$/);
    id = new URL(page.url()).pathname.split("/").at(-1);
    const { createDatabase } = await import("../src/server/database.ts"); const { PrismaTrainingRepository } = await import("../src/persistence/prisma-repository.ts");
    database = createDatabase(); repo = new PrismaTrainingRepository(database);
    const raw = await repo.get(id, owner.id); assert.equal(raw.templateVersion, 6);
    const t = await repo.getTemplate(raw.templateId, raw.templateVersion, raw.variant); assert.equal(t.callCenter.storyId, story);
    evidence.stages.push("REAL_REGISTER_LOGIN_REFRESH_START");
   } else {
    const { createApplication } = await import("../src/application/composition.ts"); const { InMemoryTrainingRepository } = await import("../src/domain/repository.ts");
    const { MockScenarioModelProvider } = await import("../src/dialogue/mock-provider.ts"); const { publicError } = await import("../src/http/errors.ts");
    repo = new InMemoryTrainingRepository(); owner = { id: randomUUID() }; app = await createApplication(repo, new MockScenarioModelProvider(), Date.now, undefined, () => story);
    id = (await app.start("call-center", owner, { startId: randomUUID(), expectedRevision: 0 })).session.sessionId;
    await context.route("**/api/**", async route => {
      try { const path = new URL(route.request().url()).pathname, body = route.request().postDataJSON(); let data;
        if (path === "/api/auth/session") return route.fulfill({ json: { user: { id: owner.id }, expires: "2099-01-01T00:00:00Z" } });
        const op = path.split("/").at(-1);
        data = op === id ? await app.resume(id, owner) : op === "result" ? await app.result(id, owner) : op === "speech" ? { audioBase64: null, audioMime: "audio/wav", audioStatus: "UNAVAILABLE" }
          : ["opening", "message", "action", "quit"].includes(op) ? await app[op](id, owner, body) : [];
        await route.fulfill({ json: { data } });
      } catch (error) { const r = publicError(error); await route.fulfill({ status: r.status, json: r.body }); }
    });
    await page.goto(`/training/${id}`);
   }
   async function read() { if (!preview) return app.resume(id, owner); const r = await context.request.get(`/api/training/${id}`); assert.equal(r.status(), 200); return (await r.json()).data; }
   async function ready() {
    await expect(page.locator(".phone-training")).toHaveAttribute("data-caller-status", "READY", { timeout: 120000 });
    await expect(page.getByLabel("ตอบผู้โทรด้วยข้อความ")).toBeEnabled({ timeout: 120000 });
    return read();
   }
   async function capture(name) {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "HORIZONTAL_OVERFLOW");
    await page.screenshot({ path: `${output}/${story}-${width}-${name}.png`, fullPage: true });
   }
   await page.getByRole("button", { name: "รับสาย", exact: true }).click(); let current = await ready(); lastCallerAt = Date.now();
   assert.ok(current.messages[0]?.role === "character"); assert.ok(!current.phone.contextualDecision || current.phone.state === "CONTEXT_CLAIM");
   await capture("connected"); let messages = 0;
   for (let step = 0; step < 22 && current.status === "ACTIVE"; step++) {
    assert.equal(await page.getByRole("button", { name: /ดำเนินบทสนทนาต่อ|ฟังคำขอถัดไป|ฟังคำขอจากผู้โทร|ขอชื่อและฝ่ายที่ติดต่อ|ขอข้อมูลอ้างอิง|ขอคำอธิบายเพิ่มเติม/ }).count(), 0);
    await expect(page.getByRole("button", { name: "วางสาย", exact: true })).toBeVisible();
    const decision = current.phone.contextualDecision;
    if (!decision || messages === 0) {
      const close = page.getByRole("button", { name: "ปิดตัวเลือก", exact: true }); if (await close.isVisible()) await close.click();
      const before = await repo.get(id, owner.id);
      if (preview && process.argv.includes("--paced")) await new Promise(r => setTimeout(r, Math.max(0, 30000 - (Date.now() - lastCallerAt))));
      await page.getByLabel("ตอบผู้โทรด้วยข้อความ").fill(messages ? "ขอรายละเอียดเพิ่มเติมก่อนครับ" : "ขอชื่อและเลขอ้างอิงหน่อยครับ");
      await page.getByRole("button", { name: "ส่งข้อความ", exact: true }).click();
      await expect(page.getByLabel("ตอบผู้โทรด้วยข้อความ")).toHaveValue("", { timeout: 120000 }).catch(async e => { const s = await read(); if (s.phone.openingStatus !== "PENDING") throw e; });
      current = await ready(); messages++; lastCallerAt = Date.now();
      const after = await repo.get(id, owner.id); assert.deepEqual(after.events, before.events); assert.equal(after.result, null);
      assert.ok(after.opportunities.every(o => o.finalizedAt === null)); evidence.stages.push("NATURAL_TEXT_NON_SCORING");
    } else {
      const a = current.availableActions.find(a => decision.actionIds.includes(a.id)); assert.ok(a);
      const sheet = page.getByRole("dialog", { name: "ตัวเลือกในขั้นตอนปัจจุบัน" });
      if (!await sheet.isVisible()) await page.getByRole("button", { name: "ตัวเลือกขณะนี้", exact: true }).click();
      await expect(sheet).toBeVisible(); assert.equal(await sheet.getByRole("button", { name: /เปิด|วางสาย|จบสาย|ดำเนินบทสนทนา|ฟังคำขอ/ }).count(), 0);
      assert.ok(!/SAFE|RISKY|SCAM|NORMAL|คุณพบสัญญาณเตือน/.test(await sheet.innerText()));
      await capture(current.phone.state);
      const label = current.phone.state !== "MAIN_REQUEST" ? "ฟังข้อมูลต่อโดยยังไม่ให้ข้อมูลเพิ่มเติม" : story === "CC-01" ? "ไม่ดำเนินการโอนตามคำขอ" : story === "CC-02" ? "ไม่บอกรหัสตามคำขอ" : story === "CC-N01" ? "ยืนยันช่วงจัดส่งจำลอง" : "รับทราบข้อมูลรายการ";
      if (preview && process.argv.includes("--paced")) await new Promise(r => setTimeout(r, Math.max(0, 30000 - (Date.now() - lastCallerAt))));
      const response = page.waitForResponse(r => new URL(r.url()).pathname.endsWith("/action") && r.request().method() === "POST");
      await sheet.getByRole("radio", { name: label, exact: true }).check(); await sheet.getByRole("button", { name: "ยืนยันคำตอบ", exact: true }).click();
      const r = await response; assert.equal(r.status(), 200); current = (await r.json()).data.session;
      evidence.stages.push(`CONTEXTUAL_DECISION_${current.phone.state}`);
      if (current.status === "ACTIVE") current = await ready(); lastCallerAt = Date.now();
    }
   }
   assert.equal(current.status, "COMPLETED"); await page.getByRole("link", { name: "ดูผลการฝึก →", exact: true }).click(); await expect(page).toHaveURL(origin + `/training/${id}/result`);
   await expect(page.getByRole("heading", { name: /ผ่าน/ })).toBeVisible(); await capture("result");
   const raw = await repo.get(id, owner.id); assert.equal(raw.result.outcome, "PASSED"); assert.equal(raw.result.trainingScore, null);
   assert.equal(raw.opportunities.filter(o => o.finalizedAt !== null).length, story.startsWith("CC-N") ? 2 : 3);
   evidence.receipts = raw.dialogueTurns.map(t => ({ state: t.state, signal: t.response.interaction_signal, usedFallback: t.usedFallback, attempts: t.attempts, failureReason: t.failureReason }));
   if (preview) {
     await page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click(); await expect(page).toHaveURL(origin + "/login"); assert.equal((await context.request.get("/api/scenarios")).status(), 401);
     evidence.stages.push("REAL_LOGOUT_401");
   }
   assert.equal(evidence.browserErrors, 0); assert.deepEqual(evidence.serverFailures, []);
   evidence.liveGroq = preview ? (evidence.receipts.every(t => !t.usedFallback && t.failureReason === null) ? "PASSED" : "FAILED") : "NOT_RUN";
   evidence.status = "PASSED";
  } catch { evidence.failureCategory = "BROWSER_OR_RUNTIME_ASSERTION"; }
  finally { await database?.$disconnect(); await context.close(); }
  console.log(JSON.stringify({ story, width, status: evidence.status, stages: evidence.stages, liveGroq: evidence.liveGroq ?? "NOT_VERIFIED" }));
 }
 report.status = report.cases.every(c => c.status === "PASSED") ? "PASSED" : "FAILED";
} finally { await browser.close(); await writeFile(`${output}/verification.json`, JSON.stringify(report, null, 2)); }
console.log(JSON.stringify(report)); if (report.status !== "PASSED") process.exitCode = 1;
