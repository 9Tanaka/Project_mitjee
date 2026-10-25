// Local production UI + real application/Core in memory. No live auth/DB/provider claims.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { register } from "tsx/esm/api";
register();
const { learningHarness } = await import("../tests/post-decision.helpers.ts");
const origin = process.argv[2] ?? "http://127.0.0.1:3228";
const caseIndex = process.argv.indexOf("--case"), widthIndex = process.argv.indexOf("--width");
const caseFilter = caseIndex >= 0 ? process.argv[caseIndex + 1] : undefined;
const widths = widthIndex >= 0 ? [Number(process.argv[widthIndex + 1])] : [375, 768, 1440];
assert(widths.every(width => [375, 768, 1440].includes(width)), "SUPPORTED_TEST_WIDTH_REQUIRED");
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "LOCAL_ORIGIN_REQUIRED");
const output = "frontend-artifacts/post-decision";
await mkdir(output, { recursive: true });
const fixtures = [];
for (const story of ["CC-01", "CC-02", "CC-N01", "CC-N02"]) {
  const h = await learningHarness(story); await h.safe(); fixtures.push({ name: story + "-passed", h });
}
for (const story of ["CC-01", "CC-02"]) {
  const h = await learningHarness(story); await h.critical(); fixtures.push({ name: story + "-critical", h });
}
const review = await learningHarness(); await review.context(); await review.choose("trust"); await review.opening(); await review.action("วางสาย");
fixtures.push({ name: "review", h: review });
const early = await learningHarness(); await early.action("รับสาย"); await early.action("วางสาย"); fixtures.push({ name: "early-unassessed", h: early });
fixtures.push({ name: "legacy-dto", h: fixtures[0].h, legacy: true });
const report = { status: "FAILED", scope: "Local production Next browser + actual application/Core + in-memory repository + Mock dialogue; API interception and synthetic identity. No live Auth/PostgreSQL/provider verification.", cases: [] };
const titles = { PASSED: "ผ่านการฝึก", NEEDS_PRACTICE: "ควรฝึกเพิ่มเติม", CRITICAL_FAILURE: "พบการกระทำที่มีความเสี่ยงสำคัญ", UNASSESSED: "ยังประเมินไม่ได้" };
const browser = await chromium.launch();
try {
  allCases: for (const fixture of fixtures.filter(f => !caseFilter || f.name === caseFilter)) for (const width of widths) {
    const { h } = fixture, raw = await h.raw(), result = await h.result();
    if (fixture.legacy) delete result.postDecisionGuidance; // Backward-compatible historical response shape only.
    const context = await browser.newContext({ baseURL: origin, viewport: { width, height: 960 }, reducedMotion: "reduce" });
    const page = await context.newPage(); let errors = 0;
    page.on("pageerror", () => errors++);
    page.on("console", message => { if (message.type() === "error") errors++; });
    const entry = { name: fixture.name, width, status: "FAILED", expectedOutcome: result.outcome, recovery: result.postDecisionGuidance?.recovery.map(r => r.incidentType) ?? [], browserErrors: 0 };
    report.cases.push(entry);
    await context.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/session") return route.fulfill({ json: { user: { id: h.owner.id, email: "synthetic@example.test" }, expires: "2099-01-01T00:00:00Z" } });
      if (path === `/api/training/${raw.id}/result`) {
        const data = await h.result(); if (fixture.legacy) delete data.postDecisionGuidance;
        return route.fulfill({ json: { data } });
      }
      if (path === "/api/scenarios") return route.fulfill({ json: { data: h.app.listScenarios() } });
      if (path === "/api/scenarios/call-center") return route.fulfill({ json: { data: h.app.scenario("call-center") } });
      return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "Test route not configured" } } });
    });
    let step = "RESULT";
    try {
      await page.goto(`/training/${raw.id}/result`);
      await expect(page.getByRole("heading", { name: titles[result.outcome], exact: true })).toBeVisible();
      await page.waitForLoadState("networkidle");
      const recovery = page.getByRole("heading", { name: "ถ้าเหตุการณ์ลักษณะนี้เกิดขึ้นจริง", exact: true });
      await expect(recovery).toHaveCount(entry.recovery.length ? 1 : 0);
      if (fixture.name.startsWith("CC-N") || fixture.name === "early-unassessed") {
        assert.doesNotMatch(await page.locator("main").innerText(), /OTP|โอนเงิน|ความลับ|การเร่งให้ตัดสินใจ/);
      }
      if (result.postDecisionGuidance) {
        const selections = new Map();
        for (const checkpoint of result.postDecisionGuidance.checkpoints) {
          if (checkpoint.selectedAction) selections.set(checkpoint.selectedAction, (selections.get(checkpoint.selectedAction) ?? 0) + 1);
        }
        for (const [label, count] of selections) {
          const selected = page.getByText("สิ่งที่คุณเลือก: " + label, { exact: true });
          await expect(selected).toHaveCount(count); await expect(selected.first()).toBeVisible();
        }
        if (entry.recovery.length) await expect(page.getByText("การกระทำจำลองที่ยืนยัน: " + result.postDecisionGuidance.recovery[0].confirmedAction, { exact: true })).toBeVisible();
      }
      step = "OVERFLOW";
      const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      assert(size.document <= size.viewport, "HORIZONTAL_OVERFLOW");
      await page.screenshot({ path: `${output}/${fixture.name}-${width}.png`, fullPage: true });
      if (!fixture.legacy) {
        step = "KEYBOARD_TUTORIAL";
        const nav = page.getByRole("navigation", { name: "ขั้นตอนหลังฝึก" });
        const retry = nav.getByRole("link", { name: "ลองฝึก Call Center อีกครั้ง", exact: true });
        await retry.focus(); await page.keyboard.press("Tab");
        await expect(nav.getByRole("link", { name: "ทบทวนบทเรียน", exact: true })).toBeFocused();
        await page.keyboard.press("Enter"); await expect(page).toHaveURL(/#call-tutorial$/);
        await expect(page.locator("#call-tutorial")).toBeFocused();
        step = "RETRY";
        await retry.click(); await expect(page).toHaveURL(origin + "/scenarios/call-center/prepare");
        await expect(page.getByRole("checkbox")).toBeVisible();
        await page.waitForLoadState("networkidle");
        step = "BACK_TO_RESULT";
        await page.goBack({ waitUntil: "networkidle" });
        await expect(page).toHaveURL(new RegExp(`/training/${raw.id}/result#call-tutorial$`));
        await expect(nav).toBeVisible();
        step = "SCENARIO_LIST";
        await nav.getByRole("link", { name: "กลับหน้าเลือกสถานการณ์", exact: true }).click();
        await expect(page).toHaveURL(origin + "/scenarios"); await expect(page.locator(".scenario-card")).toHaveCount(9);
      } else await expect(page.getByRole("heading", { name: "เหตุผลของแต่ละจุดที่พบ", exact: true })).toBeVisible();
      assert.deepEqual(await h.raw(), raw, "READ_ONLY_SNAPSHOT_CHANGED");
      assert.equal(errors, 0, "BROWSER_ERRORS"); entry.status = "PASSED";
    } catch (error) {
      entry.failure = error.code ?? error.name; entry.failedStep = step; entry.message = String(error.message).slice(0, 700);
      await page.screenshot({ path: `${output}/${fixture.name}-${width}-failure.png`, fullPage: true }).catch(() => {});
    } finally { entry.browserErrors = errors; await context.close(); }
    console.log(JSON.stringify({ name: entry.name, width, status: entry.status, browserErrors: errors }));
    if (entry.status === "FAILED") break allCases;
  }
  report.status = report.cases.every(c => c.status === "PASSED") ? "PASSED" : "FAILED";
} finally {
  await browser.close(); await writeFile(`${output}/verification.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ status: report.status, cases: report.cases.length, passed: report.cases.filter(c => c.status === "PASSED").length }));
if (report.status !== "PASSED") process.exitCode = 1;
