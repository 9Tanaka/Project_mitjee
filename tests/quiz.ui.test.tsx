// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation.js", () => ({ useRouter: () => router }));
const router = { push: mocks.push, replace: mocks.replace };
vi.mock("next/link.js", () => ({ default: ({children,...props}: {children:ReactNode;href:string}) => <a {...props}>{children}</a> }));
import { QuizHome, QuizRound } from "../src/frontend/quiz.js";
import { QuizService } from "../src/quiz/service.js";
import { InMemoryQuizRepository } from "../src/quiz/memory-repository.js";
import { quizStartRequest, quizWriteRequest } from "../src/public-api/quiz.js";
import { publicError } from "../src/http/errors.js";
let service: QuizService; let repository: InMemoryQuizRepository;
let loseNextSave: boolean; let conflictNextSave: boolean;
const fetcher = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); loseNextSave = false; conflictNextSave = false;
  repository = new InMemoryQuizRepository(); service = new QuizService(repository, () => 1000, max => max-1);
  vi.stubGlobal("fetch",fetcher);
  fetcher.mockImplementation(async (path:string, options:{method:string;body?:string}) => {
    try {
      if (path === "/api/quiz") return Response.json({data:await service.overview("a")});
      if (path === "/api/quiz/attempts") return Response.json({data:await service.start("a",quizStartRequest.parse(JSON.parse(options.body!)))});
      const [,id,suffix] = /\/attempts\/([^/]+)(?:\/(save|submit))?$/.exec(path)!;
      if (options.method === "GET") return Response.json({data:await service.resume(id!,"a")});
      const input = quizWriteRequest.parse(JSON.parse(options.body!));
      if (conflictNextSave) { conflictNextSave = false; await service.write(id!,"a","SAVE",{...input,requestId:randomUUID(),answers:[]}); }
      const data = await service.write(id!,"a",suffix === "save" ? "SAVE" : "SUBMIT",input);
      if (loseNextSave) { loseNextSave = false; throw new TypeError("simulated connection loss after commit"); }
      return Response.json({data});
    } catch (error) {
      if (error instanceof TypeError) throw error;
      const mapped = publicError(error); return Response.json(mapped.body,{status:mapped.status});
    }
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function begin() { return (await service.start("a",{requestId:randomUUID(),mode:"PRE_TEST"})).attempt; }
it("shows Pre/Post, 210 questions and starts the requested mode with an idempotent request", async () => {
  render(<QuizHome />);
  await screen.findByRole("heading",{name:"ลองวัดความรู้ก่อนและหลังฝึก"});
  expect(screen.getByText(/คลัง 210 ข้อ/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"เริ่ม Post-test"}));
  await waitFor(()=>expect(mocks.push).toHaveBeenCalledWith(expect.stringMatching(/^\/quiz\/q-/)));
  const call = fetcher.mock.calls.find(([path])=>path === "/api/quiz/attempts")!;
  const body = JSON.parse(call[1].body); expect(body.mode).toBe("POST_TEST"); expect(Object.keys(body).sort()).toEqual(["mode","requestId"]);
});
it("saves a choice before moving, offers resume, and omits grading before submission", async () => {
  const a = await begin(); const view = render(<QuizRound attemptId={a.id} />);
  const radios = await screen.findAllByRole("radio"); fireEvent.click(radios[1]!);
  expect(screen.getByRole("button",{name:"ส่งคำตอบและดูผล"}).hasAttribute("disabled")).toBe(true);
  expect(screen.queryByText(/อ่านแนวทางเพิ่มเติม/)).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"บันทึกและไปข้อต่อไป"}));
  await waitFor(()=>expect(screen.getByText(/^ข้อ 2\/20/)).toBeTruthy());
  view.unmount(); render(<QuizRound attemptId={a.id} />);
  await screen.findAllByRole("radio"); await waitFor(()=>expect((screen.getAllByRole("radio")[1] as HTMLInputElement).checked).toBe(true));
  expect((await repository.get(a.id,"a"))!.result).toBeNull();
});
it("retries the identical request after uncertain save, blocking further edits until confirmed", async () => {
  const a = await begin(); render(<QuizRound attemptId={a.id} />);
  fireEvent.click((await screen.findAllByRole("radio"))[0]!); loseNextSave = true;
  fireEvent.click(screen.getByRole("button",{name:"บันทึกและไปข้อต่อไป"}));
  await screen.findByRole("alert"); expect(screen.getAllByRole("radio").every(r=>r.matches(":disabled"))).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"ลองอีกครั้ง"}));
  await waitFor(()=>expect(screen.getByText(/^ข้อ 2\/20/)).toBeTruthy());
  const saves = fetcher.mock.calls.filter(([path])=>path.endsWith("/save")); expect(saves).toHaveLength(2); expect(saves[0]![1].body).toBe(saves[1]![1].body);
  expect((await repository.get(a.id,"a"))!.revision).toBe(1);
});
it("reloads the server's saved choices after another window wins a revision conflict", async () => {
  const a = await begin(); render(<QuizRound attemptId={a.id} />);
  fireEvent.click((await screen.findAllByRole("radio"))[0]!); conflictNextSave = true;
  fireEvent.click(screen.getByRole("button",{name:"บันทึกและไปข้อต่อไป"}));
  await screen.findByRole("alert");
  await waitFor(()=>expect(screen.getAllByRole("radio").every(r=>!(r as HTMLInputElement).checked)).toBe(true));
  expect(screen.getByText(/^ข้อ 1\/20/)).toBeTruthy(); expect((await repository.get(a.id,"a"))!.revision).toBe(1);
});
it("finishes all 20 questions, scores on the service and shows accessible explanations", async () => {
  const a = await begin(); render(<QuizRound attemptId={a.id} />); await screen.findAllByRole("radio");
  for (let i=0;i<20;i++) {
    fireEvent.click(screen.getAllByRole("radio")[0]!);
    fireEvent.click(screen.getByRole("button",{name:i===19?"บันทึกคำตอบ":"บันทึกและไปข้อต่อไป"}));
    await waitFor(async()=>expect((await repository.get(a.id,"a"))!.revision).toBe(i+1));
    if (i<19) await screen.findByText(new RegExp(`^ข้อ ${i+2}/20`));
    else await waitFor(()=>expect(screen.getByRole("button",{name:"ส่งคำตอบและดูผล"}).hasAttribute("disabled")).toBe(false));
  }
  fireEvent.click(screen.getByRole("button",{name:"ส่งคำตอบและดูผล"}));
  await screen.findByRole("heading",{name:"ผล Quiz ของคุณ"}); expect(screen.getByText("100%")).toBeTruthy();
  expect(screen.getAllByRole("link",{name:/อ่านแนวทางเพิ่มเติม/})).toHaveLength(20);
  expect(screen.queryAllByRole("radio")).toHaveLength(0); expect(screen.queryByText(/ผ่านเกณฑ์|PASSED|70%/)).toBeNull();
});
it("describes a lower Post-test result in percentage points and links the frozen Pre-test", async () => {
  const pre = await begin(); const raw = (await repository.get(pre.id,"a"))!;
  await service.write(pre.id,"a","SUBMIT",{requestId:randomUUID(),expectedRevision:0,answers:raw.questions.map(q=>({questionId:q.id,optionId:q.correctOptionId}))});
  const post = (await service.start("a",{requestId:randomUUID(),mode:"POST_TEST"})).attempt;
  const postRaw = (await repository.get(post.id,"a"))!;
  await service.write(post.id,"a","SUBMIT",{requestId:randomUUID(),expectedRevision:0,answers:postRaw.questions.map((q,i)=>({questionId:q.id,optionId:i<10?q.correctOptionId:q.options.find(o=>o.id!==q.correctOptionId)!.id}))});
  render(<QuizRound attemptId={post.id} />); await screen.findByRole("heading",{name:"ผล Quiz ของคุณ"});
  expect(screen.getByText("ลดลง 50 จุดเปอร์เซ็นต์")).toBeTruthy(); expect(screen.getByRole("link",{name:/ดู Pre-test ที่ใช้เปรียบเทียบ/}).getAttribute("href")).toBe("/quiz/"+pre.id);
});
