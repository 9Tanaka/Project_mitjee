import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { learningHarness } from "./post-decision.helpers.js";
import { containsSimulatedOtp } from "../src/public-api/simulated-otp.js";
import { contradictsUnconfirmedOtp, hasSimulatedOtpContext, simulatedOtp } from "../src/dialogue/simulated-otp.js";
import { actionBindings, registeredTemplates } from "../src/application/catalog.js";
import { callCenterContinuousTemplates } from "../src/fixtures/call-center-continuous-stories.js";
import { projectSession } from "../src/application/projections.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";
import { sessionDto } from "../src/public-api/contracts.js";

it.each([['731942',true],['รหัสคือ 731942 ครับ',true],['1234',false],['731943',false],['17319420',false],['731 942',false]])('exact simulated token %s => %s', (text, expected) => {
  expect(containsSimulatedOtp(text as string, '731942')).toBe(expected);
});
it('requires the committed OTP request and open current opportunity; unread follows existing phone navigation', async () => {
  const h = await learningHarness('CC-02'); await h.context();
  expect(h.session().phone?.otpMessage).toBeUndefined();
  await h.choose('caution'); await h.opening(); await h.choose('caution');
  expect(h.session().phone?.otpMessage).toBeUndefined();
  await h.opening();
  const otp = h.session().phone!.otpMessage!;
  expect(otp.unread).toBe(true); expect(otp.simulatedCode).toBe(simulatedOtp(h.session().sessionId));
  expect(h.session().phone!.activeApp).toBe('CALL');
  expect(h.session().phone!.appData!.MESSAGES!.lines[0]).toContain(otp.simulatedCode);
  expect(sessionDto.safeParse(h.session()).success).toBe(true);
  await h.action('เปิดข้อความ'); expect(h.session().phone!.otpMessage!.unread).toBe(false);
  expect((await h.app.resume(h.session().sessionId,h.owner)).phone!.otpMessage!.unread).toBe(false);
});
it('random numbers remain dialogue; exact issued code is rejected before provider without any write', async () => {
  const provider = new MockScenarioModelProvider(), spy = vi.spyOn(provider,'generateCharacterResponse');
  const h = await learningHarness('CC-02',provider); await h.main();
  await h.say('1234'); expect((await h.raw()).result).toBeNull();
  const before = await h.raw(); spy.mockClear();
  await expect(h.say(`รหัสคือ ${h.session().phone!.otpMessage!.simulatedCode}`)).rejects.toMatchObject({code:'SIMULATED_OTP_CONFIRMATION_REQUIRED'});
  expect(spy).not.toHaveBeenCalled(); expect(await h.raw()).toEqual(before);
});
it('projected bridge steps use existing explicit critical rule, replay once, no digits in history or result', async () => {
  const h = await learningHarness('CC-02'); await h.main(); const code = h.session().phone!.otpMessage!.simulatedCode;
  let last;
  for (let i=0;i<4;i++) {
    const next=h.session().phone!.otpMessage!.nextAction;
    last={actionId:randomUUID(),expectedRevision:h.session().revision,actionDefinitionId:next.id,payload:next.confirmed?{confirmed:true}: {}};
    h.set((await h.app.action(h.session().sessionId,h.owner,last)).session);
    if(i<3) {expect((await h.raw()).result).toBeNull();expect((await h.raw()).events.some(e=>e.critical)).toBe(false);}
  }
  const raw=await h.raw(); expect(raw.status).toBe('FAILED'); expect(raw.result!.outcome).toBe('CRITICAL_FAILURE');
  expect(raw.result!.trainingScore).toBeNull();
  expect(raw.events.filter(e=>e.critical)).toMatchObject([{code:'DISCLOSE_OTP',ruleId:'SHARE_SIMULATED_OTP',authority:'BACKEND_VALIDATED'}]);
  expect(JSON.stringify(raw)).not.toContain(code); expect(JSON.stringify(h.session().phone!.transcript)).not.toContain(code);
  expect((await h.result()).postDecisionGuidance!.recovery[0]!.incidentType).toBe('OTP_OR_CREDENTIAL_DISCLOSED');
  expect((await h.app.action(raw.id,h.owner,last!)).duplicate).toBe(true); expect(await h.raw()).toEqual(raw);
});
it('stale preparation and stale action revision are rejected without a critical event', async () => {
  const h=await learningHarness('CC-02'); await h.main(); await h.action('เปิดข้อความ'); await h.action('อ่านรหัสในข้อความจำลอง'); await h.action('เตรียมยืนยันการบอกรหัสจำลอง');
  const next=h.session().phone!.otpMessage!.nextAction, rev=h.session().revision;
  await h.say('ขอข้อมูลเพิ่ม');
  const request={actionId:randomUUID(),expectedRevision:rev,actionDefinitionId:next.id,payload:{confirmed:true}};
  await expect(h.app.action(h.session().sessionId,h.owner,request)).rejects.toMatchObject({code:'REVISION_CONFLICT'});
  await expect(h.app.action(h.session().sessionId,h.owner,{...request,actionId:randomUUID(),expectedRevision:h.session().revision})).rejects.toMatchObject({code:'EXPLICIT_CONFIRMATION_REQUIRED'});
  expect((await h.raw()).events.some(e=>e.critical)).toBe(false);
});
it.each(['CC-01','CC-N01','CC-N02'] as const)('%s never offers OTP bridge', async story => {
  const h=await learningHarness(story); await h.main(); expect(h.session().phone?.otpMessage).toBeUndefined();
});
it('expired, finalized, missing signal and historical contexts cannot offer the bridge',async()=>{
  const h=await learningHarness('CC-02');await h.main(); const raw=await h.raw();
  expect(hasSimulatedOtpContext({...raw,status:'EXPIRED'},h.template)).toBe(false);
  expect(hasSimulatedOtpContext({...raw,dialogueTurns:[]},h.template)).toBe(false);
  for(const t of registeredTemplates.filter(t=>t.id==='call-center-bank'&&t.version<6)) {
    expect(projectSession({...raw,templateVersion:t.version,variant:t.variant},t).phone?.otpMessage).toBeUndefined();
  }
  await h.choose('trust');expect(h.session().phone?.otpMessage).toBeUndefined();
});
it('a confirmation submitted after real Core expiry creates no critical event or official result',async()=>{
  vi.useFakeTimers();
  try {
    const h=await learningHarness('CC-02');await h.main();await h.action('เปิดข้อความ');await h.action('อ่านรหัสในข้อความจำลอง');await h.action('เตรียมยืนยันการบอกรหัสจำลอง');
    const s=h.session(),next=s.phone!.otpMessage!.nextAction;
    vi.setSystemTime(Date.now()+31*60*1000);
    await expect(h.app.action(s.sessionId,h.owner,{actionId:randomUUID(),expectedRevision:s.revision,actionDefinitionId:next.id,payload:{confirmed:true}})).rejects.toMatchObject({code:'SESSION_EXPIRED'});
    const raw=await h.raw();expect(raw.status).toBe('EXPIRED');expect(raw.result).toBeNull();expect(raw.events.some(e=>e.critical)).toBe(false);
  }finally{vi.useRealTimers();}
});
it.each(['ได้รับรหัสแล้ว','ขอบคุณสำหรับรหัส','รหัสถูกต้อง','เราได้รับ [REDACTED_SECRET] แล้ว','We received your OTP','Your code is verified'])('rejects bounded unconfirmed acknowledgement: %s',text=>{
  expect(contradictsUnconfirmedOtp(text)).toBe(true);
});
it.each(['ยังไม่ได้รับรหัสแล้วนะครับ','We have not received your OTP','ขอรายละเอียดเพิ่มเติมครับ','กรุณาอย่าบอกรหัสจริง'])('does not reject a neutral or negated acknowledgement: %s',text=>{
  expect(contradictsUnconfirmedOtp(text)).toBe(false);
});
it('bounded acknowledgement rejection retries then uses authored fallback without evaluation authority',async()=>{
  const mock=new MockScenarioModelProvider();let bad=false;const contexts: any[]=[];
  const provider={generateCharacterResponse:vi.fn(async(context:any)=>{contexts.push(context);const r=await mock.generateCharacterResponse(context);return bad?{...r,character_message:'ขอบคุณครับ เราได้รับ [REDACTED_SECRET] แล้ว'}:r;})};
  const h=await learningHarness('CC-02',provider);await h.main();bad=true;const before=await h.raw();await h.say('1234');
  const raw=await h.raw(),turn=raw.dialogueTurns.at(-1)!;
  expect(turn).toMatchObject({usedFallback:true,attempts:2,failureReason:'INVALID_OUTPUT'});
  expect(turn.response.interaction_signal).toBe('OTP_REQUEST');expect(contradictsUnconfirmedOtp(turn.response.character_message)).toBe(false);
  expect(raw.events).toEqual(before.events);expect(raw.result).toBeNull();expect(raw.opportunities).toEqual(before.opportunities);
  expect(contexts.at(-1).forbiddenBehaviors.join(' ')).toContain('No OTP disclosure has been confirmed');
  expect(JSON.stringify(contexts)).not.toContain(simulatedOtp(raw.id));
});
it('active labels are neutral without changing any published template, binding ID or assessment',()=>{
  for(const t of callCenterContinuousTemplates){
    const before=structuredClone(t),bindings=actionBindings(t);
    for(const o of t.opportunities){if(o.skill!=='D')throw Error('EXPECTED_D');const b=bindings.find(b=>b.opportunityId===o.id&&b.public.input==='CHOICE')!;
      o.choices.forEach((c,i)=>{const option=b.public.options[i]!;expect(b.toDomain({choiceId:option.id})).toEqual({kind:'DECISION',opportunityId:o.id,choiceId:c.id});
        expect(option.label).not.toMatch(/SAFE|REVIEW|CRITICAL|ไม่ได้ตรวจสอบ|คำตอบผิด|คำตอบถูก|ปลอดภัยที่สุด/);
        if(c.id==='trust'){expect(option.label).toBe('เชื่อคำกล่าวอ้างของผู้โทร');expect(c.assessment).toBe('REVIEW');}
      });
    }expect(t).toEqual(before);
  }
});
