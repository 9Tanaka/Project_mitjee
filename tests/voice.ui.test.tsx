// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const fake = vi.hoisted(() => ({ start: vi.fn(), socket: vi.fn(), http: vi.fn() }));
vi.mock("../src/frontend/microphone.js", () => ({ startMicrophone: fake.start }));
vi.mock("../src/frontend/call-transport.js", () => ({ socketVoice: fake.socket, httpVoice: fake.http, encodeAudio: () => "SYNTHETIC" }));
import { VoiceControls } from "../src/frontend/voice.js";
import { ApiFailure } from "../src/frontend/api.js";
const session = { sessionId: "test-call", scenario: { id: "call-center-scam", category: "CALL_CENTER", title: "Call Center", description: "สมมติ", learningObjectives: [], communicationMode: "TEXT_VOICE" as const },
  status: "ACTIVE" as const, currentStatePublicLabel: "รับสาย", revision: 0, messages: [], availableActions: [] };
const dialogue = { session: { ...session, revision: 1 }, duplicate: false, turn: { turnId: "turn", committedRevision: 1, characterMessage: "ข้อความที่บันทึกแล้ว" } };
const reply = { dialogue, audioBase64: null, audioMime: "audio/wav", audioStatus: "UNAVAILABLE" };
const cancel = vi.fn(), stop = vi.fn();
beforeEach(() => { vi.clearAllMocks(); fake.start.mockResolvedValue({ cancel, stop }); stop.mockResolvedValue(new Uint8Array(100)); fake.socket.mockResolvedValue(reply); fake.http.mockResolvedValue(reply); });
afterEach(cleanup);
function setup() { const onReply = vi.fn(), onBusy = vi.fn(), reload = vi.fn().mockResolvedValue(undefined);
  return { ...render(<VoiceControls session={session} disabled={false} onReply={onReply} onBusy={onBusy} reload={reload} />), onReply, onBusy, reload }; }
it("requests microphone only on explicit action and cancels on unmount", async () => {
  const h = setup(); expect(fake.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "เริ่มโหมดเสียง" }));
  await screen.findByRole("button", { name: "หยุดและส่งเสียง" }); expect(fake.start).toHaveBeenCalledOnce();
  h.unmount(); expect(cancel).toHaveBeenCalledOnce(); expect(fake.start.mock.calls[0]![1].aborted).toBe(true);
});
it("permission denial is recoverable without sending a turn", async () => {
  fake.start.mockRejectedValue(new Error("denied")); setup(); fireEvent.click(screen.getByText("เริ่มโหมดเสียง"));
  await screen.findByText(/เปิดไมโครโฟนไม่ได้/); expect(fake.socket).not.toHaveBeenCalled();
});
it("STT or TTS failure is shown without invented transcript/state", async () => {
  const h = setup(); fireEvent.click(screen.getByText("เริ่มโหมดเสียง"));
  fireEvent.click(await screen.findByText("หยุดและส่งเสียง"));
  await screen.findByText(/บันทึกข้อความตอบแล้ว/); expect(h.onReply).toHaveBeenCalledWith(dialogue);
});
it("socket failure retries through HTTP with identical turn/revision/audio", async () => {
  fake.socket.mockRejectedValue(new ApiFailure("NETWORK_ERROR", 0)); const h = setup();
  fireEvent.click(screen.getByText("เริ่มโหมดเสียง")); fireEvent.click(await screen.findByText("หยุดและส่งเสียง"));
  await waitFor(() => expect(h.onReply).toHaveBeenCalledWith(dialogue));
  expect(fake.http.mock.calls[0]![1]).toEqual(fake.socket.mock.calls[0]![1]);
});
it("uncertain retries retain the original request and block other mutations", async () => {
  fake.socket.mockRejectedValue(new ApiFailure("NETWORK_ERROR", 0)); fake.http.mockRejectedValueOnce(new ApiFailure("NETWORK_ERROR", 0));
  const h = setup(); fireEvent.click(screen.getByText("เริ่มโหมดเสียง")); fireEvent.click(await screen.findByText("หยุดและส่งเสียง"));
  fireEvent.click(await screen.findByText("ลองส่งรายการเดิมอีกครั้ง"));
  await waitFor(() => expect(h.onReply).toHaveBeenCalledWith(dialogue));
  expect(fake.http.mock.calls[0]![1]).toEqual(fake.http.mock.calls[1]![1]); expect(h.onBusy).toHaveBeenLastCalledWith(false);
});
it("stale revision reloads and never retries with an invented revision", async () => {
  fake.socket.mockRejectedValue(new ApiFailure("REVISION_CONFLICT", 409)); const h = setup();
  fireEvent.click(screen.getByText("เริ่มโหมดเสียง")); fireEvent.click(await screen.findByText("หยุดและส่งเสียง"));
  await waitFor(() => expect(h.reload).toHaveBeenCalledOnce()); expect(fake.http).not.toHaveBeenCalled();
});
it("late microphone setup after cancel cannot overwrite a newer recording", async () => {
  let release!: (value: { cancel: () => void; stop: typeof stop }) => void;
  const oldCancel = vi.fn();
  fake.start.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  setup(); fireEvent.click(screen.getByText("เริ่มโหมดเสียง"));
  fireEvent.click(screen.getByText("ยกเลิกการบันทึก"));
  fireEvent.click(screen.getByText("เริ่มโหมดเสียง"));
  await screen.findByText("หยุดและส่งเสียง");
  await act(async () => { release({ cancel: oldCancel, stop }); });
  expect(oldCancel).toHaveBeenCalledOnce(); expect(cancel).not.toHaveBeenCalled();
  expect(screen.getByText("หยุดและส่งเสียง")).toBeTruthy();
});
