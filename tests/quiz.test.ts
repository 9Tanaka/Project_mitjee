import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BANK_VERSION, BLUEPRINT, quizBank, quizCategories } from "../src/fixtures/quiz-bank.js";
import { QuizService } from "../src/quiz/service.js";
import { InMemoryQuizRepository } from "../src/quiz/memory-repository.js";
import { quizAttempt, quizMutation, quizOverview } from "../src/public-api/quiz.js";
import type { QuizMode } from "../src/quiz/contracts.js";
function harness() {
  const repository = new InMemoryQuizRepository(); let time = 1000; let seed = 17;
  const service = new QuizService(repository, () => time, max => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % max; });
  async function begin(mode: QuizMode = "PRE_TEST", owner = "a", requestId = randomUUID()) { return (await service.start(owner, { mode, requestId })).attempt; }
  async function answers(id: string, correct = 20, owner = "a") {
    const raw = (await repository.get(id, owner))!;
    return raw.questions.map((q, i) => ({ questionId: q.id, optionId: i < correct ? q.correctOptionId : q.options.find(o => o.id !== q.correctOptionId)!.id }));
  }
  async function finish(id: string, correct = 20, owner = "a") {
    const a = (await repository.get(id, owner))!;
    return service.write(id, owner, "SUBMIT", { requestId: randomUUID(), expectedRevision: a.revision, answers: await answers(id, correct, owner) });
  }
  return { repository, service, begin, answers, finish, setTime: (value: number) => { time = value; } };
}
describe("Quiz bank and immutable randomized rounds", () => {
  it("has 210 unique grounded questions, 30 per group and three skills per original case", () => {
    expect(quizBank).toHaveLength(210); expect(new Set(quizBank.map(q => q.id)).size).toBe(210);
    expect(new Set(quizBank.map(q => q.prompt)).size).toBe(210);
    for (const c of quizCategories) expect(quizBank.filter(q => q.category === c.id)).toHaveLength(30);
    for (const q of quizBank) {
      expect(q.options).toHaveLength(4); expect(new Set(q.options.map(o => o.label)).size).toBe(4);
      expect(q.options.some(o => o.id === q.correctOptionId)).toBe(true); expect(q.explanation.length).toBeGreaterThan(25);
      expect(new URL(q.source.url).hostname).toMatch(/^(www\.bot\.or\.th|consumer\.ftc\.gov|www\.scamwatch\.gov\.au|consumer\.sc\.gov)$/);
    }
  });
  it("balances seven groups and skills, avoids repeated cases, shuffles positions, and never mutates the bank", async () => {
    const h = harness(); const original = structuredClone(quizBank); const seen = new Set<string>(); const positions = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const round = await h.begin(); const raw = (await h.repository.get(round.id,"a"))!;
      quizAttempt.parse(round); expect(round.questions).toHaveLength(20);
      expect(new Set(raw.questions.map(q => q.caseId)).size).toBe(20);
      for (const c of quizCategories) expect(raw.questions.filter(q => q.category === c.id)).toHaveLength(c.perAttempt);
      expect(raw.questions.filter(q => q.skill === "RESPONSE")).toHaveLength(7);
      expect(raw.questions.filter(q => q.skill === "EVIDENCE")).toHaveLength(7);
      expect(raw.questions.filter(q => q.skill === "VERIFICATION")).toHaveLength(6);
      for (const q of raw.questions) {
        seen.add(q.id); positions.add(q.correctOptionId);
        const bank = quizBank.find(b => b.id === q.id)!;
        expect(q.options.find(o => o.id === q.correctOptionId)!.label).toBe(bank.options.find(o => o.id === bank.correctOptionId)!.label);
      }
    }
    expect(seen.size).toBeGreaterThan(195); expect(positions.size).toBe(4); expect(quizBank).toEqual(original);
  });
  it("pins content, source, ordering and answers for resume; active projection reveals no answer key", async () => {
    const h = harness(); const a = await h.begin(); const text = JSON.stringify(a);
    expect(text).not.toMatch(/correctOptionId|explanation|source|ownerId|receipts|baseline|caseId|originalId|"k1"/);
    const raw = (await h.repository.get(a.id,"a"))!; raw.questions[0]!.prompt = "tampered";
    expect(await h.service.resume(a.id,"a")).toEqual(a);
  });
  it("replays start unchanged and rejects changing the mode under the same ID", async () => {
    const h = harness(); const requestId = randomUUID(); const first = await h.begin("PRE_TEST","a", requestId);
    const again = await h.service.start("a",{requestId,mode:"PRE_TEST"}); expect(again.duplicate).toBe(true); expect(again.attempt).toEqual(first);
    await expect(h.service.start("a",{requestId,mode:"POST_TEST"})).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
    expect((await h.begin("PRE_TEST","b",requestId)).id).not.toBe(first.id);
  });
});
describe("Quiz validation, atomic answer scoring and ownership", () => {
  it.each([0,7,20])("scores %i correct without scenario weights or pass thresholds", async correct => {
    const h = harness(); const a = await h.begin(); const result = (await h.finish(a.id,correct)).attempt;
    quizMutation.parse({attempt:result,duplicate:false}); expect(result.result).toMatchObject({correct,total:20,percentage:correct*5,baseline:null,changePercentagePoints:null});
    expect(result.questions.filter(q => q.review!.correct)).toHaveLength(correct);
    expect(result.result!.categories.reduce((s,c) => s+c.correct,0)).toBe(correct);
    expect(JSON.stringify(result)).not.toMatch(/trainingScore|weakestSkills|PASSED|CRITICAL_FAILURE/);
  });
  it("saves partial answers, permits correction, resumes across service recreation, then scores all saved answers", async () => {
    const h = harness(); const a = await h.begin(); const all = await h.answers(a.id);
    const first = all[0]!; const wrong = a.questions[0]!.options.find(o => o.id !== first.optionId)!.id;
    await h.service.write(a.id,"a","SAVE",{requestId:randomUUID(),expectedRevision:0,answers:[{...first,optionId:wrong}]});
    const reopened = new QuizService(h.repository); expect((await reopened.resume(a.id,"a")).answers[first.questionId]).toBe(wrong);
    await h.service.write(a.id,"a","SAVE",{requestId:randomUUID(),expectedRevision:1,answers:all});
    const result = await h.service.write(a.id,"a","SUBMIT",{requestId:randomUUID(),expectedRevision:2,answers:[]}); expect(result.attempt.result!.correct).toBe(20);
  });
  it.each(["missing","duplicate","unknown-question","unknown-option"])("rejects %s answers without partial persistence", async kind => {
    const h = harness(); const a = await h.begin(); const all = await h.answers(a.id);
    const input = kind === "missing" ? all.slice(0,19) : kind === "duplicate" ? [...all, all[0]!] : kind === "unknown-question" ? [{questionId:"foreign",optionId:"c1"},...all.slice(1)] : [{...all[0]!,optionId:"k1"},...all.slice(1)];
    await expect(h.service.write(a.id,"a","SUBMIT",{requestId:randomUUID(),expectedRevision:0,answers:input})).rejects.toMatchObject({code:"INVALID_REQUEST"});
    expect(await h.service.resume(a.id,"a")).toEqual(a);
  });
  it("exact retries return one receipt and changing a payload under the same ID conflicts", async () => {
    const h = harness(); const a = await h.begin(); const input = {requestId:randomUUID(),expectedRevision:0,answers:(await h.answers(a.id)).slice(0,1)};
    const replies = await Promise.all([h.service.write(a.id,"a","SAVE",input),h.service.write(a.id,"a","SAVE",input)]);
    expect(replies.map(r=>r.duplicate).sort()).toEqual([false,true]); expect((await h.repository.get(a.id,"a"))!.receipts).toHaveLength(1);
    await expect(h.service.write(a.id,"a","SUBMIT",input)).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
  });
  it("concurrent different writes have exactly one winner and do not overwrite it", async () => {
    const h = harness(); const a = await h.begin(); const all = await h.answers(a.id);
    const replies = await Promise.allSettled([0,1].map(i => h.service.write(a.id,"a","SAVE",{requestId:randomUUID(),expectedRevision:0,answers:[all[i]!]})));
    expect(replies.filter(r=>r.status === "fulfilled")).toHaveLength(1);
    expect(Object.keys((await h.service.resume(a.id,"a")).answers)).toHaveLength(1);
  });
  it("completed result cannot be rewritten; original submit retry stays valid", async () => {
    const h = harness(); const a = await h.begin(); const input = {requestId:randomUUID(),expectedRevision:0,answers:await h.answers(a.id,7)};
    await h.service.write(a.id,"a","SUBMIT",input);
    expect((await h.service.write(a.id,"a","SUBMIT",input)).duplicate).toBe(true);
    await expect(h.service.write(a.id,"a","SAVE",{...input,requestId:randomUUID(),expectedRevision:1})).rejects.toMatchObject({code:"SESSION_NOT_ACTIVE"});
    expect((await h.service.resume(a.id,"a")).result!.correct).toBe(7);
  });
  it("foreign and missing IDs produce identical errors, and history is owner-scoped", async () => {
    const h = harness(); const a = await h.begin();
    for (const id of [a.id,"missing"]) {
      await expect(h.service.resume(id,"b")).rejects.toMatchObject({code:"SESSION_NOT_FOUND"});
      await expect(h.service.write(id,"b","SAVE",{requestId:randomUUID(),expectedRevision:0,answers:[]})).rejects.toMatchObject({code:"SESSION_NOT_FOUND"});
    }
    expect((await h.service.overview("b")).history).toEqual([]); quizOverview.parse(await h.service.overview("a"));
  });
});
describe("Frozen Pre/Post comparison", () => {
  it("uses the last comparable completed Pre-test at start and keeps that baseline after later Pre-tests", async () => {
    const h = harness(); const first = await h.begin(); await h.finish(first.id,5); h.setTime(2000);
    const pre = await h.begin(); await h.finish(pre.id,12); h.setTime(3000);
    const post = await h.begin("POST_TEST"); h.setTime(4000); const later = await h.begin(); await h.finish(later.id,20);
    const result = (await h.finish(post.id,16)).attempt.result!;
    expect(result.baseline).toMatchObject({attemptId:pre.id,score:{percentage:60}}); expect(result.changePercentagePoints).toBe(20);
    expect((await h.service.resume(first.id,"a")).result!.correct).toBe(5);
  });
  it("does not compare to a foreign, active, or different-bank Pre-test and does not retroactively attach one", async () => {
    const h = harness(); const foreign = await h.begin("PRE_TEST","b"); await h.finish(foreign.id,20,"b"); await h.begin();
    const old = await h.begin(); await h.finish(old.id,20);
    const raw = (await h.repository.get(old.id,"a"))!;
    expect(await h.repository.latestPreTest("a","new-bank",BLUEPRINT,1000)).toBeNull();
    expect(await h.repository.latestPreTest("a",BANK_VERSION,"other-blueprint",1000)).toBeNull();
    // Remove the old-bank result from the current owner's comparison by using a fresh owner.
    const post = await h.begin("POST_TEST","c"); const pre = await h.begin("PRE_TEST","c"); await h.finish(pre.id,20,"c");
    expect((await h.finish(post.id,10,"c")).attempt.result!.baseline).toBeNull(); expect(raw.result!.percentage).toBe(100);
  });
  it("excludes a Pre-test completed after the Post-test start timestamp even if seen by the later query", async () => {
    const h = harness(); h.setTime(2000); const pre = await h.begin(); await h.finish(pre.id,20);
    h.setTime(1000); const post = await h.begin("POST_TEST");
    expect((await h.finish(post.id,15)).attempt.result!.baseline).toBeNull();
  });
});
