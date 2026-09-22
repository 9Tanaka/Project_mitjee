// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), status: "unauthenticated" }));
vi.mock("next/navigation.js", () => ({ useRouter: () => router }));
const router = { push: mocks.push, replace: mocks.replace, refresh: mocks.refresh };
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: mocks.status }), signIn: mocks.signIn, signOut: mocks.signOut, SessionProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("next/link.js", () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a> }));
import { AuthForm, AuthGate, AuthNavigation } from "../src/frontend/auth.js";
import { ScenarioList } from "../src/frontend/scenarios.js";
import { Training } from "../src/frontend/training.js";
import { Result } from "../src/frontend/result.js";
import { ActionControl } from "../src/frontend/actions.js";
import { sessionDto } from "../src/public-api/contracts.js";

const scenario = { id: "public-scenario", title: "สถานการณ์จาก API", category: "SMS_PHISHING", description: "ข้อความสมมติจากระบบ", learningObjectives: ["ทักษะจาก API"], communicationMode: "TEXT" as const };
const choice = { id: "opaque-action", label: "เลือกการตอบสนอง", input: "CHOICE" as const, options: [{ id: "opaque-option", label: "ตัวเลือกจากระบบ" }] };
const snapshot = (revision = 0) => sessionDto.parse({ sessionId: "public-session", scenario, status: "ACTIVE", currentStatePublicLabel: "ขั้นตอนจาก API", revision, messages: [], availableActions: [choice] });
const reply = (data: unknown, status = 200) => Response.json({ data }, { status });
const failure = (code: string, status: number) => Response.json({ error: { code, message: "PRIVATE_DETAILS" } }, { status });
const password = () => randomUUID();
const fetcher = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); mocks.status = "unauthenticated"; mocks.signIn.mockResolvedValue({ ok: true }); mocks.signOut.mockResolvedValue({ url: "/login" });
  vi.stubGlobal("fetch", fetcher); fetcher.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function fillAuth(mode: "login" | "register", value: string = password()) {
  fireEvent.change(screen.getByLabelText("อีเมล"), { target: { value: "synthetic@example.test" } });
  fireEvent.change(screen.getByLabelText("รหัสผ่าน"), { target: { value } });
  if (mode === "register") fireEvent.change(screen.getByLabelText("ยืนยันรหัสผ่าน"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: mode === "register" ? "สร้างบัญชี" : "เข้าสู่ระบบ" }));
  return value;
}
it.each(["short", "ก".repeat(25)])("registration validates Unicode/byte limit %# without API work", async value => {
  render(<AuthForm mode="register" />); fillAuth("register", value);
  expect(screen.getByRole("alert").textContent).toContain("12"); expect(fetcher).not.toHaveBeenCalled();
});
it("confirmation mismatch is client-only validation", () => {
  render(<AuthForm mode="register" />);
  fireEvent.change(screen.getByLabelText("อีเมล"), { target: { value: "synthetic@example.test" } });
  fireEvent.change(screen.getByLabelText("รหัสผ่าน"), { target: { value: password() } });
  fireEvent.change(screen.getByLabelText("ยืนยันรหัสผ่าน"), { target: { value: password() } });
  fireEvent.click(screen.getByRole("button", { name: "สร้างบัญชี" }));
  expect(screen.getByRole("alert").textContent).toContain("ไม่ตรงกัน"); expect(fetcher).not.toHaveBeenCalled();
});
it("successful registration sends only email/password, clears passwords and routes to login without login call", async () => {
  fetcher.mockResolvedValue(reply({ user: { id: randomUUID() } }, 201)); render(<AuthForm mode="register" />);
  const secret = fillAuth("register");
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login?registered=1"));
  expect(Object.keys(JSON.parse(fetcher.mock.calls[0]![1].body)).sort()).toEqual(["email", "password"]);
  expect(JSON.parse(fetcher.mock.calls[0]![1].body).password === secret).toBe(true);
  expect((screen.getByLabelText("รหัสผ่าน") as HTMLInputElement).value).toBe("");
  expect((screen.getByLabelText("ยืนยันรหัสผ่าน") as HTMLInputElement).value).toBe("");
  expect(mocks.signIn).not.toHaveBeenCalled();
});
it("duplicate account error is safe and does not retain password", async () => {
  fetcher.mockResolvedValue(failure("ACCOUNT_ALREADY_EXISTS", 409)); render(<AuthForm mode="register" />); fillAuth("register");
  expect((await screen.findByRole("alert")).textContent).toContain("มีบัญชีแล้ว");
  expect((screen.getByLabelText("รหัสผ่าน") as HTMLInputElement).value).toBe("");
});
it("login failures use one generic message and wipe password", async () => {
  mocks.signIn.mockResolvedValue({ ok: false, error: "CredentialsSignin" }); render(<AuthForm mode="login" />); fillAuth("login");
  expect((await screen.findByRole("alert")).textContent).toBe("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
  expect((screen.getByLabelText("รหัสผ่าน") as HTMLInputElement).value).toBe("");
});
it("successful login uses official Credentials client and redirects", async () => {
  render(<AuthForm mode="login" registered />); fillAuth("login");
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/scenarios"));
  expect(mocks.signIn.mock.calls[0]![0]).toBe("credentials");
  expect(screen.getByRole("status").textContent).toContain("สมัครสมาชิกสำเร็จ");
});
it("logout uses supported signOut without owner/token controls", async () => {
  mocks.status = "authenticated"; render(<AuthNavigation />);
  fireEvent.click(screen.getByRole("button", { name: "ออกจากระบบ" }));
  await waitFor(() => expect(mocks.signOut).toHaveBeenCalledWith({ redirect: false, redirectTo: "/login" }));
  expect(mocks.replace).toHaveBeenCalledWith("/login");
});
it.each(["unauthenticated", "loading"])("gate hides protected content while %s", status => {
  mocks.status = status; render(<AuthGate><p>private training content</p></AuthGate>);
  expect(screen.queryByText("private training content")).toBeNull();
  if (status === "unauthenticated") expect(mocks.replace).toHaveBeenCalledWith("/login");
});
it("scenario catalog renders only API data; double-click start produces one request", async () => {
  let finish!: (value: Response) => void;
  fetcher.mockResolvedValueOnce(reply([scenario])).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  render(<ScenarioList />); const start = await screen.findByRole("button", { name: /เริ่มฝึกสถานการณ์/ });
  expect(screen.getByText("สถานการณ์จาก API")).toBeTruthy();
  fireEvent.click(start); fireEvent.click(start);
  expect(fetcher).toHaveBeenCalledTimes(2);
  const sent = JSON.parse(fetcher.mock.calls[1]![1].body); expect(sent).toEqual({ startId: expect.any(String), expectedRevision: 0 });
  await act(async () => finish(reply({ session: snapshot(), duplicate: false }, 201)));
  expect(mocks.push).toHaveBeenCalledWith("/training/public-session");
});
it("start network retry reuses exact request ID/body", async () => {
  fetcher.mockResolvedValueOnce(reply([scenario])).mockRejectedValueOnce(new Error("lost")).mockResolvedValueOnce(reply({ session: snapshot(), duplicate: true }));
  render(<ScenarioList />); fireEvent.click(await screen.findByRole("button", { name: /เริ่มฝึกสถานการณ์/ }));
  fireEvent.click(await screen.findByRole("button", { name: "ลองอีกครั้ง" }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalled());
  expect(fetcher.mock.calls[1]![1].body).toBe(fetcher.mock.calls[2]![1].body);
});
it.each(["CHOICE", "EVIDENCE", "NONE"] as const)("public %s action produces only its approved payload", input => {
  const submit = vi.fn(); render(<ActionControl definition={{ ...choice, input }} disabled={false} submit={submit} />);
  if (input === "NONE") { fireEvent.click(screen.getByRole("button")); expect(submit).toHaveBeenCalledWith({}); }
  else {
    fireEvent.click(screen.getByLabelText("ตัวเลือกจากระบบ")); fireEvent.click(screen.getByRole("button"));
    expect(submit).toHaveBeenCalledWith(input === "CHOICE" ? { choiceId: "opaque-option" } : { selectedEvidenceIds: ["opaque-option"] });
  }
});
it("CONFIRM needs a second explicit click; cancellation sends nothing and has no credential fields", () => {
  const submit = vi.fn(); render(<ActionControl definition={{ ...choice, input: "CONFIRM", label: "รายการจำลอง", options: [] }} disabled={false} submit={submit} />);
  fireEvent.click(screen.getByRole("button", { name: "รายการจำลอง" }));
  fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" })); expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "รายการจำลอง" }));
  expect(document.querySelectorAll("input")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันการกระทำจำลอง" }));
  expect(submit).toHaveBeenCalledWith({ confirmed: true });
});
it("resume displays authoritative history and sending a message uses current revision", async () => {
  const initial = snapshot(7); initial.messages = [{ turnId: "old", role: "character", text: "ข้อความก่อนหน้า" }];
  const updated = snapshot(8); updated.messages = [...initial.messages, { turnId: "new", role: "user", text: "ข้อความใหม่" }, { turnId: "new", role: "character", text: "คำตอบจากระบบ" }];
  fetcher.mockResolvedValueOnce(reply(initial)).mockResolvedValueOnce(reply({ session: updated, duplicate: false, turn: { turnId: "new", committedRevision: 8, characterMessage: "คำตอบจากระบบ" } }));
  render(<Training sessionId="public-session" />); await screen.findByText("ข้อความก่อนหน้า");
  fireEvent.change(screen.getByLabelText("ข้อความของคุณ"), { target: { value: "ข้อความใหม่" } }); fireEvent.click(screen.getByRole("button", { name: /ส่งข้อความ/ }));
  await screen.findByText("คำตอบจากระบบ"); expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toMatchObject({ turnId: expect.any(String), expectedRevision: 7, text: "ข้อความใหม่" });
  expect((screen.getByLabelText("ข้อความของคุณ") as HTMLTextAreaElement).value).toBe("");
});
it("successful action updates the revision used by the next explicit operation", async () => {
  fetcher.mockResolvedValueOnce(reply(snapshot(3))).mockResolvedValueOnce(reply({ session: snapshot(4), duplicate: false })).mockResolvedValueOnce(reply({ session: snapshot(5), duplicate: false }));
  render(<Training sessionId="public-session" />); fireEvent.click(await screen.findByLabelText("ตัวเลือกจากระบบ")); fireEvent.click(screen.getByRole("button", { name: "ยืนยันคำตอบ" }));
  await waitFor(() => expect((screen.getByRole("button", { name: "ส่งข้อความ" }) as HTMLButtonElement).disabled).toBe(true));
  await waitFor(() => expect((screen.getByLabelText("ตัวเลือกจากระบบ") as HTMLInputElement).disabled).toBe(false));
  fireEvent.click(screen.getByLabelText("ตัวเลือกจากระบบ")); fireEvent.click(screen.getByRole("button", { name: "ยืนยันคำตอบ" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(JSON.parse(fetcher.mock.calls[2]![1].body).expectedRevision).toBe(4);
});
it("revision conflict refetches but never resubmits; next user action uses fresh revision", async () => {
  fetcher.mockResolvedValueOnce(reply(snapshot(1))).mockResolvedValueOnce(failure("REVISION_CONFLICT", 409)).mockResolvedValueOnce(reply(snapshot(9)));
  render(<Training sessionId="public-session" />); fireEvent.click(await screen.findByLabelText("ตัวเลือกจากระบบ")); fireEvent.click(screen.getByRole("button", { name: "ยืนยันคำตอบ" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  await screen.findByText(/รอบฝึกมีการเปลี่ยนแปลง/);
  expect(fetcher.mock.calls.filter(call => call[1].method === "POST")).toHaveLength(1);
});
it("message uncertainty preserves text and exact ID/payload on retry", async () => {
  fetcher.mockResolvedValueOnce(reply(snapshot())).mockRejectedValueOnce(new Error("uncertain")).mockResolvedValueOnce(reply({ session: snapshot(1), duplicate: true }));
  render(<Training sessionId="public-session" />); const input = await screen.findByLabelText("ข้อความของคุณ");
  fireEvent.change(input, { target: { value: "ข้อความสำหรับส่งซ้ำ" } }); fireEvent.click(screen.getByRole("button", { name: /ส่งข้อความ/ }));
  const retry = await screen.findByRole("button", { name: "ลองอีกครั้ง" });
  expect((input as HTMLTextAreaElement).value).toBe("ข้อความสำหรับส่งซ้ำ"); fireEvent.click(retry);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(fetcher.mock.calls[1]![1].body).toBe(fetcher.mock.calls[2]![1].body);
});
it.each(["COMPLETED", "FAILED"] as const)("%s offers real result route without fabricating scores", async status => {
  fetcher.mockResolvedValue(reply({ ...snapshot(), status, availableActions: [] })); render(<Training sessionId="public-session" />);
  expect((await screen.findByRole("link", { name: /ดูผลการฝึก/ })).getAttribute("href")).toBe("/training/public-session/result");
  expect(screen.queryByText("100")).toBeNull();
});
it("quit requires confirmation, sends revision and displays abandoned without result", async () => {
  fetcher.mockResolvedValueOnce(reply(snapshot(4))).mockResolvedValueOnce(reply({ session: { ...snapshot(5), status: "ABANDONED", availableActions: [] }, duplicate: false }));
  render(<Training sessionId="public-session" />); fireEvent.click(await screen.findByRole("button", { name: "ออกจากสถานการณ์" }));
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันออกจากสถานการณ์" }));
  await screen.findByText("ออกจากรอบฝึกแล้ว");
  expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({ actionId: expect.any(String), expectedRevision: 4 });
  expect(screen.queryByRole("link", { name: /ดูผล/ })).toBeNull();
});
it("expired session has no result or controls", async () => {
  fetcher.mockResolvedValue(failure("SESSION_EXPIRED", 410)); render(<Training sessionId="public-session" />);
  expect((await screen.findByRole("alert")).textContent).toContain("หมดอายุ"); expect(screen.queryByLabelText("ข้อความของคุณ")).toBeNull();
});
it("result renders server outcome/nullable scores without deriving pass or weakest skill", async () => {
  fetcher.mockResolvedValue(reply({ sessionId: "public-session", revision: 9, D: 1, W: null, S: 2, trainingScore: null, outcome: "PASSED", weakestSkills: ["S"], recommendation: { recommendationType: "DECISION_PRACTICE", recommendationKey: "public-key", reason: "คำแนะนำจากระบบ" } }));
  render(<Result sessionId="public-session" />); await screen.findByText("ผ่านการฝึก"); await screen.findByText("คำแนะนำจากระบบ");
  expect(screen.getByText("ยังไม่มีคะแนนรวม")).toBeTruthy(); expect(screen.queryByText("ยังไม่ผ่านเกณฑ์")).toBeNull();
  expect(document.body.textContent).not.toContain("ownerId"); expect(document.body.textContent).not.toContain("EventCode");
});
it("unknown/missing session gives safe error instead of hidden fields", async () => {
  fetcher.mockResolvedValue(failure("SESSION_NOT_FOUND", 404)); render(<Training sessionId="public-session" />);
  await screen.findByRole("alert"); expect(document.body.textContent).not.toContain("PRIVATE_DETAILS");
});
it("late GET after unmount is aborted and cannot resurrect training", async () => {
  let resolve!: (value: Response) => void;
  fetcher.mockImplementation(() => new Promise<Response>(r => { resolve = r; }));
  const view = render(<Training sessionId="public-session" />);
  const signal = fetcher.mock.calls[0]![1].signal as AbortSignal;
  view.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => resolve(reply(snapshot())));
  expect(screen.queryByLabelText("ข้อความของคุณ")).toBeNull();
});
it("empty catalog has a helpful state and no invented playable cards", async () => {
  fetcher.mockResolvedValue(reply([])); render(<ScenarioList />);
  await screen.findByText("ยังไม่มีสถานการณ์ที่เปิดให้ฝึก"); expect(screen.queryByRole("button", { name: /เริ่มฝึก/ })).toBeNull();
});
it("uncertain action retry preserves ID/revision/payload and blocks competing actions", async () => {
  fetcher.mockResolvedValueOnce(reply(snapshot(6))).mockRejectedValueOnce(new Error("uncertain"))
    .mockResolvedValueOnce(reply({ session: snapshot(7), duplicate: true }));
  render(<Training sessionId="public-session" />);
  fireEvent.click(await screen.findByLabelText("ตัวเลือกจากระบบ"));
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันคำตอบ" }));
  const retry = await screen.findByRole("button", { name: "ลองอีกครั้ง" });
  expect((screen.getByRole("button", { name: "ยืนยันคำตอบ" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "ออกจากสถานการณ์" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(retry);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(fetcher.mock.calls[1]![1].body).toBe(fetcher.mock.calls[2]![1].body);
  expect(JSON.parse(fetcher.mock.calls[2]![1].body)).toMatchObject({
    actionId: expect.any(String), expectedRevision: 6, actionDefinitionId: choice.id, payload: { choiceId: "opaque-option" },
  });
});
it("double action submit sends once and API unauthorized redirects without exposing identity", async () => {
  let complete!: (value: Response) => void;
  fetcher.mockResolvedValueOnce(reply(snapshot())).mockImplementationOnce(() => new Promise<Response>(r => { complete = r; }));
  render(<Training sessionId="public-session" />);
  fireEvent.click(await screen.findByLabelText("ตัวเลือกจากระบบ"));
  const submit = screen.getByRole("button", { name: "ยืนยันคำตอบ" });
  fireEvent.click(submit); fireEvent.click(submit);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () => complete(failure("UNAUTHENTICATED", 401)));
  expect(mocks.replace).toHaveBeenCalledWith("/login");
  expect(document.body.textContent).not.toContain("ownerId");
});
