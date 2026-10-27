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

async function ready() {
  const h=await learningHarness('CC-02');await h.main(); const ui=await show(h);
  fireEvent.click(await screen.findByRole('button',{name:'ปิดตัวเลือก'}));
  return {h,ui,code:h.session().phone!.otpMessage!.simulatedCode};
}
async function typeCode(code:string){
  fireEvent.change(screen.getByLabelText('ตอบผู้โทรด้วยข้อความ'),{target:{value:code}});
  fireEvent.click(screen.getByRole('button',{name:'ส่งข้อความ'}));
  return screen.findByRole('dialog',{name:'คุณกำลังจะบอกรหัส OTP จำลองแก่ผู้โทร'});
}
it('new SMS badge opens Messages deliberately; old prepare/view/second-confirm controls are not primary UX',async()=>{
  const {h}=await ready();expect(screen.getByText(/มีข้อความจำลองใหม่/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'ข้อความ · ใหม่'}));
  await screen.findByRole('button',{name:'บอกรหัสจำลองแก่ผู้โทร'});
  expect(screen.getByText(`รหัสยืนยันจำลองของคุณคือ ${h.session().phone!.otpMessage!.simulatedCode}`)).toBeTruthy();
  expect(screen.queryByRole('button',{name:'อ่านรหัสในข้อความจำลอง'})).toBeNull();
  expect(screen.queryByRole('button',{name:'เตรียมยืนยันการบอกรหัสจำลอง'})).toBeNull();
  expect((await h.raw()).events.some(e=>e.critical)).toBe(false);
});
it('wrong number is ordinary dialogue without confirmation or failure',async()=>{
  const {h,ui}=await ready();fireEvent.change(screen.getByLabelText('ตอบผู้โทรด้วยข้อความ'),{target:{value:'1234'}});
  fireEvent.click(screen.getByRole('button',{name:'ส่งข้อความ'}));
  await waitFor(()=>expect(ui.requests.filter(r=>r.op==='message')).toHaveLength(1));
  await waitFor(()=>expect(screen.getByLabelText('ตอบผู้โทรด้วยข้อความ').hasAttribute('disabled')).toBe(false));
  expect(screen.queryByRole('dialog')).toBeNull();expect((await h.raw()).result).toBeNull();
});
it('exact code opens only confirmation; cancel creates no actions, events, messages or results and keeps editable draft',async()=>{
  const {h,ui,code}=await ready(); const before=await h.raw();await typeCode(code);
  expect(ui.requests.filter(r=>['message','action'].includes(r.op))).toHaveLength(0);
  expect(await h.raw()).toEqual(before);
  fireEvent.click(screen.getByRole('button',{name:'กลับไปแก้ข้อความ'}));
  expect(screen.queryByRole('dialog')).toBeNull();expect((screen.getByLabelText('ตอบผู้โทรด้วยข้อความ') as HTMLTextAreaElement).value).toBe(code);
  expect(await h.raw()).toEqual(before);
});
it('single consent commits existing steps once despite double click, hides digits and stops caller; refresh never resubmits',async()=>{
  const {h,ui,code}=await ready();await typeCode(code);
  const button=screen.getByRole('button',{name:'ยืนยันบอกรหัสจำลอง'});fireEvent.click(button);fireEvent.click(button);
  await screen.findByText('คุณถูกหลอกในสถานการณ์จำลอง');
  expect(ui.requests.filter(r=>r.op==='action')).toHaveLength(4);
  expect(ui.requests.filter(r=>['message','opening'].includes(r.op))).toHaveLength(0);
  expect(screen.getByRole('log').textContent).not.toContain(code);
  expect((await h.raw()).events.filter(e=>e.critical)).toHaveLength(1);
  expect((await h.result()).postDecisionGuidance!.recovery[0]!.incidentType).toBe('OTP_OR_CREDENTIAL_DISCLOSED');
  ui.view.unmount();render(<Training sessionId={h.session().sessionId}/>);await screen.findByText('คุณถูกหลอกในสถานการณ์จำลอง');
  expect(ui.requests.filter(r=>r.op==='action')).toHaveLength(4);
});
it('definitive rejected action never claims disclosure',async()=>{
  const {h,ui,code}=await ready();ui.failAction();await typeCode(code);fireEvent.click(screen.getByRole('button',{name:'ยืนยันบอกรหัสจำลอง'}));
  await waitFor(()=>expect(ui.requests.filter(r=>r.op==='action')).toHaveLength(1));
  await waitFor(()=>expect(screen.queryByText('กำลังบันทึกการยืนยัน…')).toBeNull());
  expect(screen.queryByText('คุณถูกหลอกในสถานการณ์จำลอง')).toBeNull();expect((await h.raw()).result).toBeNull();
});
it('uncertain response retries exact original action and completes without duplicate event',async()=>{
  const {h,ui,code}=await ready();ui.loseActionReply();await typeCode(code);fireEvent.click(screen.getByRole('button',{name:'ยืนยันบอกรหัสจำลอง'}));
  fireEvent.click(await screen.findByRole('button',{name:'ตรวจสอบคำยืนยันเดิมอีกครั้ง'}));await screen.findByText('คุณถูกหลอกในสถานการณ์จำลอง');
  const actions=ui.requests.filter(r=>r.op==='action');expect(actions).toHaveLength(5);expect(actions[0]!.body).toEqual(actions[1]!.body);
  expect((await h.raw()).events.filter(e=>e.critical)).toHaveLength(1);
});
it('concurrent revision change while confirmation is open is rejected without showing completed disclosure',async()=>{
  const {h,code}=await ready();await typeCode(code);
  await h.say('ขอรายละเอียดเพิ่มก่อน');
  fireEvent.click(screen.getByRole('button',{name:'ยืนยันบอกรหัสจำลอง'}));
  const dialog=await screen.findByRole('dialog',{name:'คุณกำลังจะบอกรหัส OTP จำลองแก่ผู้โทร'});
  await waitFor(()=>expect(within(dialog).getByRole('alert').textContent).toContain('รอบฝึกมีการเปลี่ยนแปลง'));
  expect(within(dialog).getByRole('button',{name:'ยืนยันบอกรหัสจำลอง'}).hasAttribute('disabled')).toBe(true);
  fireEvent.click(within(dialog).getByRole('button',{name:'กลับไปแก้ข้อความ'}));
  await screen.findByLabelText('ตอบผู้โทรด้วยข้อความ');
  expect((screen.getByLabelText('ตอบผู้โทรด้วยข้อความ') as HTMLTextAreaElement).value).toBe(code);
  expect(screen.queryByText('คุณถูกหลอกในสถานการณ์จำลอง')).toBeNull();
  expect((await h.raw()).events.some(e=>e.critical)).toBe(false);expect((await h.raw()).result).toBeNull();
});
