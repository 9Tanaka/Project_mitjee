import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../src/persistence/prisma-client.js";
import { PrismaQuizRepository } from "../src/persistence/quiz-repository.js";
import { QuizService } from "../src/quiz/service.js";
const url = process.env.MYSQL_TEST_DATABASE_URL;
if (url && !/^mitjee_test(?:_[a-z0-9_]+)?$/.test(new URL(url).pathname.slice(1))) throw new Error("Quiz tests require a dedicated mitjee_test database");
const key = process.env.MYSQL_TEST_RSA_PUBLIC_KEY_PATH;
const client = url ? createPrismaClient(url,key ? {loopbackRsaPublicKey:key} : {}) : null;
const created: string[] = [];
afterAll(async()=>{ try { if (created.length) await client?.quizAttempt.deleteMany({where:{id:{in:created}}}); } finally { await client?.$disconnect(); } });
describe.skipIf(!client)("Quiz real MySQL transactions (no database mock)",()=>{
  function harness(beforeCommit?:()=>void) {
    const repository = new PrismaQuizRepository(client!,beforeCommit); const service = new QuizService(repository);
    const owner = "quiz-test-"+randomUUID();
    async function begin() { const reply=await service.start(owner,{mode:"PRE_TEST",requestId:randomUUID()}); created.push(reply.attempt.id); return reply.attempt; }
    return {repository,service,owner,begin};
  }
  it("persists frozen snapshots, partial choices and final score across service recreation",async()=>{
    const h=harness(); const a=await h.begin(); const raw=(await h.repository.get(a.id,h.owner))!;
    const answers=raw.questions.map(q=>({questionId:q.id,optionId:q.correctOptionId}));
    await h.service.write(a.id,h.owner,"SAVE",{requestId:randomUUID(),expectedRevision:0,answers:answers.slice(0,4)});
    const reopened=new QuizService(new PrismaQuizRepository(client!)); expect(Object.keys((await reopened.resume(a.id,h.owner)).answers)).toHaveLength(4);
    await reopened.write(a.id,h.owner,"SUBMIT",{requestId:randomUUID(),expectedRevision:1,answers});
    const result=await reopened.resume(a.id,h.owner); expect(result.result!.percentage).toBe(100);
    expect(result.questions.map(q=>q.prompt)).toEqual(a.questions.map(q=>q.prompt));
    expect(await h.repository.get(a.id,"other")).toBeNull();
  });
  it("rolls back answers, result, status, revision and receipt on a failure after writes",async()=>{
    const h=harness(()=>{throw new Error("injected rollback");}); const a=await h.begin(); const raw=(await h.repository.get(a.id,h.owner))!;
    await expect(h.service.write(a.id,h.owner,"SUBMIT",{requestId:randomUUID(),expectedRevision:0,answers:raw.questions.map(q=>({questionId:q.id,optionId:q.correctOptionId}))})).rejects.toThrow("injected rollback");
    expect(await h.service.resume(a.id,h.owner)).toEqual(a);
    expect((await h.repository.get(a.id,h.owner))!.receipts).toHaveLength(0);
  });
  it("concurrent different requests have one winner, preserving the same CAS behavior as memory",async()=>{
    const h=harness(); const a=await h.begin(); const q=a.questions[0]!;
    const replies=await Promise.allSettled([0,1].map(i=>h.service.write(a.id,h.owner,"SAVE",{requestId:randomUUID(),expectedRevision:0,answers:[{questionId:q.id,optionId:q.options[i]!.id}]})));
    expect(replies.filter(r=>r.status==="fulfilled")).toHaveLength(1); expect((await h.repository.get(a.id,h.owner))!.receipts).toHaveLength(1);
  });
  it("simultaneous exact submit retries persist a single final result and receipt",async()=>{
    const h=harness(); const a=await h.begin(); const raw=(await h.repository.get(a.id,h.owner))!;
    const input={requestId:randomUUID(),expectedRevision:0,answers:raw.questions.map(q=>({questionId:q.id,optionId:q.correctOptionId}))};
    const replies=await Promise.all([h.service.write(a.id,h.owner,"SUBMIT",input),h.service.write(a.id,h.owner,"SUBMIT",input)]);
    expect(replies.map(r=>r.duplicate).sort()).toEqual([false,true]); expect((await h.repository.get(a.id,h.owner))!.revision).toBe(1);
  });
});
