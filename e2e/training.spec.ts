import { test, expect, type Page } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";

// Real browser + production Next + dedicated MySQL. No route mocks, fake cookies,
// stored auth state, or screenshots/traces/videos while credentials are entered.
async function account(page: Page) {
  const email = randomUUID() + "@example.test", secret = randomBytes(24).toString("base64url");
  await page.goto("/register");
  await page.getByLabel("อีเมล", { exact: true }).fill(email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(secret);
  await page.getByLabel("ยืนยันรหัสผ่าน", { exact: true }).fill(secret);
  await page.getByRole("button", { name: "สร้างบัญชี" }).click();
  await expect(page).toHaveURL(/\/login\?registered=1$/);
  await expect(page.getByText("สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ")).toBeVisible();
  expect((await page.request.get("/api/scenarios")).status()).toBe(401);
  await page.getByLabel("อีเมล", { exact: true }).fill(email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(secret);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page).toHaveURL(/\/scenarios$/);
  await expect(page.getByRole("button", { name: "เริ่มฝึกสถานการณ์" })).toHaveCount(9);
}
async function start(page: Page) {
  await page.locator(".scenario-card").filter({ has: page.getByRole("heading", { name: "SMS แจ้งพัสดุจากผู้ส่งสมมติ" }) }).getByRole("button", { name: "เริ่มฝึกสถานการณ์" }).click();
  await expect(page).toHaveURL(/\/training\/[^/]+$/);
  await expect(page.getByLabel("ข้อความของคุณ")).toBeVisible();
}
async function choice(page: Page, label: string) {
  const radio = page.getByRole("radio", { name: label, exact: true });
  const field = page.locator("fieldset").filter({ has: radio });
  await radio.check(); await field.getByRole("button", { name: "ยืนยันคำตอบ", exact: true }).click();
  await expect(radio).toHaveCount(0);
}
async function reachRequest(page: Page) {
  await choice(page, "ตรวจสอบผู้ส่งจากช่องทางอื่น");
  await page.getByRole("button", { name: "ดูข้อความ", exact: true }).click();
  await page.getByRole("checkbox", { name: /ลิงก์ parcel-check/ }).check();
  await page.getByRole("checkbox", { name: /อ้างว่าจะยกเลิกพัสดุ/ }).check();
  await page.getByRole("button", { name: "ยืนยันหลักฐาน" }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "พิจารณาคำขอในข้อความ", exact: true }).click();
  await expect(page.getByRole("radio", { name: "ปฏิเสธการให้ข้อมูล", exact: true })).toBeVisible();
}
async function capture(page: Page, name: string, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "frontend-artifacts/" + name + ".png", fullPage: true });
}
test("real register/login, resumed multi-turn safe path, result, logout, responsive layouts", async ({ page }) => {
  const pageErrors: string[] = []; page.on("pageerror", () => pageErrors.push("browser error"));
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "ข้ามไปยังเนื้อหา" })).toBeFocused();
  await page.keyboard.press("Enter"); await expect(page.getByRole("main")).toBeFocused();
  await capture(page, "landing-desktop", 1440); await capture(page, "landing-mobile", 375);
  await page.goto("/login"); await capture(page, "login-mobile", 375);
  await account(page);
  await page.reload(); await expect(page.getByRole("button", { name: "เริ่มฝึกสถานการณ์" })).toHaveCount(9);
  await capture(page, "scenarios-tablet", 768); await start(page);
  const sessionPath = new URL(page.url()).pathname;
  await page.reload(); await expect(page.getByLabel("ข้อความของคุณ")).toBeVisible();
  for (const text of ["ขอตรวจสอบกับช่องทางทางการก่อน", "ฉันจะไม่ส่งข้อมูลส่วนตัว"]) {
    await page.getByLabel("ข้อความของคุณ").fill(text);
    await page.getByRole("button", { name: "ส่งข้อความ" }).click();
    await expect(page.getByRole("log").getByText(text, { exact: true })).toBeVisible();
    await expect(page.getByLabel("ข้อความของคุณ")).toHaveValue("");
  }
  await capture(page, "training-desktop", 1440); await capture(page, "training-mobile", 375);
  await reachRequest(page);
  await choice(page, "ปฏิเสธการให้ข้อมูล");
  await page.getByRole("button", { name: "ไปขั้นตอนตอบสนอง", exact: true }).click();
  await choice(page, "ตรวจสอบกับช่องทางทางการ");
  await choice(page, "ตรวจสอบ ยุติการติดต่อ และรายงาน");
  await page.getByRole("button", { name: "จบแบบฝึก", exact: true }).click();
  await page.getByRole("link", { name: "ดูผลการฝึก" }).click();
  await expect(page.getByRole("heading", { name: "ผ่านการฝึก", exact: true })).toBeVisible();
  const result = (await (await page.request.get("/api" + sessionPath + "/result")).json()).data;
  expect(result).toMatchObject({ D: null, W: null, S: null, trainingScore: null, outcome: "PASSED", evaluationMode: "DECISION_RULES_V1", decisionSummary: { safe: 5, review: 0, unassessed: 0 } });
  await capture(page, "result-mobile", 375); await capture(page, "result-desktop", 1440);
  expect(await page.locator("body").innerText()).not.toMatch(/DISCLOSE_OTP|ownerId|AUTH_SECRET|JWT|passwordHash/);
  await page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api" + sessionPath)).status()).toBe(401);
  await page.goto(sessionPath); await expect(page).toHaveURL(/\/login$/);
  expect(pageErrors).toEqual([]);
});
test("explicit simulated confirmation, cancellation, critical result and quit use real API", async ({ page }) => {
  await account(page); await start(page); await reachRequest(page);
  await page.getByRole("button", { name: "ยืนยันการส่งรหัส OTP จำลอง (ไม่ใช้รหัสจริง)", exact: true }).click();
  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(page.getByLabel("ข้อความของคุณ")).toBeVisible();
  await page.getByRole("button", { name: "ยืนยันการส่งรหัส OTP จำลอง (ไม่ใช้รหัสจริง)", exact: true }).click();
  await page.getByRole("button", { name: "ยืนยันการกระทำจำลอง", exact: true }).click();
  await page.getByRole("link", { name: "ดูผลการฝึก" }).click();
  await expect(page.getByRole("heading", { name: "พบการกระทำที่มีความเสี่ยงสำคัญ" })).toBeVisible();
  await page.getByRole("link", { name: "กลับไปเลือกสถานการณ์" }).click(); await start(page);
  await page.getByRole("button", { name: "ออกจากสถานการณ์", exact: true }).click();
  await page.getByRole("button", { name: "ยืนยันออกจากสถานการณ์", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ออกจากรอบฝึกแล้ว" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ดูผลการฝึก" })).toHaveCount(0);
});
test("two real tabs reject stale revision, refetch and never automatically resubmit", async ({ page, context }) => {
  await account(page); await start(page);
  const other = await context.newPage(); await other.goto(page.url());
  await expect(other.getByRole("radio", { name: "ตรวจสอบผู้ส่งจากช่องทางอื่น", exact: true })).toBeVisible();
  await choice(page, "ตรวจสอบผู้ส่งจากช่องทางอื่น");
  await other.getByRole("radio", { name: "ตรวจสอบผู้ส่งจากช่องทางอื่น", exact: true }).check();
  await other.getByRole("button", { name: "ยืนยันคำตอบ", exact: true }).click();
  await expect(other.getByRole("alert").filter({ hasText: "เปลี่ยน" })).toBeVisible();
  await expect(other.getByRole("radio")).toHaveCount(0);
  const path = "/api" + new URL(page.url()).pathname;
  const data = (await (await page.request.get(path)).json()).data;
  expect(data.revision).toBe(1);
  await other.close();
});

test("investment safe path preserves finalized assessments across browser refreshes and real MySQL", async ({ page }) => {
  await account(page);
  await page.locator(".scenario-card").filter({ has: page.getByRole("heading", { name: "ข้อเสนอการลงทุนผลตอบแทนสูง", exact: true }) })
    .getByRole("button", { name: "เริ่มฝึกสถานการณ์" }).click();
  await expect(page).toHaveURL(/\/training\/[^/]+$/);
  const apiPath = "/api" + new URL(page.url()).pathname;
  await expect(page.getByRole("radio", { name: "ตรวจสอบจากช่องทางอื่น", exact: true })).toBeVisible();
  const before = (await (await page.request.get(apiPath)).json()).data;
  await page.getByLabel("ข้อความของคุณ").fill("ขอตรวจสอบข้อมูลผ่านช่องทางอิสระก่อน");
  await page.getByRole("button", { name: "ส่งข้อความ", exact: true }).click();
  await expect(page.getByLabel("ข้อความของคุณ")).toHaveValue("");
  const afterDialogue = (await (await page.request.get(apiPath)).json()).data;
  expect(afterDialogue.currentStatePublicLabel).toBe(before.currentStatePublicLabel);
  expect(afterDialogue.availableActions).toEqual(before.availableActions);

  await choice(page, "ตรวจสอบจากช่องทางอื่น");
  await page.reload();
  await page.getByRole("button", { name: "พิจารณาข้ออ้างต่อ", exact: true }).click();
  await page.getByRole("checkbox", { name: "หน้าจอยอดกำไรจำลองแสดงผลตอบแทนสูงผิดปกติ", exact: true }).check();
  await page.getByRole("checkbox", { name: "เร่งให้โอนค่าปลดล็อกก่อนถอนกำไร", exact: true }).check();
  await page.getByRole("button", { name: "ยืนยันหลักฐาน", exact: true }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "พิจารณาคำขอ", exact: true }).click();
  await choice(page, "ปฏิเสธคำขอและตรวจสอบ");
  await page.reload();
  await page.getByRole("button", { name: "เลือกวิธีรับมือ", exact: true }).click();
  await choice(page, "ตรวจสอบ ยุติ และรายงาน");
  await page.reload();
  await page.getByRole("button", { name: "จบสถานการณ์", exact: true }).click();
  await page.getByRole("link", { name: "ดูผลการฝึก" }).click();
  await expect(page.getByRole("heading", { name: "ผ่านการฝึก", exact: true })).toBeVisible();
  const result = (await (await page.request.get(apiPath + "/result")).json()).data;
  expect(result).toMatchObject({ outcome: "PASSED", evaluationMode: "DECISION_RULES_V1", trainingScore: null,
    decisionSummary: { encountered: 4, safe: 4, review: 0, unassessed: 0 } });
  expect(result.decisionSummary.checkpoints.map((c: { assessment: string }) => c.assessment)).toEqual(["SAFE", "SAFE", "SAFE", "SAFE"]);
  expect(JSON.stringify(result)).not.toMatch(/ruleId|ownerId|criticalFailureRules|eventCodes/);
});

test("real Quiz Pre/Post saves, resumes, submits and compares the frozen baseline", async ({ page }) => {
  await account(page); await page.getByRole("link", { name: "Quiz", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ลองวัดความรู้ก่อนและหลังฝึก" })).toBeVisible();
  async function round(mode: "Pre-test" | "Post-test") {
    await page.getByRole("button", { name: "เริ่ม " + mode, exact: true }).click();
    await expect(page).toHaveURL(/\/quiz\/q-[a-f0-9]+$/);
    const path = "/api/quiz/attempts/" + new URL(page.url()).pathname.split("/").at(-1);
    const active = (await (await page.request.get(path)).json()).data;
    expect(JSON.stringify(active)).not.toMatch(/correctOptionId|explanation|source|ownerId|receipts/);
    const selected: Record<string,string> = {};
    for (let i=0;i<20;i++) {
      await page.getByRole("button", { name: new RegExp(`^ไปข้อ ${i+1} `) }).click();
      await expect(page.locator("fieldset legend")).toHaveText(active.questions[i].prompt);
      const radio = page.getByRole("radio").first(); selected[active.questions[i].id] = (await radio.getAttribute("value"))!;
      await radio.check();
      const acknowledgement = page.waitForResponse(response => response.url().endsWith(path + "/save") && response.request().method() === "POST");
      await page.getByRole("button", { name: i===19 ? "บันทึกคำตอบ" : "บันทึกและไปข้อต่อไป", exact: true }).click();
      expect((await acknowledgement).status()).toBe(200);
      if (i===0) {
        await page.reload(); await expect(page.getByRole("radio").first()).toBeChecked();
        await capture(page, "quiz-" + mode.toLowerCase() + "-mobile", 375);
      }
    }
    await page.getByRole("button", { name: "ส่งคำตอบและดูผล", exact: true }).click();
    await expect(page.getByRole("heading", { name: "ผล Quiz ของคุณ" })).toBeVisible();
    const final = (await (await page.request.get(path)).json()).data;
    expect(final.status).toBe("COMPLETED"); expect(final.answers).toEqual(selected);
    expect(final.result.correct).toBe(final.questions.filter((q: {id:string;review:{correctOptionId:string}})=>selected[q.id]===q.review.correctOptionId).length);
    await expect(page.getByRole("link", { name: /อ่านแนวทางเพิ่มเติม/ })).toHaveCount(20);
    await page.reload(); await expect(page.getByRole("heading", { name: "ผล Quiz ของคุณ" })).toBeVisible();
    await page.getByRole("link", { name: "กลับไปหน้า Quiz", exact: true }).click();
    return final;
  }
  const pre = await round("Pre-test"); const post = await round("Post-test");
  expect(post.result.baseline.attemptId).toBe(pre.id);
  expect(post.result.changePercentagePoints).toBe(post.result.percentage-pre.result.percentage);
  await expect(page.getByRole("link", { name: "ดูผลและเฉลย →", exact: true })).toHaveCount(2);
});
