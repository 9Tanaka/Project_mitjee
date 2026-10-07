// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation.js", () => ({ useRouter: () => router }));
vi.mock("next/link.js", () => ({ default: ({ children, ...p }: { href: string; children: ReactNode }) => <a {...p}>{children}</a> }));
import { Training } from "../src/frontend/training.js";
import { createApplication } from "../src/application/composition.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";
import { publicError } from "../src/http/errors.js";

beforeEach(() => { history.replaceState({}, ""); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function ui() {
  const repo = new InMemoryTrainingRepository(), owner = { id: randomUUID() };
  const app = await createApplication(repo, new MockScenarioModelProvider(), Date.now, undefined, () => "CC-02");
  const initial = (await app.start("call-center", owner, { startId: randomUUID(), expectedRevision: 0 })).session;
  const id = initial.sessionId;
  vi.stubGlobal("fetch", vi.fn(async (path: string, options?: { body?: string }) => {
    try { const op = path.split("/").at(-1)!, b = options?.body ? JSON.parse(options.body) : null;
      const data = op === id ? await app.resume(id, owner) : op === "opening" ? await app.opening(id, owner, b)
        : op === "message" ? await app.message(id, owner, b) : op === "action" ? await app.action(id, owner, b) : null;
      return Response.json({ data });
    } catch (error) { const r = publicError(error); return Response.json(r.body, { status: r.status }); }
  }));
  const view = render(<Training sessionId={id} />); await screen.findByRole("button", { name: "รับสาย" });
  fireEvent.click(screen.getByRole("button", { name: "รับสาย" })); await screen.findByLabelText("ตอบผู้โทรด้วยข้อความ");
  await waitFor(() => expect(document.querySelector(".phone-training")?.getAttribute("data-call-state")).toBe("IDENTITY_CLAIM"));
  async function say(text: string) { fireEvent.change(screen.getByLabelText("ตอบผู้โทรด้วยข้อความ"), { target: { value: text } }); fireEvent.click(screen.getByRole("button", { name: "ส่งข้อความ" })); await waitFor(() => expect((screen.queryByLabelText("ตอบผู้โทรด้วยข้อความ") as HTMLTextAreaElement)?.value ?? "").toBe("")); }
  async function context() { await say("ขอชื่อหน่อย"); await say("ขอเลขอ้างอิงด้วย"); return screen.findByRole("dialog", { name: "ตัวเลือกในขั้นตอนปัจจุบัน" }); }
  return { view, context, say, app, repo, owner, id };
}
it("ordinary conversation has no giant menu or generic progression/question buttons; hangup stays visible", async () => {
  const h = await ui(); expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "วางสาย" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "กดเพื่อพูด" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /ดำเนินบทสนทนาต่อ|ฟังคำขอ|ขอชื่อและฝ่าย|ขอข้อมูลอ้างอิง|ขอคำอธิบาย/ })).toBeNull();
  await h.say("ขอชื่อหน่อย"); expect(screen.queryByRole("dialog")).toBeNull();
});
it("backend contextual popup contains choices, not apps/hangup; selection closes and conversation proceeds", async () => {
  const h = await ui(), sheet = await h.context();
  expect(within(sheet).queryByRole("button", { name: /เปิด|วางสาย|จบสาย|ดำเนินบทสนทนา|ฟังคำขอ/ })).toBeNull();
  expect(within(sheet).queryByText(/SAFE|RISKY|SCAM|NORMAL|คุณพบสัญญาณเตือน/)).toBeNull();
  fireEvent.click(within(sheet).getByRole("radio", { name: "ฟังข้อมูลต่อโดยยังไม่ให้ข้อมูลเพิ่มเติม" }));
  fireEvent.click(within(sheet).getByRole("button", { name: "ยืนยันคำตอบ" }));
  await waitFor(() => expect(document.querySelector(".phone-training")?.getAttribute("data-call-state")).toBe("PRESSURE"));
  expect((await h.repo.get(h.id, h.owner.id)).opportunities.find(o => o.state === "CONTEXT_CLAIM")?.finalizedAt).not.toBeNull();
});
it("dismiss/refresh does not auto-open the same decision; explicit reopen remains possible", async () => {
  const h = await ui(); await h.context(); fireEvent.click(screen.getByRole("button", { name: "ปิดตัวเลือก" }));
  h.view.unmount(); render(<Training sessionId={h.id} />); await screen.findByLabelText("ตอบผู้โทรด้วยข้อความ");
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "ตัวเลือกขณะนี้" })); expect(screen.getByRole("dialog")).toBeTruthy();
  expect((await h.repo.get(h.id, h.owner.id)).opportunities).toHaveLength(1);
});
it("persistent hangup and quit confirmation work while an internal phone app is open", async () => {
  await ui(); fireEvent.click(screen.getByRole("button", { name: "ข้อมูลผู้โทร" }));
  await screen.findByRole("heading", { name: "ข้อมูลที่ผู้โทรกล่าวอ้าง" });
  expect(screen.getByRole("button", { name: "วางสาย" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "ออกจากรอบฝึก" }));
  expect(screen.getByRole("dialog", { name: "ยืนยันออกจากรอบฝึก" })).toBeTruthy();
});
