// Local production browser + real application/Core with synthetic identity, in-memory
// repository, Mock dialogue and a synthetic WAV. No live auth/database/provider claims.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { register } from "tsx/esm/api";
register();
const { learningHarness } = await import("../tests/post-decision.helpers.ts");
const { publicError } = await import("../src/http/errors.ts");
const origin = process.argv[2] ?? "http://127.0.0.1:3228";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "LOCAL_ORIGIN_REQUIRED");
const argument = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const widths = argument("--width") ? [Number(argument("--width"))] : [375, 768, 1440];
assert(widths.every(width => [375, 768, 1440].includes(width)), "SUPPORTED_WIDTH_REQUIRED");
const cases = [
  { name: "CC-01-caution", story: "CC-01", contextChoice: "caution", ending: "hangup" },
  { name: "CC-01-trust", story: "CC-01", contextChoice: "trust", ending: "refuse" },
  { name: "CC-01-refuse", story: "CC-01", contextChoice: "caution", ending: "refuse" },
  { name: "CC-01-critical-transfer", story: "CC-01", contextChoice: "caution", ending: "critical" },
  { name: "CC-02-trust", story: "CC-02", contextChoice: "trust", ending: "refuse" },
  { name: "CC-02-refuse", story: "CC-02", contextChoice: "caution", ending: "refuse" },
  { name: "CC-02-critical-otp", story: "CC-02", contextChoice: "caution", ending: "critical" },
  { name: "CC-N01-normal", story: "CC-N01", contextChoice: "caution", ending: "confirm" },
  { name: "CC-N02-normal", story: "CC-N02", contextChoice: "caution", ending: "acknowledge" },
].filter(item => !argument("--case") || item.name === argument("--case"));
assert(cases.length, "CASE_NOT_FOUND");
const output = "frontend-artifacts/call-conversation";
await mkdir(output, { recursive: true });
const wav = Buffer.alloc(44 + 3200);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
const report = { status: "FAILED", scope: "Local production Next browser; API bridge to actual application/Core, in-memory repository, synthetic identity, Mock dialogue and synthetic WAV. Not live Auth/PostgreSQL/Groq/STT/TTS verification.", cases: [] };
const browser = await chromium.launch();
try {
  allCases: for (const fixture of cases) for (const width of widths) {
    const h = await learningHarness(fixture.story), id = h.session().sessionId;
    const context = await browser.newContext({ baseURL: origin, viewport: { width, height: 960 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    let speechAvailable = false;
    const entry = { name: fixture.name, width, status: "FAILED", stages: [], browserErrors: 0, speechRequests: 0, openingRequests: 0 };
    report.cases.push(entry);
    page.on("pageerror", () => entry.browserErrors++);
    page.on("console", message => { if (message.type() === "error") entry.browserErrors++; });
    await context.route("**/api/**", async route => {
      try {
        const path = new URL(route.request().url()).pathname, body = route.request().postDataJSON();
        if (path === "/api/auth/session") return route.fulfill({ json: { user: { id: h.owner.id, email: "synthetic@example.test" }, expires: "2099-01-01T00:00:00Z" } });
        let data;
        if (path === "/api/scenarios") data = h.app.listScenarios();
        else if (path === "/api/scenarios/call-center") data = h.app.scenario("call-center");
        else {
          const op = path.split("/").at(-1);
          if (op === id) data = await h.app.resume(id, h.owner);
          else if (op === "result") data = await h.result();
          else if (op === "speech") {
            entry.speechRequests++;
            // Keep the opening phase unavailable until observed. Consecutive
            // authored opening beats deliberately use latest-turn cancellation.
            data = !speechAvailable ? { audioBase64: null, audioMime: "audio/wav", audioStatus: "UNAVAILABLE" }
              : { audioBase64: wav.toString("base64"), audioMime: "audio/wav", audioStatus: "READY" };
          } else if (["action", "message", "opening", "quit"].includes(op)) {
            if (op === "opening") entry.openingRequests++;
            data = await h.app[op](id, h.owner, body); h.set(data.session);
          } else return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "Test route not configured" } } });
        }
        await route.fulfill({ json: { data } });
      } catch (error) { const response = publicError(error); await route.fulfill({ status: response.status, json: response.body }); }
    });
    let step = "ANSWER";
    const log = page.getByRole("log", { name: "บทถอดเสียงสายจำลอง" });
    const sheet = page.getByRole("dialog", { name: "ตัวเลือกในขั้นตอนปัจจุบัน" });
    const actionLines = () => log.locator('[data-turn-kind="COMMITTED_ACTION"]');
    const current = () => h.session();
    async function settle() {
      await expect(page.locator(".phone-request-status")).toHaveCount(0);
      if (current().status === "ACTIVE" && current().phone.callStatus === "CONNECTED") {
        await expect(page.locator(".phone-training")).toHaveAttribute("data-caller-status", "READY");
        await expect(page.locator(".phone-request-status")).toHaveCount(0);
      }
    }
    async function mutationClick(locator, operation = "action") {
      const response = page.waitForResponse(r => new URL(r.url()).pathname === `/api/training/${id}/${operation}`);
      await locator.click(); assert.equal((await response).status(), 200, "MUTATION_FAILED"); await settle();
    }
    async function assertTranscript() {
      const transcript = current().phone.transcript;
      assert(transcript, "PROJECTED_TRANSCRIPT_MISSING");
      await expect(log.locator(".phone-transcript-line")).toHaveCount(transcript.length);
      assert.deepEqual(await log.locator(".phone-transcript-line p").allTextContents(), transcript.map(item => item.text), "TRANSCRIPT_CHRONOLOGY");
      assert.equal(new Set(transcript.map(item => item.id)).size, transcript.length, "DUPLICATE_TRANSCRIPT_ID");
    }
    async function capture(name) {
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "HORIZONTAL_OVERFLOW");
      await page.screenshot({ path: `${output}/${fixture.name}-${width}-${name}.png`, fullPage: true });
    }
    async function choose(choiceId) {
      const opportunity = h.template.opportunities.find(item => item.state === current().phone.state);
      assert(opportunity?.skill === "D", "DECISION_EXPECTED");
      const choice = opportunity.choices.find(item => item.id === choiceId); assert(choice, "CHOICE_EXPECTED");
      if (!await sheet.isVisible()) await page.getByRole("button", { name: "ตัวเลือกขณะนี้", exact: true }).click();
      await expect(sheet).toBeVisible();
      assert.doesNotMatch(await sheet.innerText(), /SAFE|REVIEW|CRITICAL|CORRECT|WRONG|SCAM|NORMAL/);
      const before = current().phone.transcript.filter(item => item.kind === "COMMITTED_ACTION").length;
      await sheet.getByRole("radio", { name: choiceId === "trust" ? "เชื่อคำกล่าวอ้างของผู้โทร" : choice.publicLabel, exact: true }).check();
      await mutationClick(sheet.getByRole("button", { name: "ยืนยันคำตอบ", exact: true }));
      await expect(actionLines()).toHaveCount(before + 1); await assertTranscript();
      entry.stages.push(`COMMITTED_${choiceId.toUpperCase()}_VISIBLE`);
    }
    try {
      await page.goto(`/training/${id}`);
      await mutationClick(page.getByRole("button", { name: "รับสาย", exact: true }));
      await expect(page.getByLabel("ตอบผู้โทรด้วยข้อความ")).toBeEnabled();
      assert.equal(current().messages[0]?.role, "character", "CALLER_MUST_SPEAK_FIRST");
      await expect(sheet).toHaveCount(0);
      await expect(page.locator("audio[controls]")).toHaveCount(0);
      await expect(page.getByRole("checkbox", { name: /เสียงผู้โทร/ })).toHaveCount(0);
      await expect.poll(() => entry.speechRequests).toBeGreaterThan(0);
      await expect(page.getByText(/ไม่สามารถเล่นเสียงได้ในขณะนี้/)).toBeVisible();
      speechAvailable = true;
      await page.getByRole("button", { name: "ปิดเสียงผู้โทร", exact: true }).click();
      await expect(page.getByRole("button", { name: "เปิดเสียงผู้โทร", exact: true })).toHaveAttribute("aria-pressed", "true");
      await capture("ordinary");
      entry.stages.push("CALLER_FIRST_AUTO_AUDIO_REQUEST_TTS_FAILURE_NONBLOCKING", "MUTED_TRANSCRIPT_USABLE");
      step = "NATURAL_CONVERSATION";
      for (let turns = 0; turns < 4 && current().phone.state === "IDENTITY_CLAIM"; turns++) {
        await page.getByLabel("ตอบผู้โทรด้วยข้อความ").fill(turns ? "ขอเลขอ้างอิงด้วยครับ" : "ขอชื่อหน่อยครับ");
        await mutationClick(page.getByRole("button", { name: "ส่งข้อความ", exact: true }), "message");
      }
      assert.equal(current().phone.state, "CONTEXT_CLAIM");
      await expect(page.getByRole("button", { name: /ดำเนินบทสนทนาต่อ|ฟังคำขอถัดไป|ขอชื่อและฝ่ายที่ติดต่อ/ })).toHaveCount(0);
      await assertTranscript();
      step = "CONTEXT_CHOICE";
      await choose(fixture.contextChoice);
      assert.equal(current().status, "ACTIVE", "CONTEXT_CHOICE_MUST_NOT_END_CALL");
      await expect(page.locator(".phone-training").getByRole("alert")).toHaveCount(0);
      if (fixture.contextChoice === "trust") entry.stages.push("REVIEW_CONTINUES_WITHOUT_FAILURE");
      step = "REFRESH";
      const beforeRefresh = await h.raw(), projected = structuredClone(current().phone.transcript), speechBefore = entry.speechRequests;
      await page.reload(); await settle(); await expect(log).toBeVisible();
      await assertTranscript(); assert.deepEqual(current().phone.transcript, projected);
      assert.deepEqual(await h.raw(), beforeRefresh, "REFRESH_CHANGED_COMMITTED_STATE");
      await page.waitForLoadState("networkidle"); assert.equal(entry.speechRequests, speechBefore, "REFRESH_AUTOPLAYED_OLD_MESSAGE");
      entry.stages.push("REFRESH_NO_DUPLICATE_NO_OLD_AUTOPLAY");
      if (fixture.ending === "hangup") {
        step = "HANGUP";
        await mutationClick(page.getByRole("button", { name: "วางสาย", exact: true }));
      } else {
        if (current().phone.state === "PRESSURE") { step = "PRESSURE_CHOICE"; await choose("caution"); }
        assert.equal(current().phone.state, "MAIN_REQUEST");
        if (fixture.ending === "critical") {
          step = "SIMULATED_APP";
          if (await sheet.isVisible()) await sheet.getByRole("button", { name: "ปิดตัวเลือก", exact: true }).click();
          const parcel = fixture.story === "CC-01";
          await mutationClick(page.getByRole("navigation", { name: "แอปภายในโทรศัพท์" }).getByRole("button", { name: parcel ? "ธนาคารจำลอง" : "ข้อความ · ใหม่", exact: true }));
          if (parcel) {
            await mutationClick(page.getByRole("button", { name: "ดูรายละเอียดการโอนจำลอง", exact: true }));
            await mutationClick(page.getByRole("button", { name: "เตรียมยืนยันการโอนจำลอง", exact: true }));
            const confirm = current().availableActions.find(item => item.input === "CONFIRM"); assert(confirm);
            await page.getByRole("button", { name: confirm.label, exact: true }).click();
          } else await page.getByRole("button", { name: "บอกรหัสจำลองแก่ผู้โทร", exact: true }).click();
          const before = await h.raw(), openingBefore = entry.openingRequests;
          step = "CRITICAL_CONFIRMATION";
          if (parcel) await mutationClick(page.getByRole("group", { name: "ยืนยันการกระทำจำลอง" }).getByRole("button", { name: "ยืนยันการกระทำจำลอง", exact: true }));
          else { await page.getByRole("button", { name: "ยืนยันบอกรหัสจำลอง", exact: true }).click(); await expect(page.getByRole("heading", { name: "คุณถูกหลอกในสถานการณ์จำลอง", exact: true })).toBeVisible(); }
          const alert = page.locator(".phone-training").getByRole("alert");
          await expect(alert).toBeFocused();
          await expect(alert.getByRole("heading", { name: "คุณถูกหลอกในสถานการณ์จำลอง", exact: true })).toBeVisible();
          await expect(page.getByLabel("ตอบผู้โทรด้วยข้อความ")).toHaveCount(0);
          await expect(page.getByLabel("เสียง Call Center")).toHaveCount(0);
          await assertTranscript();
          assert.match((await actionLines().last().innerText()), parcel ? /ยืนยันโอนเงินจำลอง/ : /ยืนยันบอกรหัส OTP จำลอง/);
          await page.waitForLoadState("networkidle");
          assert.deepEqual((await h.raw()).messages, before.messages, "ORDINARY_CALLER_TURN_AFTER_CRITICAL");
          assert.equal(entry.openingRequests, openingBefore, "OPENING_REQUEST_AFTER_CRITICAL");
          entry.stages.push("EXPLICIT_CRITICAL_ACTION_VISIBLE", "CRITICAL_FOCUSED_ENDING_NO_CALLER_CONTINUATION");
        } else { step = "MAIN_CHOICE"; await choose(fixture.ending); }
      }
      step = "TERMINAL";
      assert(["COMPLETED", "FAILED"].includes(current().status)); await assertTranscript();
      await capture("ending");
      const result = await h.result(); entry.outcome = result.outcome;
      assert.equal(result.trainingScore, null);
      assert.equal(result.outcome, fixture.ending === "critical" ? "CRITICAL_FAILURE" : fixture.contextChoice === "trust" ? "NEEDS_PRACTICE" : "PASSED");
      const critical = fixture.ending === "critical";
      if (!critical) await expect(page.getByRole("heading", { name: "คุณถูกหลอกในสถานการณ์จำลอง", exact: true })).toHaveCount(0);
      step = "RESULT_RECOVERY";
      await page.getByRole("link", { name: critical ? "ดูผลและวิธีรับมือ" : "ดูผลการฝึก →", exact: true }).click();
      await expect(page).toHaveURL(origin + `/training/${id}/result`);
      await expect(page.getByRole("heading", { name: "บทเรียนจากสถานการณ์", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "ถ้าเหตุการณ์ลักษณะนี้เกิดขึ้นจริง", exact: true })).toHaveCount(critical ? 1 : 0);
      await capture("result");
      if (fixture.story.startsWith("CC-N")) {
        assert.doesNotMatch(await page.locator("main").innerText(), /OTP|โอนเงิน|คุณถูกหลอก/);
        entry.stages.push("NORMAL_CALL_NO_SCAM_RECOVERY");
      }
      step = "TUTORIAL_RETRY";
      const navigation = page.getByRole("navigation", { name: "ขั้นตอนหลังฝึก" });
      await navigation.getByRole("link", { name: "ทบทวนบทเรียน", exact: true }).click();
      await expect(page.locator("#call-tutorial")).toBeFocused();
      await navigation.getByRole("link", { name: "ลองฝึก Call Center อีกครั้ง", exact: true }).click();
      await expect(page).toHaveURL(origin + "/scenarios/call-center/prepare");
      await expect(page.getByRole("checkbox")).toBeVisible();
      entry.stages.push("RESULT_TUTORIAL_MATCHING_RECOVERY_RETRY");
      assert.equal(entry.browserErrors, 0, "BROWSER_ERRORS"); entry.status = "PASSED";
    } catch (error) {
      entry.failedStep = step; entry.failure = error.code ?? error.name;
      entry.message = String(error.message).slice(0, 900);
      await page.screenshot({ path: `${output}/${fixture.name}-${width}-failure.png`, fullPage: true }).catch(() => {});
    } finally { await context.close(); }
    console.log(JSON.stringify({ name: entry.name, width, status: entry.status, failedStep: entry.failedStep, browserErrors: entry.browserErrors }));
    if (entry.status === "FAILED") break allCases;
  }
  report.status = report.cases.length === cases.length * widths.length && report.cases.every(item => item.status === "PASSED") ? "PASSED" : "FAILED";
} finally { await browser.close(); await writeFile(`${output}/verification.json`, JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ status: report.status, cases: report.cases.length, passed: report.cases.filter(item => item.status === "PASSED").length }));
if (report.status !== "PASSED") process.exitCode = 1;
