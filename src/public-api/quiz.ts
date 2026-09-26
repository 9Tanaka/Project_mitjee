import { z } from "zod";
export const quizMode = z.enum(["PRE_TEST", "POST_TEST"]);
export const quizCategoryId = z.enum(["FINANCE", "IMPERSONATION", "ACCOUNT", "SHOPPING_JOB", "RELATIONSHIP", "EDUCATION_TRAVEL", "PRIZE_RECOVERY"]);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const option = z.strictObject({ id, label: z.string() });
const categoryScore = z.strictObject({ id: quizCategoryId, label: z.string(), correct: z.number().int().nonnegative(), total: z.number().int().positive() });
const score = { correct: z.number().int().nonnegative(), total: z.literal(20), percentage: z.number().min(0).max(100), categories: z.array(categoryScore).length(7) };
export const quizResult = z.strictObject({ ...score, completedAt: z.number(),
  baseline: z.strictObject({ attemptId: id, completedAt: z.number(), score: z.strictObject(score) }).nullable(),
  changePercentagePoints: z.number().min(-100).max(100).nullable(),
});
export const quizAttempt = z.strictObject({
  id, mode: quizMode, bankVersion: z.string(), blueprint: z.string(), status: z.enum(["ACTIVE", "COMPLETED"]),
  revision: z.number().int().nonnegative(), startedAt: z.number(),
  questions: z.array(z.strictObject({ id, category: quizCategoryId, categoryLabel: z.string(), prompt: z.string(), options: z.array(option).length(4),
    review: z.strictObject({ correctOptionId: id, selectedOptionId: id.nullable(), correct: z.boolean(), explanation: z.string(), source: z.strictObject({ title: z.string(), url: z.url() }) }).optional(),
  })).length(20),
  answers: z.record(id, id), result: quizResult.nullable(),
});
export const quizMutation = z.strictObject({ attempt: quizAttempt, duplicate: z.boolean() });
export const quizOverview = z.strictObject({ bankVersion: z.string(), questionCount: z.number().int(), questionsPerAttempt: z.literal(20),
  categories: z.array(z.strictObject({ id: quizCategoryId, label: z.string(), questionCount: z.number().int(), perAttempt: z.number().int() })).length(7),
  history: z.array(z.strictObject({ id, mode: quizMode, status: z.enum(["ACTIVE", "COMPLETED"]), startedAt: z.number(), result: quizResult.nullable() })).max(50),
});
export const quizStartRequest = z.strictObject({ requestId: z.uuid(), mode: quizMode });
export const quizWriteRequest = z.strictObject({ requestId: z.uuid(), expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), answers: z.array(z.strictObject({ questionId: id, optionId: id })).max(20) });
export const quizParams = z.strictObject({ attemptId: id });
export type PublicQuizAttempt = z.infer<typeof quizAttempt>;
