// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
const state=vi.hoisted(()=>({pathname:"/scenarios",push:vi.fn(),replace:vi.fn(),refresh:vi.fn()}));
const router={push:state.push,replace:state.replace,refresh:state.refresh};
vi.mock("next/navigation.js",()=>({useRouter:()=>router,usePathname:()=>state.pathname}));
vi.mock("next-auth/react",()=>({useSession:()=>({status:"authenticated",data:{user:{email:"learner@example.test"}}}),signOut:vi.fn(),SessionProvider:({children}:{children:ReactNode})=>children}));
vi.mock("next/link.js",()=>({default:({children,...props}:{children:ReactNode;href:string})=><a {...props}>{children}</a>}));
import { ScenarioList, ScenarioDetail } from "../src/frontend/scenarios.js";
import { AppShell } from "../src/frontend/shell.js";
import { FAQ, AccountSettings, LearningDashboard } from "../src/frontend/learning-pages.js";
import { ArticlePreview, GamePreview, GamesHome, KnowledgeHome } from "../src/frontend/preview-pages.js";
import { QuizDetail } from "../src/frontend/quiz-detail.js";
const fetcher=vi.fn();
const scenario={id:"sms",title:"ข้อความจำลอง",category:"SMS_PHISHING",description:"ข้อมูลจาก API",learningObjectives:["วัตถุประสงค์จาก API"],communicationMode:"TEXT"};
const catalog={bankVersion:"v1",questionCount:210,questionsPerAttempt:20,categories:["FINANCE","IMPERSONATION","ACCOUNT","SHOPPING_JOB","RELATIONSHIP","EDUCATION_TRAVEL","PRIZE_RECOVERY"].map((id,i)=>({id,label:"หมวด "+i,questionCount:30,perAttempt:i===6?2:3})),history:[]};
beforeEach(()=>{vi.clearAllMocks();fetcher.mockReset();vi.stubGlobal("fetch",fetcher);state.pathname="/scenarios";});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("catalog filters API items and links to details without starting a session",async()=>{
  fetcher.mockResolvedValue(Response.json({data:[scenario,{...scenario,id:"call",category:"CALL_CENTER",communicationMode:"TEXT_VOICE",title:"สายจำลอง"}]}));
  render(<ScenarioList/>);await screen.findByText("สายจำลอง");
  expect(screen.getAllByRole("link",{name:/ดูรายละเอียด/})).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("หมวดหมู่"),{target:{value:"CALL_CENTER"}});
  expect(screen.queryByText("ข้อความจำลอง",{selector:"h2"})).toBeNull();
  expect(screen.getByText("ฝึกผ่านข้อความหรือเสียง")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("ค้นหาสถานการณ์"),{target:{value:"ไม่ตรง"}});
  expect(screen.getByText("ไม่พบสถานการณ์ที่ค้นหา")).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"ล้างตัวกรอง"}));
  expect(screen.getAllByRole("link",{name:/ดูรายละเอียด/})).toHaveLength(2);expect(fetcher).toHaveBeenCalledTimes(1);
});
it("details use public metadata and link to warning instead of revealing rules or making mutations",async()=>{
  fetcher.mockResolvedValue(Response.json({data:scenario}));render(<ScenarioDetail scenarioId="sms"/>);
  await screen.findByText("วัตถุประสงค์จาก API");
  expect(screen.getByRole("link",{name:/เริ่มจำลองสถานการณ์/}).getAttribute("href")).toBe("/scenarios/sms/prepare");
  expect(document.body.textContent).not.toContain("Critical Failure");expect(fetcher).toHaveBeenCalledTimes(1);
});
it("mobile menu expands, highlights training route, and closes on Escape with focus restored",()=>{
  state.pathname="/training/test";render(<AppShell><h1>test</h1></AppShell>);
  const button=screen.getByRole("button",{name:"เปิดเมนู"});fireEvent.click(button);
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("link",{name:"สถานการณ์ AI"}).getAttribute("aria-current")).toBe("page");
  fireEvent.keyDown(document.getElementById("workspace-sidebar")!,{key:"Escape"});
  expect(button.getAttribute("aria-expanded")).toBe("false");expect(document.activeElement).toBe(button);
});
it("FAQ searches, filters, and exposes native keyboard-operable summaries",()=>{
  render(<FAQ/>);fireEvent.change(screen.getByLabelText("ค้นหาคำถาม"),{target:{value:"Google"}});
  expect(document.querySelectorAll("details")).toHaveLength(1);
  expect(screen.getByText(/เข้าสู่ระบบด้วย Google/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"สถานการณ์"}));expect(screen.getByText("ไม่พบคำถามที่ตรงกัน")).toBeTruthy();
});
it("settings displays only current identity and no fake save or password reset",()=>{
  render(<AccountSettings/>);expect(screen.getByText("learner@example.test")).toBeTruthy();
  expect(document.querySelector("form")).toBeNull();expect(fetcher).not.toHaveBeenCalled();
});
it("empty dashboard does not invent scores or mastery",async()=>{
  fetcher.mockResolvedValue(Response.json({data:catalog}));render(<LearningDashboard/>);
  await screen.findByText("เส้นทางการเรียนรู้เริ่มได้จากรอบแรก");
  expect(screen.queryByRole("progressbar")).toBeNull();expect(screen.getByText("—")).toBeTruthy();
});
it("dashboard displays real completed quiz result and uncompleted count separately",async()=>{
  const result={correct:14,total:20,percentage:70,completedAt:1000,baseline:null,changePercentagePoints:null,categories:catalog.categories.map(c=>({id:c.id,label:c.label,correct:2,total:c.perAttempt}))};
  fetcher.mockResolvedValue(Response.json({data:{...catalog,history:[{id:"done",mode:"PRE_TEST",status:"COMPLETED",startedAt:0,result},{id:"active",mode:"POST_TEST",status:"ACTIVE",startedAt:1,result:null}]}}));
  render(<LearningDashboard/>);await screen.findByText("70%");
  expect(screen.getByRole("progressbar").getAttribute("value")).toBe("70");
  expect(screen.getByRole("link",{name:/Pre-test ·/}).getAttribute("href")).toBe("/quiz/done");
});
it.each([GamesHome,KnowledgeHome,ArticlePreview])("planned content stays labelled UI-only %#",Component=>{
  render(<Component/>);expect(document.body.textContent).toContain("ตัวอย่าง UI");expect(fetcher).not.toHaveBeenCalled();
});
it("game preview changes evidence without saving or assigning an outcome",()=>{
  render(<GamePreview/>);fireEvent.click(screen.getByRole("button",{name:"เอกสารประกอบสมมติ"}));
  expect(screen.getByText(/ไม่ใช่ประกาศรับสมัครงาน/)).toBeTruthy();
  fireEvent.click(screen.getByLabelText("ยังต้องการข้อมูลเพิ่มเติม"));expect(screen.getByRole("status").textContent).toContain("เลือกในตัวอย่าง");expect(fetcher).not.toHaveBeenCalled();
});
it("game result preview has no score or fake pass state",()=>{
  render(<GamePreview result/>);expect(screen.getAllByText("—")).toHaveLength(3);expect(screen.queryByText("ผ่านการฝึก")).toBeNull();
});
it("quiz details show current API counts and no answer key",async()=>{
  fetcher.mockResolvedValue(Response.json({data:catalog}));render(<QuizDetail mode="PRE_TEST"/>);
  await screen.findByText("210");expect(screen.getByText("20")).toBeTruthy();expect(screen.queryByText("10-15 นาที")).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("new resource views preserve 401 redirect",async()=>{
  fetcher.mockResolvedValue(Response.json({error:{code:"UNAUTHENTICATED",message:"private"}},{status:401}));
  render(<ScenarioDetail scenarioId="private"/>);await waitFor(()=>expect(state.replace).toHaveBeenCalledWith("/login"));expect(screen.queryByRole("link",{name:/เริ่มจำลอง/})).toBeNull();
});
