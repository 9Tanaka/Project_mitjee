// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { Result } from "../src/frontend/result.js";
import { learningHarness } from "./post-decision.helpers.js";
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation.js", () => ({ useRouter: () => router }));
vi.mock("next/link.js", () => ({ default: ({ children, scroll: _scroll, ...props }: { children: ReactNode; href: string; scroll?: boolean }) => <a {...props}>{children}</a> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function show(result: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: result })));
  render(<Result sessionId="test-result" />); await screen.findByRole("heading", { name: "ผลการฝึกของคุณ" });
}
it.each(["CC-01", "CC-02"] as const)("%s PASSED celebrates the encountered path without recovery or numerical scores", async story => {
  const h = await learningHarness(story); await h.safe(); await show(await h.result());
  expect(screen.getByRole("heading", { name: "ผ่านการฝึก" })).toBeTruthy();
  expect(screen.getByText("สิ่งที่ปรากฏในสายนี้")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "ถ้าเหตุการณ์ลักษณะนี้เกิดขึ้นจริง" })).toBeNull();
  expect(document.body.textContent).not.toMatch(/คะแนนรวม|สัญญาณเตือนที่คุณตรวจพบ|คุณสูญเงิน|คุณถูกหลอก/);
});
it("NEEDS_PRACTICE explains the encountered REVIEW and safer alternative without claiming harm", async () => {
  const h = await learningHarness(); await h.context(); await h.choose("trust"); await h.opening(); await h.action("วางสาย"); await show(await h.result());
  expect(screen.getByRole("heading", { name: "ควรฝึกเพิ่มเติม" })).toBeTruthy();
  expect(screen.getByText("เชื่อคำกล่าวอ้างโดยยังไม่ได้ตรวจสอบ")).toBeTruthy();
  expect(screen.getAllByText(/แนวทางสำหรับครั้งต่อไป/).length).toBeGreaterThan(0);
  expect(screen.queryByRole("heading", { name: "ถ้าเหตุการณ์ลักษณะนี้เกิดขึ้นจริง" })).toBeNull();
});
it.each(["CC-01", "CC-02"] as const)("%s critical result shows only its matching confirmed-action recovery", async story => {
  const h = await learningHarness(story); await h.critical(); const r = await h.result(); await show(r);
  const recovery = screen.getByRole("region", { name: "ถ้าเหตุการณ์ลักษณะนี้เกิดขึ้นจริง" });
  expect(within(recovery).getByRole("heading", { name: new RegExp(r.postDecisionGuidance!.recovery[0]!.confirmedAction) })).toBeTruthy();
  expect(within(recovery).getByRole("heading", { name: "หลักฐานที่ควรเก็บ" })).toBeTruthy();
  expect(recovery.textContent).toContain(story === "CC-01" ? "หยุดโอนเงินเพิ่ม" : "แจ้งว่าได้เปิดเผย OTP");
  expect(recovery.textContent).not.toContain(story === "CC-01" ? "แจ้งว่าได้เปิดเผย OTP" : "หยุดโอนเงินเพิ่ม");
  expect(within(recovery).getAllByRole("link").every(a => a.getAttribute("rel") === "noopener noreferrer")).toBe(true);
  expect(document.querySelectorAll("input")).toHaveLength(0);
});
it("UNASSESSED early exit exposes no future checkpoint, warning or recovery", async () => {
  const h = await learningHarness(); await h.action("รับสาย"); await h.action("วางสาย"); await show(await h.result());
  expect(screen.getByRole("heading", { name: "ยังประเมินไม่ได้" })).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/OTP|โอนเงิน|คุณถูกหลอก/);
  expect(screen.queryByRole("heading", { name: "ถ้าเหตุการณ์ลักษณะนี้เกิดขึ้นจริง" })).toBeNull();
});
it.each(["CC-N01", "CC-N02"] as const)("%s normal call teaches context without invented scam warnings or recovery", async story => {
  const h = await learningHarness(story); await h.safe(); await show(await h.result());
  expect(screen.getByRole("heading", { name: story === "CC-N01" ? "การยืนยันช่วงจัดส่ง" : "การรับทราบรายการทั่วไป" })).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/OTP|โอนเงิน|ความลับ|การเร่งให้ตัดสินใจ/);
});
it("no matching mapping retains the existing Result page unchanged", async () => {
  const h = await learningHarness(); await h.safe(); const r = await h.result(); delete r.postDecisionGuidance; await show(r);
  expect(screen.getByRole("heading", { name: "เหตุผลของแต่ละจุดที่พบ" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "บทเรียนจากสถานการณ์" })).toBeNull();
  expect(screen.getByRole("link", { name: "ไปหน้า Quiz →" })).toBeTruthy();
});
it("retry, tutorial and list navigation use existing routes and native accessible links", async () => {
  const h = await learningHarness(); await h.safe(); await show(await h.result());
  const nav = screen.getByRole("navigation", { name: "ขั้นตอนหลังฝึก" });
  expect(within(nav).getByRole("link", { name: "ลองฝึก Call Center อีกครั้ง" }).getAttribute("href")).toBe("/scenarios/call-center/prepare");
  expect(within(nav).getByRole("link", { name: "กลับหน้าเลือกสถานการณ์" }).getAttribute("href")).toBe("/scenarios");
  const tutorial = within(nav).getByRole("link", { name: "ทบทวนบทเรียน" }); tutorial.focus(); expect(document.activeElement).toBe(tutorial);
  fireEvent.click(tutorial); expect(tutorial.getAttribute("href")).toBe("#call-tutorial");
  expect(document.querySelector("#call-tutorial")?.getAttribute("tabindex")).toBe("-1");
  expect(document.activeElement).toBe(document.querySelector("#call-tutorial"));
});
