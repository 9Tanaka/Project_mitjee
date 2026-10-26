// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { Training } from "../src/frontend/training.js";
import { learningHarness } from "./post-decision.helpers.js";
import { publicError } from "../src/http/errors.js";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation.js", () => ({ useRouter: () => router }));
vi.mock("next/link.js", () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a> }));
// Playback is tested separately with the real VoiceControls component.
vi.mock("../src/frontend/voice.js", () => ({ VoiceControls: () => <div aria-label="call-audio-test-control" /> }));
beforeEach(() => history.replaceState({}, ""));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function show(h: Awaited<ReturnType<typeof learningHarness>>) {
  const requests: { op: string; body: any }[] = [];
  let failNextAction = false, loseNextReply = false;
  vi.stubGlobal("fetch", vi.fn(async (path: string, options?: { body?: string }) => {
    const op = path.split("/").at(-1)!, body = options?.body ? JSON.parse(options.body) : undefined;
    requests.push({ op, body });
    if (op === "action" && failNextAction) { failNextAction = false; return Response.json({ error: { code: "INVALID_ACTION", message: "การกระทำไม่สำเร็จ" } }, { status: 400 }); }
    try {
      const id = h.session().sessionId;
      const data = op === id ? await h.app.resume(id, h.owner) : op === "opening" ? await h.app.opening(id, h.owner, body)
        : op === "action" ? await h.app.action(id, h.owner, body) : op === "message" ? await h.app.message(id, h.owner, body) : null;
      if (op === "action" && loseNextReply) { loseNextReply = false; return new Response(null, { status: 503 }); }
      return Response.json({ data });
    } catch (error) { const failure = publicError(error); return Response.json(failure.body, { status: failure.status }); }
  }));
  const view = render(<Training sessionId={h.session().sessionId} />);
  await screen.findByRole("region", { name: "โทรศัพท์จำลอง" });
  return { view, requests, failAction: () => { failNextAction = true; }, loseActionReply: () => { loseNextReply = true; } };
}
async function choose(label: string) {
  const sheet = await screen.findByRole("dialog", { name: "ตัวเลือกในขั้นตอนปัจจุบัน" });
  fireEvent.click(within(sheet).getByRole("radio", { name: label }));
  fireEvent.click(within(sheet).getByRole("button", { name: "ยืนยันคำตอบ" }));
}

it.each(["caution", "trust"] as const)("committed %s appears as a learner turn before the next caller and survives refresh once", async choice => {
  const h = await learningHarness(); await h.context(); const ui = await show(h);
  const label = h.template.opportunities.find(o => o.state === "CONTEXT_CLAIM" && o.skill === "D")!;
  if (label.skill !== "D") throw new Error("TEST_CHECKPOINT");
  await choose(choice === "trust" ? "เชื่อคำกล่าวอ้างของผู้โทร" : label.choices.find(c => c.id === choice)!.publicLabel!);
  await waitFor(() => expect(document.querySelector('[data-turn-kind="COMMITTED_ACTION"]')).not.toBeNull());
  const actionLine = document.querySelector('[data-turn-kind="COMMITTED_ACTION"]')!;
  expect(actionLine.textContent).toContain("คุณ");
  expect(actionLine.textContent).toContain(choice === "trust" ? "ผมเชื่อข้อมูลที่คุณแจ้งครับ" : "ยังไม่ให้ข้อมูลเพิ่มเติม");
  await waitFor(() => expect(document.querySelector(".phone-training")?.getAttribute("data-caller-status")).toBe("READY"));
  const lines = [...screen.getByRole("log").querySelectorAll(".phone-transcript-line")];
  expect(lines.indexOf(actionLine)).toBeLessThan(lines.length - 1);
  expect(screen.queryByText("คุณถูกหลอกในสถานการณ์จำลอง")).toBeNull();
  const raw = await h.raw(); expect(raw.status).toBe("ACTIVE"); expect(raw.result).toBeNull();
  const request = ui.requests.find(r => r.op === "action")!;
  const replay = await h.app.action(h.session().sessionId, h.owner, request.body);
  expect(replay.duplicate).toBe(true);
  ui.view.unmount(); render(<Training sessionId={h.session().sessionId} />); await screen.findByRole("log");
  expect(document.querySelectorAll('[data-turn-kind="COMMITTED_ACTION"]')).toHaveLength(1);
});

it("failed action has no learner turn, leaves choice actionable, then successful retry records once", async () => {
  const h = await learningHarness(); await h.context(); const ui = await show(h); ui.failAction();
  await choose("ฟังข้อมูลต่อโดยยังไม่ให้ข้อมูลเพิ่มเติม");
  await waitFor(() => expect(screen.getByRole("button", { name: "ยืนยันคำตอบ" }).hasAttribute("disabled")).toBe(false));
  expect(document.querySelectorAll('[data-turn-kind="COMMITTED_ACTION"]')).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันคำตอบ" }));
  await waitFor(() => expect(document.querySelectorAll('[data-turn-kind="COMMITTED_ACTION"]')).toHaveLength(1));
});

it("callback ending shows intended verification without claiming it already succeeded", async () => {
  const h = await learningHarness(); await h.context(); await show(h);
  fireEvent.click(await screen.findByRole("button", { name: "ปิดตัวเลือก" }));
  fireEvent.click(screen.getByText("ตรวจสอบผ่านช่องทางอื่น"));
  fireEvent.click(screen.getByRole("button", { name: "จบสายเพื่อติดต่อช่องทางที่มีอยู่เดิม" }));
  await screen.findByRole("link", { name: "ดูผลการฝึก →" });
  expect(screen.getByRole("log").textContent).toContain("แล้วจะติดต่อผ่านช่องทางที่ผมมีอยู่เอง");
  expect(screen.getByRole("log").textContent).not.toContain("ตรวจสอบสำเร็จแล้ว");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("uncertain committed action retry uses the same request and projects the learner turn only once", async () => {
  const h = await learningHarness(); await h.context(); const ui = await show(h); ui.loseActionReply();
  await choose("ฟังข้อมูลต่อโดยยังไม่ให้ข้อมูลเพิ่มเติม");
  const retry = await screen.findByRole("button", { name: "ลองอีกครั้ง" });
  expect(document.querySelectorAll('[data-turn-kind="COMMITTED_ACTION"]')).toHaveLength(0);
  expect(screen.getByRole("button", { name: "ยืนยันคำตอบ" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(retry);
  await waitFor(() => expect(document.querySelectorAll('[data-turn-kind="COMMITTED_ACTION"]')).toHaveLength(1));
  const calls = ui.requests.filter(r => r.op === "action"); expect(calls).toHaveLength(2); expect(calls[0]!.body).toEqual(calls[1]!.body);
  expect((await h.raw()).opportunities.filter(o => o.finalizedAt !== null)).toHaveLength(1);
});

it.each(["CC-01", "CC-02"] as const)("%s confirmed critical action stops the caller and announces the exact simulated action", async story => {
  const h = await learningHarness(story); await h.main();
  const transfer = story === "CC-01";
  await h.action(transfer ? "เปิดธนาคารจำลอง" : "เปิดข้อความ");
  await h.action(transfer ? "ดูรายละเอียดการโอนจำลอง" : "อ่านรหัสในข้อความจำลอง");
  await h.action(transfer ? "เตรียมยืนยันการโอนจำลอง" : "เตรียมยืนยันการบอกรหัสจำลอง");
  const confirm = h.session().availableActions.find(a => a.input === "CONFIRM")!;
  const before = await h.raw(); const ui = await show(h);
  fireEvent.click(screen.getByRole("button", { name: transfer ? confirm.label : "บอกรหัสจำลองแก่ผู้โทร" }));
  fireEvent.click(screen.getByRole("button", { name: transfer ? "ยืนยันการกระทำจำลอง" : "ยืนยันบอกรหัสจำลอง" }));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("คุณถูกหลอกในสถานการณ์จำลอง");
  expect(document.activeElement).toBe(alert);
  expect(screen.getByRole("log").lastElementChild?.previousElementSibling?.textContent).toContain(transfer ? "ยืนยันโอนเงินจำลอง 9,300" : "ยืนยันบอกรหัส OTP จำลอง");
  expect(within(alert).getByRole("link", { name: "ดูผลและวิธีรับมือ" }).getAttribute("href")).toBe(`/training/${h.session().sessionId}/result`);
  expect(screen.queryByLabelText("call-audio-test-control")).toBeNull();
  expect(screen.queryByLabelText("ตอบผู้โทรด้วยข้อความ")).toBeNull();
  expect(ui.requests.filter(r => r.op === "opening" || r.op === "message")).toHaveLength(0);
  const after = await h.raw(); expect(after.messages).toEqual(before.messages);
  expect(after.result?.outcome).toBe("CRITICAL_FAILURE"); expect(after.result?.trainingScore).toBeNull();
  expect((await h.result()).postDecisionGuidance?.recovery).toHaveLength(1);
});

it.each(["CC-N01", "CC-N02"] as const)("%s normal completion keeps a neutral learner turn and ordinary result navigation", async story => {
  const h = await learningHarness(story); await h.main(); await show(h);
  await choose(story === "CC-N01" ? "ยืนยันช่วงจัดส่งจำลอง" : "รับทราบข้อมูลรายการ");
  await screen.findByRole("link", { name: "ดูผลการฝึก →" });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("log").textContent).toContain(story === "CC-N01" ? "ยืนยันช่วงจัดส่ง" : "รับทราบข้อมูลรายการที่แจ้ง");
  expect(screen.getByRole("log").textContent).not.toMatch(/ถูกหลอก|OTP|โอนเงิน/);
  const result = await h.result(); expect(result.outcome).toBe("PASSED"); expect(result.trainingScore).toBeNull();
  expect(result.postDecisionGuidance?.recovery).toEqual([]);
});
