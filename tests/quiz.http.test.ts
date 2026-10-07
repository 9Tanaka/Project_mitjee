import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
const injected = vi.hoisted(() => ({ runtime: vi.fn(), service: vi.fn() }));
vi.mock("../src/server/runtime.js", () => ({ getRuntime: injected.runtime }));
vi.mock("../src/server/quiz-runtime.js", () => ({ getQuizService: injected.service }));
import { GET as overview } from "../src/app/api/quiz/route.js";
import { POST as start } from "../src/app/api/quiz/attempts/route.js";
import { GET as resume } from "../src/app/api/quiz/attempts/[attemptId]/route.js";
import { POST as save } from "../src/app/api/quiz/attempts/[attemptId]/save/route.js";
import { POST as submit } from "../src/app/api/quiz/attempts/[attemptId]/submit/route.js";
import { QuizService } from "../src/quiz/service.js";
import { InMemoryQuizRepository } from "../src/quiz/memory-repository.js";
import { quizAttempt, quizMutation, quizOverview } from "../src/public-api/quiz.js";
const handlers = { overview, start, resume, save, submit };
type Endpoint = keyof typeof handlers;
const users = new WeakMap<Request,string>();
let repository: InMemoryQuizRepository; let service: QuizService;
beforeEach(() => {
  vi.clearAllMocks(); repository = new InMemoryQuizRepository(); service = new QuizService(repository);
  injected.runtime.mockReturnValue({ authenticator: { authenticate: async (r: Request) => users.has(r) ? {id:users.get(r)} : null } });
  injected.service.mockReturnValue(service);
});
async function request(endpoint: Endpoint, body?: unknown, options: {id?:string;owner?:string|null;raw?:string;headers?:Record<string,string>;query?:string} = {}) {
  const mutating = ["start","save","submit"].includes(endpoint);
  const req = new Request("http://localhost/api/quiz" + (options.query ?? ""), {method:mutating?"POST":"GET", headers:{...(mutating?{"content-type":"application/json"}:{}),...options.headers},
    ...(mutating?{body:options.raw ?? JSON.stringify(body ?? {})}:{})});
  const owner = options.owner === undefined ? "a" : options.owner; if (owner) users.set(req,owner);
  return handlers[endpoint](req,{params:Promise.resolve(options.id ? {attemptId:options.id} : {})});
}
async function begin() { const reply = await request("start",{requestId:randomUUID(),mode:"PRE_TEST"}); expect(reply.status).toBe(201); return quizMutation.parse((await reply.json()).data).attempt; }
it.each(Object.keys(handlers) as Endpoint[])("%s authenticates before database initialization and refuses owner-header shortcuts", async endpoint => {
  const response = await request(endpoint,{}, {id:"q-other",owner:null,headers:{"x-owner-id":"a",authorization:"Bearer ignored"}});
  expect(response.status).toBe(401); expect(injected.service).not.toHaveBeenCalled();
});
it("strict start accepts only mode and request ID, and replays without resampling", async () => {
  const input = {requestId:randomUUID(),mode:"POST_TEST"}; const first = await request("start",input);
  const initial = quizMutation.parse((await first.json()).data);
  const retry = await request("start",input); expect(retry.status).toBe(200);
  expect(quizMutation.parse((await retry.json()).data)).toEqual({...initial,duplicate:true});
  const invalid = await request("start",{...input,score:100}); expect(invalid.status).toBe(400);
  const changed = await request("start",{...input,mode:"PRE_TEST"}); expect(changed.status).toBe(409);
});
it.each(["origin","query","malformed","oversized","content-type"])("rejects %s before constructing Quiz persistence", async kind => {
  const options = kind === "origin" ? {headers:{origin:"https://evil.test"}} : kind === "query" ? {query:"?owner=a"}
    : kind === "malformed" ? {raw:"{"} : kind === "oversized" ? {raw:" ".repeat(65537)} : {headers:{"content-type":"text/plain"}};
  const response = await request("start",{requestId:randomUUID(),mode:"PRE_TEST"},options);
  expect(response.status).toBe(kind === "origin" ? 403 : kind === "oversized" ? 413 : 400);
  expect(injected.service).not.toHaveBeenCalled();
});
it("active responses omit answer keys and internal IDs; all responses are no-store", async () => {
  const a = await begin(); const response = await request("resume",undefined,{id:a.id});
  expect(response.headers.get("cache-control")).toBe("no-store"); expect(response.headers.get("vary")).toBe("Authorization, Cookie");
  const text = await response.text(); quizAttempt.parse(JSON.parse(text).data);
  expect(text).not.toMatch(/correctOptionId|explanation|source|ownerId|caseId|receipts|fingerprint|originalId/);
  expect(a.questions.flatMap(q=>q.options).every(o=>/^c[1-4]$/.test(o.id))).toBe(true);
});
it("scores on backend, persists atomically and reveals explanations after completion", async () => {
  const a = await begin(); const raw = (await repository.get(a.id,"a"))!;
  const input = {requestId:randomUUID(),expectedRevision:0,answers:raw.questions.map(q=>({questionId:q.id,optionId:q.correctOptionId}))};
  const incomplete = await request("submit",{...input,answers:input.answers.slice(1)},{id:a.id}); expect(incomplete.status).toBe(400);
  expect((await service.resume(a.id,"a")).answers).toEqual({});
  const response = await request("submit",input,{id:a.id}); expect(response.status).toBe(200);
  const result = quizMutation.parse((await response.json()).data).attempt;
  expect(result.result!.percentage).toBe(100); expect(result.questions.every(q=>q.review?.correct && q.review.source.url)).toBe(true);
  const duplicate = await request("submit",input,{id:a.id}); expect(quizMutation.parse((await duplicate.json()).data).duplicate).toBe(true);
  const late = await request("save",{...input,requestId:randomUUID(),expectedRevision:1},{id:a.id}); expect(late.status).toBe(422);
});
it.each(["resume","save","submit"] as const)("%s hides foreign and missing attempts with identical 404", async endpoint => {
  const a = await begin(); const payload = {requestId:randomUUID(),expectedRevision:0,answers:[]};
  const foreign = await request(endpoint,payload,{id:a.id,owner:"b"}); const missing = await request(endpoint,payload,{id:"missing",owner:"b"});
  expect(foreign.status).toBe(404); expect(missing.status).toBe(404); expect(await foreign.json()).toEqual(await missing.json());
});
it("rejects stale revision, repeated answers and client-made answer-key values", async () => {
  const a = await begin(); const q = a.questions[0]!; const answer = {questionId:q.id,optionId:q.options[0]!.id};
  for (const answers of [[answer,answer],[{...answer,optionId:"k1"}],[{...answer,questionId:"outside"}]]) {
    expect((await request("save",{requestId:randomUUID(),expectedRevision:0,answers},{id:a.id})).status).toBe(400);
  }
  expect((await request("save",{requestId:randomUUID(),expectedRevision:1,answers:[answer]},{id:a.id})).status).toBe(409);
});
it("overview returns owner history without private snapshots", async () => {
  await begin(); const response = await request("overview"); const value = quizOverview.parse((await response.json()).data);
  expect(value.history).toHaveLength(1); expect(value.questionCount).toBe(210);
  expect(JSON.stringify(value)).not.toMatch(/questions"|answers|ownerId|correctOptionId|snapshot/);
  const other = await request("overview",undefined,{owner:"b"}); expect(quizOverview.parse((await other.json()).data).history).toEqual([]);
});
