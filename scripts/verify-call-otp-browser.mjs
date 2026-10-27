// Real production UI + actual application/Core, with synthetic identity, in-memory
// persistence and Mock dialogue. This does not claim live provider/auth/DB coverage.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { register } from "tsx/esm/api";
register();
const { learningHarness } = await import("../tests/post-decision.helpers.ts");
const { publicError } = await import("../src/http/errors.ts");
const origin=process.argv[2]??"http://localhost:3000";
assert(["localhost","127.0.0.1"].includes(new URL(origin).hostname));
const output="frontend-artifacts/call-otp";await mkdir(output,{recursive:true});
const report={status:"FAILED",scope:"Production Next UI + real in-memory application/Core; synthetic identity and Mock dialogue, not live Auth/DB/LLM/speech.",cases:[]};
const browser=await chromium.launch();
try {
  for(const width of [375,768,1440]){
    const h=await learningHarness('CC-02');await h.main();const id=h.session().sessionId;
    const context=await browser.newContext({baseURL:origin,viewport:{width,height:960},reducedMotion:'reduce'}),page=await context.newPage();
    const entry={width,status:'FAILED',stages:[],browserErrors:0};report.cases.push(entry);const requests=[];
    page.on('pageerror',()=>entry.browserErrors++);page.on('console',m=>{if(m.type()==='error')entry.browserErrors++;});
    await context.route('**/api/**',async route=>{
      try{
        const path=new URL(route.request().url()).pathname,op=path.split('/').at(-1),body=route.request().postDataJSON();let data;
        if(path==='/api/auth/session')return route.fulfill({json:{user:{id:h.owner.id,email:'synthetic@example.test'},expires:'2099-01-01T00:00:00Z'}});
        if(op===id)data=await h.app.resume(id,h.owner);
        else if(op==='result')data=await h.result();
        else if(op==='speech')data={audioBase64:null,audioMime:'audio/wav',audioStatus:'UNAVAILABLE'};
        else if(['action','message','opening'].includes(op)){requests.push({op,body});data=await h.app[op](id,h.owner,body);h.set(data.session);}
        else return route.fulfill({status:404,json:{error:{code:'INVALID_REQUEST',message:'Unconfigured test route'}}});
        await route.fulfill({json:{data}});
      }catch(error){const r=publicError(error);await route.fulfill({status:r.status,json:r.body});}
    });
    async function capture(name){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'HORIZONTAL_OVERFLOW');await page.screenshot({path:`${output}/${width}-${name}.png`,fullPage:true});}
    const dialog=page.getByRole('dialog',{name:'คุณกำลังจะบอกรหัส OTP จำลองแก่ผู้โทร',exact:true});
    try{
      await page.goto(`/training/${id}`);
      const sheet=page.getByRole('dialog',{name:'ตัวเลือกในขั้นตอนปัจจุบัน'});await expect(sheet).toBeVisible();
      await expect(sheet.getByRole('radio',{name:'เชื่อคำกล่าวอ้างของผู้โทร',exact:true})).toBeVisible();
      assert.doesNotMatch(await sheet.innerText(),/ไม่ได้ตรวจสอบ|SAFE|REVIEW|CRITICAL|คำตอบผิด|คำตอบถูก/);
      await sheet.getByRole('button',{name:'ปิดตัวเลือก',exact:true}).click();
      await expect(page.getByText(/มีข้อความจำลองใหม่/)).toBeVisible();await capture('sms-unread');
      const opened=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/action'));
      await page.getByRole('button',{name:'ข้อความ · ใหม่',exact:true}).click();assert.equal((await opened).status(),200);
      const code=h.session().phone.otpMessage.simulatedCode;
      await expect(page.getByText(`รหัสยืนยันจำลองของคุณคือ ${code}`,{exact:true})).toBeVisible();await capture('messages');
      await expect(page.getByRole('button',{name:'อ่านรหัสในข้อความจำลอง',exact:true})).toHaveCount(0);
      await expect(page.getByRole('button',{name:'เตรียมยืนยันการบอกรหัสจำลอง',exact:true})).toHaveCount(0);
      const back=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/action'));
      await page.getByRole('button',{name:'กลับสายสนทนา',exact:true}).click();assert.equal((await back).status(),200);
      const composer=page.getByLabel('ตอบผู้โทรด้วยข้อความ');await expect(composer).toBeEnabled();
      const wrong=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/message'));
      let wrongCode;
      do { wrongCode=String(randomInt(100000,1000000)); } while(wrongCode===code);
      await composer.fill(wrongCode);await page.getByRole('button',{name:'ส่งข้อความ',exact:true}).click();assert.equal((await wrong).status(),200);
      await expect(composer).toBeEnabled();await expect(dialog).toHaveCount(0);assert.equal((await h.raw()).result,null);
      entry.stages.push('SMS_DISCOVERED_WITHOUT_AUTO_OPEN','RANDOM_NUMBER_DIALOGUE_ONLY');
      const before=await h.raw(),requestCount=requests.length;
      await composer.fill(code);await page.getByRole('button',{name:'ส่งข้อความ',exact:true}).click();await expect(dialog).toBeVisible();
      assert.equal(requests.length,requestCount);assert.deepEqual(await h.raw(),before);await capture('confirmation');
      await dialog.getByRole('button',{name:'กลับไปแก้ข้อความ',exact:true}).click();await expect(dialog).toHaveCount(0);
      await expect(composer).toHaveValue(code);await expect(composer).toBeFocused();assert.deepEqual(await h.raw(),before);
      entry.stages.push('EXACT_CODE_CONFIRMATION_ONLY','CANCEL_NO_WRITE_EDITABLE_DRAFT');
      await page.getByRole('button',{name:'ส่งข้อความ',exact:true}).click();await expect(dialog).toBeVisible();
      await dialog.getByRole('button',{name:'ยืนยันบอกรหัสจำลอง',exact:true}).click();
      await expect(page.getByRole('heading',{name:'คุณถูกหลอกในสถานการณ์จำลอง',exact:true})).toBeVisible();
      assert.equal(requests.slice(requestCount).filter(r=>r.op==='message'||r.op==='opening').length,0);
      assert.equal((await h.raw()).events.filter(e=>e.critical).length,1);
      assert.doesNotMatch(await page.getByRole('log').innerText(),new RegExp(code));await capture('critical-ending');
      const actions=requests.filter(r=>r.op==='action').length;await page.reload();
      await expect(page.getByRole('heading',{name:'คุณถูกหลอกในสถานการณ์จำลอง',exact:true})).toBeVisible();
      assert.equal(requests.filter(r=>r.op==='action').length,actions);
      const result=await h.result();assert.equal(result.outcome,'CRITICAL_FAILURE');assert.equal(result.trainingScore,null);
      assert.equal(result.postDecisionGuidance.recovery[0].incidentType,'OTP_OR_CREDENTIAL_DISCLOSED');
      await page.getByRole('link',{name:'ดูผลและวิธีรับมือ',exact:true}).click();
      await expect(page.getByRole('heading',{name:'ถ้าเหตุการณ์ลักษณะนี้เกิดขึ้นจริง',exact:true})).toBeVisible();await capture('recovery');
      entry.stages.push('ONE_CONFIRMATION_EXISTING_BACKEND_CRITICAL','NO_DIGITS_IN_TRANSCRIPT','NO_CALLER_AFTER_CRITICAL','REFRESH_NO_RESUBMIT','OTP_RECOVERY_RESULT');
      assert.equal(entry.browserErrors,0);entry.status='PASSED';
    }catch(error){entry.failure=error.name;entry.message=String(error.message).replace(/\d{6}/g,'[SIMULATED_CODE]').slice(0,750);}
    finally{await context.close();}
    console.log(JSON.stringify({width,status:entry.status,browserErrors:entry.browserErrors}));
    if(entry.status==='FAILED')break;
  }
  report.status=report.cases.length===3&&report.cases.every(c=>c.status==='PASSED')?'PASSED':'FAILED';
}finally{await browser.close();await writeFile(`${output}/verification.json`,JSON.stringify(report,null,2));}
if(report.status!=='PASSED')process.exitCode=1;
