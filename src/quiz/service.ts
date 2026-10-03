import { createHash, randomInt } from "node:crypto";
import { BANK_VERSION, BLUEPRINT, quizBank, quizCategories } from "../fixtures/quiz-bank.js";
import { QuizError } from "./contracts.js";
import type { QuizAttempt, QuizMode, QuizRepository, Score } from "./contracts.js";

function shuffle<T>(values: readonly T[], pick: (max: number) => number): T[] {
  const output = structuredClone([...values]);
  for (let i = output.length - 1; i > 0; i--) { const j = pick(i + 1); [output[i], output[j]] = [output[j]!, output[i]!]; }
  return output;
}
const hash = (input: string) => createHash("sha256").update(input).digest("hex");
export function projectQuiz(attempt: QuizAttempt) {
  return { id: attempt.id, mode: attempt.mode, bankVersion: attempt.bankVersion, blueprint: attempt.blueprint,
    status: attempt.status, revision: attempt.revision, startedAt: attempt.startedAt, answers: structuredClone(attempt.answers), result: structuredClone(attempt.result),
    questions: attempt.questions.map(q => ({ id: q.id, category: q.category, categoryLabel: q.categoryLabel, prompt: q.prompt, options: structuredClone(q.options),
      ...(attempt.status === "COMPLETED" ? { review: { correctOptionId: q.correctOptionId, selectedOptionId: attempt.answers[q.id] ?? null,
        correct: attempt.answers[q.id] === q.correctOptionId, explanation: q.explanation, source: structuredClone(q.source) } } : {}),
    })),
  };
}
function calculate(attempt: QuizAttempt): Score {
  const categories = [...new Set(attempt.questions.map(q => q.category))].map(id => {
    const questions = attempt.questions.filter(q => q.category === id);
    return { id, label: questions[0]!.categoryLabel, correct: questions.filter(q => attempt.answers[q.id] === q.correctOptionId).length, total: questions.length };
  });
  const correct = categories.reduce((sum, c) => sum + c.correct, 0);
  return { correct, total: 20, percentage: correct * 5, categories };
}
export class QuizService {
  constructor(private readonly repository: QuizRepository, private readonly now: () => number = Date.now,
    private readonly pick: (max: number) => number = randomInt) {}
  async overview(ownerId: string) {
    return { bankVersion: BANK_VERSION, questionCount: quizBank.length, questionsPerAttempt: 20 as const,
      categories: quizCategories.map(c => ({ ...c, questionCount: quizBank.filter(q => q.category === c.id).length })),
      history: (await this.repository.recent(ownerId)).map(a => ({ id: a.id, mode: a.mode, status: a.status, startedAt: a.startedAt, result: a.result })),
    };
  }
  private async owned(id: string, ownerId: string) {
    const attempt = await this.repository.get(id, ownerId);
    if (!attempt) throw new QuizError("SESSION_NOT_FOUND");
    return attempt;
  }
  async resume(id: string, ownerId: string) { return projectQuiz(await this.owned(id, ownerId)); }
  async start(ownerId: string, input: { requestId: string; mode: QuizMode }) {
    const id = "q-" + hash(JSON.stringify([ownerId, input.requestId])).slice(0,48);
    const duplicate = await this.repository.get(id, ownerId);
    if (duplicate) {
      if (duplicate.mode !== input.mode) throw new QuizError("IDEMPOTENCY_CONFLICT");
      return { attempt: projectQuiz(duplicate), duplicate: true };
    }
    const startedAt = this.now();
    // At most one question from each fictional case in a round. Balanced fixed blueprint for Pre/Post comparability.
    const skills = shuffle(quizCategories.flatMap((_, i) => i < 6 ? ["RESPONSE", "EVIDENCE", "VERIFICATION"] as const : ["RESPONSE", "EVIDENCE"] as const), this.pick);
    let position = 0;
    const selected = quizCategories.flatMap(c => {
      const bank = quizBank.filter(q => q.category === c.id);
      const caseIds = shuffle([...new Set(bank.map(q => q.caseId))], this.pick).slice(0,c.perAttempt);
      return caseIds.map(caseId => {
        const skill = skills[position++];
        return bank.find(q => q.caseId === caseId && q.skill === skill)!;
      });
    });
    const questions = shuffle(selected, this.pick).map(q => {
      const options = shuffle(q.options, this.pick).map((o, i) => ({ originalId: o.id, id: `c${i+1}`, label: o.label }));
      return { ...q, correctOptionId: options.find(o => o.originalId === q.correctOptionId)!.id,
        options: options.map(({ id: optionId, label }) => ({ id: optionId, label })) };
    });
    const pre = input.mode === "POST_TEST" ? await this.repository.latestPreTest(ownerId, BANK_VERSION, BLUEPRINT, startedAt) : null;
    const baseline = pre?.result ? { attemptId: pre.id, completedAt: pre.result.completedAt,
      score: { correct: pre.result.correct, total: pre.result.total, percentage: pre.result.percentage, categories: structuredClone(pre.result.categories) } } : null;
    const attempt: QuizAttempt = { id, ownerId, mode: input.mode, bankVersion: BANK_VERSION, blueprint: BLUEPRINT,
      status: "ACTIVE", revision: 0, startedAt, questions, answers: {}, baseline, result: null, receipts: [] };
    if (await this.repository.create(attempt)) return { attempt: projectQuiz(attempt), duplicate: false };
    const raced = await this.owned(id, ownerId);
    if (raced.mode !== input.mode) throw new QuizError("IDEMPOTENCY_CONFLICT");
    return { attempt: projectQuiz(raced), duplicate: true };
  }
  async write(id: string, ownerId: string, kind: "SAVE" | "SUBMIT", input: {
    requestId: string; expectedRevision: number; answers: { questionId: string; optionId: string }[];
  }) {
    const attempt = await this.owned(id, ownerId);
    const answers = [...input.answers].sort((a,b) => a.questionId.localeCompare(b.questionId));
    if (new Set(answers.map(a => a.questionId)).size !== answers.length) throw new QuizError("INVALID_REQUEST");
    const fingerprint = hash(JSON.stringify([kind, input.expectedRevision, answers]));
    const replay = attempt.receipts.find(r => r.requestId === input.requestId);
    if (replay) {
      if (replay.fingerprint !== fingerprint) throw new QuizError("IDEMPOTENCY_CONFLICT");
      return { attempt: projectQuiz(attempt), duplicate: true };
    }
    if (attempt.status !== "ACTIVE") throw new QuizError("SESSION_NOT_ACTIVE");
    if (attempt.revision !== input.expectedRevision) throw new QuizError("REVISION_CONFLICT");
    for (const answer of answers) {
      const question = attempt.questions.find(q => q.id === answer.questionId);
      if (!question?.options.some(o => o.id === answer.optionId)) throw new QuizError("INVALID_REQUEST");
      attempt.answers[answer.questionId] = answer.optionId;
    }
    if (kind === "SUBMIT") {
      if (attempt.questions.some(q => !attempt.answers[q.id])) throw new QuizError("INVALID_REQUEST");
      const score = calculate(attempt);
      attempt.result = { ...score, completedAt: this.now(), baseline: attempt.baseline,
        changePercentagePoints: attempt.baseline ? score.percentage - attempt.baseline.score.percentage : null };
      attempt.status = "COMPLETED";
    }
    attempt.revision++;
    attempt.receipts.push({ requestId: input.requestId, fingerprint });
    if (await this.repository.commit(attempt, input.expectedRevision)) return { attempt: projectQuiz(attempt), duplicate: false };
    // A simultaneous retry may have committed the same receipt; reconcile without applying twice.
    const latest = await this.owned(id, ownerId);
    const receipt = latest.receipts.find(r => r.requestId === input.requestId);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw new QuizError("IDEMPOTENCY_CONFLICT");
      return { attempt: projectQuiz(latest), duplicate: true };
    }
    throw new QuizError("REVISION_CONFLICT");
  }
}
