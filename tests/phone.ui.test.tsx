// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation.js", () => ({ useRouter: () => navigation }));
vi.mock("next/link.js", () => ({ default: ({ children, ...p }: { href: string; children: ReactNode }) => <a {...p}>{children}</a> }));
import { Training } from "../src/frontend/training.js";
import { createApplication } from "../src/application/composition.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";
import { TrainingCore } from "../src/core.js";
import { registeredTemplates } from "../src/application/catalog.js";
import { publicError } from "../src/http/errors.js";
import { answer, deferred } from "./openai.fixtures.js";
import { startPinnedStory } from "./call-foundation.helpers.js";

const user = { id: "phone-ui-user" };
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function harness(pending = false) {
  const repository = new InMemoryTrainingRepository();
  const provider = new MockScenarioModelProvider();
  const app = await createApplication(repository, provider, () => 1000, undefined, () => "CC-01");
  const initial = await startPinnedStory(repository, app, user, "CC-01", 5, () => 1000);
  const id = initial.sessionId;
  if (pending) {
    const core = await TrainingCore.create(registeredTemplates, repository, () => 1000);
    await core.submit({ sessionId: id, ownerId: user.id, actionId: "answer", expectedRevision: 0, action: { kind: "PROGRESS", transitionId: "ANSWER_CALL" } });
  }
  const fetcher = vi.fn(async (path: string, options?: { body?: string }) => {
    try {
      const operation = path.split("/").at(-1), body = options?.body ? JSON.parse(options.body) : null;
      const data = operation === id ? await app.resume(id, user) : operation === "action" ? await app.action(id, user, body)
        : operation === "message" ? await app.message(id, user, body) : operation === "opening" ? await app.opening(id, user, body)
          : operation === "quit" ? await app.quit(id, user, body) : null;
      return Response.json({ data });
    } catch (error) { const e = publicError(error); return Response.json(e.body, { status: e.status }); }
  });
  vi.stubGlobal("fetch", fetcher);
  render(<Training sessionId={id} />);
  await screen.findByRole("region", { name: "โทรศัพท์จำลอง" });
  return { app, repository, id, provider, fetcher };
}
async function answerCall() {
  fireEvent.click(screen.getByRole("button", { name: "รับสาย" }));
  await screen.findByLabelText("ตอบผู้โทรด้วยข้อความ");
  const phone = screen.getByRole("region", { name: "โทรศัพท์จำลอง" });
  expect(phone.querySelector('.phone-voice-controls')).not.toBeNull();
  expect(phone.textContent).not.toContain("โหมดเสียงเดิม");
  expect(screen.getByRole("log", { name: "บทถอดเสียงสายจำลอง" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "กดเพื่อพูด" })).toBeTruthy();
}
async function contextual(label: string, choice = false) {
  fireEvent.click(screen.getByRole("button", { name: "ตัวเลือกขณะนี้" }));
  await screen.findByRole("dialog", { name: "ตัวเลือกในขั้นตอนปัจจุบัน" });
  if (choice) {
    fireEvent.click(screen.getAllByRole("radio")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันคำตอบ" }));
  } else fireEvent.click(screen.getByRole("button", { name: label }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "ตัวเลือกในขั้นตอนปัจจุบัน" })).toBeNull());
}
it("Call Center uses a neutral incoming phone instead of a generic chat/checkpoint panel", async () => {
  const h = await harness();
  expect(screen.getByText("ผู้ติดต่อไม่รู้จัก")).toBeTruthy();
  expect(screen.getByRole("button", { name: "รับสาย" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "ปฏิเสธสาย" })).toBeTruthy();
  expect(document.querySelector(".training-grid, .action-panel, .chat-panel")).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(document.body.textContent).not.toMatch(/SCAM_CALL|NORMAL_CALL|CC-01|CC-02|SAFE|WRONG|DANGER|CORRECT/);
  expect(h.provider.callCount).toBe(0);
});
it("answer creates the first caller transcript before any typed learner response", async () => {
  const h = await harness(); await answerCall();
  expect(screen.getByRole("log").textContent).toContain("MITJEE Parcel");
  const raw = await h.repository.get(h.id, user.id);
  expect(raw.messages.map(m => m.role)).toEqual(["character"]);
  expect(document.querySelector(".message, .message-user, .message-character")).toBeNull();
  const body = JSON.parse(h.fetcher.mock.calls[1]![1]!.body!);
  expect(Object.keys(body).sort()).toEqual(["actionDefinitionId", "actionId", "expectedRevision", "payload"]);
  expect(body.payload).toEqual({});
});
it("slow provider shows connected PENDING automatically; no recovery button or decision is shown before commit", async () => {
  const h = await harness(), late = deferred<ReturnType<typeof answer>>();
  const generate = vi.spyOn(h.provider, "generateCharacterResponse").mockImplementation(() => late.promise);
  fireEvent.click(screen.getByRole("button", { name: "รับสาย" }));
  await screen.findByText("เชื่อมต่อสายแล้ว กำลังรอบทพูดจากผู้โทร");
  expect(screen.queryByRole("button", { name: "รับสาย" })).toBeNull();
  expect(screen.queryByRole("button", { name: "ตัวเลือกขณะนี้" })).toBeNull();
  expect(screen.queryByRole("button", { name: /ลองรับบทพูด/ })).toBeNull();
  const pending = await h.repository.get(h.id, user.id);
  expect(pending).toMatchObject({ state: "CALL_CONNECTED", revision: 1, messages: [], dialogueTurns: [], opportunities: [] });
  await waitFor(() => expect(generate).toHaveBeenCalledOnce());
  late.resolve(answer()); await screen.findByLabelText("ตอบผู้โทรด้วยข้อความ");
  expect(h.fetcher.mock.calls.filter(c => c[0].endsWith("/opening"))).toHaveLength(1);
  generate.mockRestore();
});
it("declining shows no official result and does not call the model", async () => {
  const h = await harness(); fireEvent.click(screen.getByRole("button", { name: "ปฏิเสธสาย" }));
  await screen.findByText("ปฏิเสธสายแล้ว");
  expect(screen.getByText("รอบนี้ไม่มีผลประเมินอย่างเป็นทางการ")).toBeTruthy();
  expect(screen.queryByRole("link", { name: /ดูผลการฝึก/ })).toBeNull(); expect(h.provider.callCount).toBe(0);
});
it("actions appear only in an explicitly opened contextual sheet and future steps are absent", async () => {
  await harness(); await answerCall();
  expect(screen.queryByText("พิจารณาข้อมูลผู้โทร")).toBeNull();
  expect(screen.queryByText("เลือกวิธีจัดการสาย")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "ตัวเลือกขณะนี้" }));
  const sheet = await screen.findByRole("dialog", { name: "ตัวเลือกในขั้นตอนปัจจุบัน" });
  expect(sheet.textContent).not.toContain("คุณจะทำอะไรต่อ?"); expect(sheet.textContent).not.toContain("เปิดข้อความ");
  expect(sheet.textContent).toContain("ดำเนินบทสนทนาต่อ");
  fireEvent.keyDown(sheet, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "ตัวเลือกขณะนี้" }));
});
it("text fallback remains a transcript and has no state/evaluation authority", async () => {
  const h = await harness(); await answerCall();
  const before = await h.repository.get(h.id, user.id);
  fireEvent.change(screen.getByLabelText("ตอบผู้โทรด้วยข้อความ"), { target: { value: "เขาขอให้ผมโอนเงิน" } });
  fireEvent.click(screen.getByRole("button", { name: "ส่งข้อความ" }));
  await screen.findByText("เขาขอให้ผมโอนเงิน", { selector: "p" });
  const after = await h.repository.get(h.id, user.id);
  expect(after.state).toBe(before.state); expect(after.events).toEqual(before.events); expect(after.opportunities).toEqual(before.opportunities); expect(after.result).toBeNull();
});
it("state-gated caller information navigation preserves transcript and records observation, not verification", async () => {
  await harness(); await answerCall();
  expect(screen.getByRole("navigation", { name: "แอปภายในโทรศัพท์" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "ธนาคารจำลอง" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "ข้อมูลผู้โทร" }));
  await screen.findByRole("heading", { name: "ข้อมูลที่ผู้โทรกล่าวอ้าง" });
  expect(screen.getByText("ข้อมูลนี้ไม่ใช่การยืนยันตัวตนผู้โทร")).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "กลับสายสนทนา" }));
  await screen.findByRole("log");
  expect(document.body.textContent).not.toMatch(/Part 1|Part 2|scaffold/);
});
it("refresh recovery for a pending opening does not require a fabricated user message", async () => {
  const h = await harness(true);
  await screen.findByLabelText("ตอบผู้โทรด้วยข้อความ");
  expect(h.provider.callCount).toBe(1);
  expect(screen.queryByRole("button", { name: /รับบทพูดผู้โทรต่อ/ })).toBeNull();
  expect(h.fetcher.mock.calls.filter(c => c[0].endsWith("/opening"))).toHaveLength(1);
  const raw = await h.repository.get(h.id, user.id);
  expect(raw.messages.map(m => m.role)).toEqual(["character"]);
  expect(JSON.parse(h.fetcher.mock.calls[1]![1]!.body!)).toEqual({ expectedRevision: 1 });
});
it("full contextual phone journey reaches call ending then the actual result link", async () => {
  const h = await harness(); await answerCall();
  await contextual("วางสาย");
  await screen.findByText("สิ้นสุดสายจำลอง");
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "ดูสรุปการฝึก" }));
  const link = await screen.findByRole("link", { name: /ดูผลการฝึก/ });
  expect(link.getAttribute("href")).toBe(`/training/${h.id}/result`);
  expect(await h.app.result(h.id, user)).toMatchObject({ outcome: "UNASSESSED", trainingScore: null, decisionSummary: { encountered: 0 } });
});
