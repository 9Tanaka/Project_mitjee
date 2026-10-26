// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const fake = vi.hoisted(() => ({ start: vi.fn(), socket: vi.fn(), http: vi.fn(), speech: vi.fn() }));
vi.mock("../src/frontend/microphone.js", () => ({ startMicrophone: fake.start }));
vi.mock("../src/frontend/call-transport.js", () => ({ socketVoice: fake.socket, httpVoice: fake.http, httpSpeech: fake.speech, encodeAudio: () => "SYNTHETIC" }));
import { VoiceControls } from "../src/frontend/voice.js";

type Session = Parameters<typeof VoiceControls>[0]["session"];
const initial: Session = { sessionId: "public-call", scenario: { id: "call-center", category: "CALL_CENTER", title: "Call Center", description: "สมมติ", learningObjectives: [], communicationMode: "TEXT_VOICE" },
  status: "ACTIVE", currentStatePublicLabel: "รับสาย", revision: 1, messages: [], availableActions: [],
  phone: { state: "CALL_CONNECTED", callStatus: "CONNECTED", callerLabel: "ผู้ติดต่อไม่รู้จัก", openingStatus: "PENDING", availableInternalApps: [] } };
function caller(id: string, state = "IDENTITY_CLAIM" as NonNullable<Session["phone"]>["state"]): Session {
  return { ...initial, revision: 2, phone: { ...initial.phone!, state, openingStatus: "READY" }, messages: [{ role: "character", turnId: id, text: "สวัสดีครับ ขอแจ้งข้อมูลจำลอง" }] };
}
const ready = { audioStatus: "READY", audioBase64: "AA==", audioMime: "audio/wav" };
let play: ReturnType<typeof vi.spyOn>, pause: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks();
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  let blob = 0;
  vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:caller-" + ++blob); static revokeObjectURL = vi.fn(); });
  fake.speech.mockResolvedValue(ready);
  fake.start.mockResolvedValue({ cancel: vi.fn(), stop: vi.fn().mockResolvedValue(new Uint8Array(8)) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup(session = initial) {
  const props = { disabled: false, onReply: vi.fn(), onBusy: vi.fn(), reload: vi.fn().mockResolvedValue(undefined) };
  // Transcript is owned by the parent and remains usable independently of audio.
  const view = (s: Session, disabled = false) => <><p data-testid="transcript">{s.messages.map(m => m.text).join("\n")}</p><VoiceControls {...props} session={s} disabled={disabled} /></>;
  const rendered = render(view(session));
  return { ...rendered, props, update: (s: Session, disabled = false) => rendered.rerender(view(s, disabled)) };
}

it("automatically requests new committed caller audio after call activation, even during next-beat pending state", async () => {
  const h = setup(); expect(fake.speech).not.toHaveBeenCalled();
  h.update(caller("opening"), true);
  await waitFor(() => expect(play).toHaveBeenCalledOnce());
  expect(fake.speech.mock.calls[0]!.slice(0, 2)).toEqual([initial.sessionId, "opening"]);
  expect(fake.start).not.toHaveBeenCalled(); expect(fake.socket).not.toHaveBeenCalled(); expect(h.props.onReply).not.toHaveBeenCalled();
});
it("renders one hidden audio element with compact call-level controls, no native player or checkbox", async () => {
  const h = setup(); h.update(caller("one"));
  await waitFor(() => expect(play).toHaveBeenCalledOnce());
  expect(document.querySelectorAll("audio")).toHaveLength(1);
  expect(document.querySelector("audio")!.controls).toBe(false);
  expect(document.querySelector("audio")!.hidden).toBe(true);
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.getByRole("button", { name: "ปิดเสียงผู้โทร" }).getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByRole("button", { name: "ฟังผู้โทรซ้ำ" })).toBeTruthy();
});
it("autoplay rejection offers one unobtrusive gesture fallback and later turns continue automatically", async () => {
  play.mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));
  const h = setup(); h.update(caller("one"));
  fireEvent.click(await screen.findByRole("button", { name: "แตะเพื่อเปิดเสียงสนทนา" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "แตะเพื่อเปิดเสียงสนทนา" })).toBeNull());
  h.update(caller("two")); await waitFor(() => expect(play).toHaveBeenCalledTimes(3));
  expect(screen.getByTestId("transcript").textContent).toContain("สวัสดีครับ");
  expect(h.props.onBusy).not.toHaveBeenCalledWith(true); expect(h.props.onReply).not.toHaveBeenCalled();
});
it.each(["unavailable", "network", "decode"])("%s audio failure keeps transcript and microphone available", async failure => {
  if (failure === "unavailable") fake.speech.mockResolvedValue({ ...ready, audioBase64: null, audioStatus: "UNAVAILABLE" });
  if (failure === "network") fake.speech.mockRejectedValue(new Error("synthetic"));
  const h = setup(); h.update(caller("one"));
  if (failure === "decode") { await waitFor(() => expect(play).toHaveBeenCalledOnce()); fireEvent.error(document.querySelector("audio")!); }
  await screen.findByText(/ไม่สามารถเล่นเสียงได้ในขณะนี้/);
  expect(screen.getByTestId("transcript").textContent).toContain("สวัสดีครับ");
  expect(screen.getByRole("button", { name: "กดเพื่อพูด" }).hasAttribute("disabled")).toBe(false);
  expect(h.props.onBusy).not.toHaveBeenCalledWith(true); expect(h.props.onReply).not.toHaveBeenCalled();
});
it("new caller audio pauses the old turn before playback and uses only one audio element", async () => {
  const h = setup(); h.update(caller("one")); await waitFor(() => expect(play).toHaveBeenCalledOnce());
  const first = document.querySelector("audio")!; fireEvent.play(first); pause.mockClear(); play.mockClear();
  h.update(caller("two")); await waitFor(() => expect(play).toHaveBeenCalledOnce());
  expect(pause).toHaveBeenCalled();
  expect(pause.mock.invocationCallOrder[0]).toBeLessThan(play.mock.invocationCallOrder[0]!);
  expect(document.querySelectorAll("audio")).toHaveLength(1);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:caller-1");
});
it("late aborted TTS cannot replace the latest caller turn", async () => {
  let resolve!: (value: typeof ready) => void;
  fake.speech.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const h = setup(); h.update(caller("old")); await waitFor(() => expect(fake.speech).toHaveBeenCalledOnce());
  h.update(caller("new")); await waitFor(() => expect(play).toHaveBeenCalledOnce());
  expect(fake.speech.mock.calls[0]![2].aborted).toBe(true);
  const latest = document.querySelector("audio")!.src;
  await act(async () => resolve(ready));
  expect(document.querySelector("audio")!.src).toBe(latest); expect(play).toHaveBeenCalledOnce();
});
it("refresh and refetch never autoplay old caller turns; explicit replay remains available", async () => {
  const h = setup(caller("old")); h.update({ ...caller("old"), revision: 9 });
  expect(fake.speech).not.toHaveBeenCalled(); expect(play).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "ฟังผู้โทรซ้ำ" }));
  await waitFor(() => expect(play).toHaveBeenCalledOnce());
  h.update({ ...caller("old"), revision: 10 }); expect(fake.speech).toHaveBeenCalledOnce();
  const audio = document.querySelector("audio")!; audio.currentTime = 3;
  fireEvent.click(screen.getByRole("button", { name: "ฟังผู้โทรซ้ำ" }));
  expect(audio.currentTime).toBe(0);
});
it("muted caller audio leaves transcript usable and unmute plays only the latest committed turn", async () => {
  const h = setup(); fireEvent.click(screen.getByRole("button", { name: "ปิดเสียงผู้โทร" }));
  h.update(caller("one")); h.update(caller("two"));
  expect(fake.speech).not.toHaveBeenCalled(); expect(screen.getByTestId("transcript").textContent).toContain("สวัสดีครับ");
  fireEvent.click(screen.getByRole("button", { name: "เปิดเสียงผู้โทร" }));
  await waitFor(() => expect(play).toHaveBeenCalledOnce());
  expect(fake.speech).toHaveBeenCalledOnce(); expect(fake.speech.mock.calls[0]![1]).toBe("two");
});
it("unmount on a critical ending cancels pending TTS and cannot play its late response", async () => {
  let resolve!: (value: typeof ready) => void;
  fake.speech.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const h = setup(); h.update(caller("one")); await waitFor(() => expect(fake.speech).toHaveBeenCalledOnce());
  h.unmount(); expect(fake.speech.mock.calls[0]![2].aborted).toBe(true);
  await act(async () => resolve(ready)); expect(play).not.toHaveBeenCalled();
});
