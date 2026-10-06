// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const fake = vi.hoisted(() => ({ start: vi.fn(), socket: vi.fn(), http: vi.fn(), speech: vi.fn() }));
vi.mock("../src/frontend/microphone.js", () => ({ startMicrophone: fake.start }));
vi.mock("../src/frontend/call-transport.js", () => ({ socketVoice: fake.socket, httpVoice: fake.http, httpSpeech: fake.speech, encodeAudio: () => "SYNTHETIC" }));
import { VoiceControls } from "../src/frontend/voice.js";
import { ApiFailure } from "../src/frontend/api.js";
const session = { sessionId: "test-call", scenario: { id: "call-center-scam", category: "CALL_CENTER", title: "Call Center", description: "สมมติ", learningObjectives: [], communicationMode: "TEXT_VOICE" as const },
  status: "ACTIVE" as const, currentStatePublicLabel: "รับสาย", revision: 0, messages: [], availableActions: [] };
const dialogue = { session: { ...session, revision: 1 }, duplicate: false, turn: { turnId: "turn", committedRevision: 1, characterMessage: "ข้อความที่บันทึกแล้ว" } };
const reply = { dialogue, audioBase64: null, audioMime: "audio/wav", audioStatus: "UNAVAILABLE" };
const cancel = vi.fn(), stop = vi.fn();
beforeEach(() => { vi.clearAllMocks(); fake.start.mockResolvedValue({ cancel, stop }); stop.mockResolvedValue(new Uint8Array(100)); fake.socket.mockResolvedValue(reply); fake.http.mockResolvedValue(reply); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("committed opening and state turns offer TTS without generating new dialogue; failure/replay keeps captions", async () => {
  fake.speech.mockResolvedValue({ audioStatus: "UNAVAILABLE", audioBase64: null, audioMime: "audio/wav" });
  const onReply = vi.fn(), onBusy = vi.fn(), reload = vi.fn();
  const opening = { ...session, messages: [{ role: "character" as const, turnId: "caller-opening", text: "สวัสดีครับ", currentStatePublicLabel: "เชื่อมต่อสาย" }] };
  const h = render(<VoiceControls session={opening} disabled={false} onReply={onReply} onBusy={onBusy} reload={reload} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "เปิดเสียงผู้โทร" }));
  await waitFor(() => expect(fake.speech).toHaveBeenCalledTimes(1));
  await screen.findByText(/ไม่สามารถเล่นเสียงได้ในขณะนี้/);
  fireEvent.click(screen.getByRole("button", { name: "เล่นเสียงผู้โทรอีกครั้ง" }));
  await waitFor(() => expect(fake.speech).toHaveBeenCalledTimes(2));
  h.rerender(<VoiceControls session={{ ...opening, messages: [...opening.messages, { ...opening.messages[0]!, turnId: "caller-state-IDENTITY_CLAIM" }] }} disabled={false} onReply={onReply} onBusy={onBusy} reload={reload} />);
  await waitFor(() => expect(fake.speech).toHaveBeenCalledTimes(3));
  expect(fake.speech.mock.calls[2]!.slice(0, 2)).toEqual([session.sessionId, "caller-state-IDENTITY_CLAIM"]);
  expect(onReply).not.toHaveBeenCalled(); expect(fake.socket).not.toHaveBeenCalled(); expect(fake.start).not.toHaveBeenCalled();
});
it.each(["NotAllowedError", "NotFoundError"])("%s microphone error permits a fresh retry and text fallback", async name => {
  fake.start.mockRejectedValueOnce(new DOMException("PRIVATE", name)); setup();
  fireEvent.click(screen.getByText("กดเพื่อพูด"));
  await screen.findByText(name === "NotAllowedError" ? /ไม่ได้รับอนุญาตใช้ไมโครโฟน/ : /ไม่พบไมโครโฟน/);
  expect(fake.http).not.toHaveBeenCalled(); expect(fake.socket).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("กดเพื่อพูด")); await screen.findByText("หยุดและส่งเสียง");
});
function setup() { const onReply = vi.fn(), onBusy = vi.fn(), reload = vi.fn().mockResolvedValue(undefined);
  return { ...render(<VoiceControls session={session} disabled={false} onReply={onReply} onBusy={onBusy} reload={reload} />), onReply, onBusy, reload }; }
it("requests microphone only on explicit action and cancels on unmount", async () => {
  const h = setup(); expect(fake.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "กดเพื่อพูด" }));
  await screen.findByRole("button", { name: "หยุดและส่งเสียง" }); expect(fake.start).toHaveBeenCalledOnce();
  h.unmount(); expect(cancel).toHaveBeenCalledOnce(); expect(fake.start.mock.calls[0]![1].aborted).toBe(true);
  expect(h.onBusy).toHaveBeenLastCalledWith(false);
});
it("permission denial is recoverable without sending a turn", async () => {
  fake.start.mockRejectedValue(new Error("denied")); setup(); fireEvent.click(screen.getByText("กดเพื่อพูด"));
  await screen.findByText(/เปิดไมโครโฟนไม่ได้/); expect(fake.socket).not.toHaveBeenCalled();
});
it("STT or TTS failure is shown without invented transcript/state", async () => {
  const h = setup(); fireEvent.click(screen.getByText("กดเพื่อพูด"));
  fireEvent.click(await screen.findByText("หยุดและส่งเสียง"));
  await screen.findByText(/ไม่สามารถเล่นเสียงได้ในขณะนี้/); expect(h.onReply).toHaveBeenCalledWith(dialogue);
});
it("socket failure retries through HTTP with identical turn/revision/audio", async () => {
  fake.socket.mockRejectedValue(new ApiFailure("NETWORK_ERROR", 0)); const h = setup();
  fireEvent.click(screen.getByText("กดเพื่อพูด")); fireEvent.click(await screen.findByText("หยุดและส่งเสียง"));
  await waitFor(() => expect(h.onReply).toHaveBeenCalledWith(dialogue));
  expect(fake.http.mock.calls[0]![1]).toEqual(fake.socket.mock.calls[0]![1]);
});
it("uncertain retries retain the original request and block other mutations", async () => {
  fake.socket.mockRejectedValue(new ApiFailure("NETWORK_ERROR", 0)); fake.http.mockRejectedValueOnce(new ApiFailure("NETWORK_ERROR", 0));
  const h = setup(); fireEvent.click(screen.getByText("กดเพื่อพูด")); fireEvent.click(await screen.findByText("หยุดและส่งเสียง"));
  fireEvent.click(await screen.findByText("ลองส่งรายการเดิมอีกครั้ง"));
  await waitFor(() => expect(h.onReply).toHaveBeenCalledWith(dialogue));
  expect(fake.http.mock.calls[0]![1]).toEqual(fake.http.mock.calls[1]![1]); expect(h.onBusy).toHaveBeenLastCalledWith(false);
});
it("stale revision reloads and never retries with an invented revision", async () => {
  fake.socket.mockRejectedValue(new ApiFailure("REVISION_CONFLICT", 409)); const h = setup();
  fireEvent.click(screen.getByText("กดเพื่อพูด")); fireEvent.click(await screen.findByText("หยุดและส่งเสียง"));
  await waitFor(() => expect(h.reload).toHaveBeenCalledOnce()); expect(fake.http).not.toHaveBeenCalled();
});
it("late microphone setup after cancel cannot overwrite a newer recording", async () => {
  let release!: (value: { cancel: () => void; stop: typeof stop }) => void;
  const oldCancel = vi.fn();
  fake.start.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  setup(); fireEvent.click(screen.getByText("กดเพื่อพูด"));
  fireEvent.click(screen.getByText("ยกเลิกการบันทึก"));
  fireEvent.click(screen.getByText("กดเพื่อพูด"));
  await screen.findByText("หยุดและส่งเสียง");
  await act(async () => { release({ cancel: oldCancel, stop }); });
  expect(oldCancel).toHaveBeenCalledOnce(); expect(cancel).not.toHaveBeenCalled();
  expect(screen.getByText("หยุดและส่งเสียง")).toBeTruthy();
});
it("new caller audio failure cannot replay stale audio and recording pauses playback", async () => {
  vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:caller"); static revokeObjectURL = vi.fn(); });
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  fake.speech.mockResolvedValueOnce({ audioStatus: "READY", audioBase64: "AA==" }).mockRejectedValue(new ApiFailure("NETWORK_ERROR", 0));
  const first = { ...session, messages: [{ role: "character" as const, turnId: "opening", text: "สวัสดี", currentStatePublicLabel: "เชื่อมต่อ" }] };
  const props = { disabled: false, onReply: vi.fn(), onBusy: vi.fn(), reload: vi.fn() };
  const h = render(<VoiceControls {...props} session={first} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "เปิดเสียงผู้โทร" }));
  await waitFor(() => expect(play).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "กดเพื่อพูด" }));
  await screen.findByText("หยุดและส่งเสียง"); expect(pause).toHaveBeenCalled();
  fireEvent.click(screen.getByText("ยกเลิกการบันทึก"));
  h.rerender(<VoiceControls {...props} session={{ ...first, messages: [{ ...first.messages[0]!, turnId: "next" }] }} />);
  await screen.findByText(/ไม่สามารถเล่นเสียงได้ในขณะนี้/);
  expect(screen.queryByLabelText("เสียงตอบจากตัวละคร")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "เล่นเสียงผู้โทรอีกครั้ง" }));
  await waitFor(() => expect(fake.speech).toHaveBeenCalledTimes(3));
  expect(play).toHaveBeenCalledOnce(); expect(fake.socket).not.toHaveBeenCalled();
});
it("an aborted late TTS result cannot replace current-state caller audio", async () => {
  let release!: (value: { audioStatus: string; audioBase64: string }) => void;
  fake.speech.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
    .mockResolvedValue({ audioStatus: "UNAVAILABLE", audioBase64: null });
  const phone = { state: "CALL_CONNECTED" } as NonNullable<Parameters<typeof VoiceControls>[0]["session"]["phone"]>;
  const first = { ...session, phone, messages: [{ role: "character" as const, turnId: "old", text: "สวัสดี", currentStatePublicLabel: "เชื่อมต่อ" }] };
  const props = { disabled: false, onReply: vi.fn(), onBusy: vi.fn(), reload: vi.fn() };
  const h = render(<VoiceControls {...props} session={first} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "เปิดเสียงผู้โทร" }));
  await waitFor(() => expect(fake.speech).toHaveBeenCalledTimes(1));
  h.rerender(<VoiceControls {...props} session={{ ...first, phone: { ...phone, state: "IDENTITY_CLAIM" }, messages: [{ ...first.messages[0]!, turnId: "new" }] }} />);
  await waitFor(() => expect(fake.speech).toHaveBeenCalledTimes(2));
  expect(fake.speech.mock.calls[0]![2].aborted).toBe(true);
  await act(async () => { release({ audioStatus: "READY", audioBase64: "AA==" }); });
  expect(screen.queryByLabelText("เสียงตอบจากตัวละคร")).toBeNull();
  expect(props.onReply).not.toHaveBeenCalled();
});
