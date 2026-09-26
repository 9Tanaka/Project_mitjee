export type QuizMode = "PRE_TEST" | "POST_TEST";
export type CategoryId = "FINANCE" | "IMPERSONATION" | "ACCOUNT" | "SHOPPING_JOB" | "RELATIONSHIP" | "EDUCATION_TRAVEL" | "PRIZE_RECOVERY";
export type QuizSkill = "RESPONSE" | "EVIDENCE" | "VERIFICATION";
export interface Question {
  id: string; caseId: string; category: CategoryId; categoryLabel: string; skill: QuizSkill; prompt: string;
  options: { id: string; label: string }[]; correctOptionId: string; explanation: string;
  source: { title: string; url: string };
}
export interface Score {
  correct: number; total: number; percentage: number;
  categories: { id: CategoryId; label: string; correct: number; total: number }[];
}
export interface Baseline { attemptId: string; completedAt: number; score: Score }
export interface QuizResult extends Score {
  completedAt: number; baseline: Baseline | null; changePercentagePoints: number | null;
}
export interface QuizAttempt {
  id: string; ownerId: string; mode: QuizMode; bankVersion: string; blueprint: string;
  status: "ACTIVE" | "COMPLETED"; revision: number; startedAt: number;
  questions: Question[]; answers: Record<string, string>; baseline: Baseline | null; result: QuizResult | null;
  receipts: { requestId: string; fingerprint: string }[];
}
export interface QuizRepository {
  create(attempt: QuizAttempt): Promise<boolean>;
  get(id: string, ownerId: string): Promise<QuizAttempt | null>;
  recent(ownerId: string): Promise<QuizAttempt[]>;
  latestPreTest(ownerId: string, bankVersion: string, blueprint: string, before: number): Promise<QuizAttempt | null>;
  commit(attempt: QuizAttempt, expectedRevision: number): Promise<boolean>;
}
export class QuizError extends Error {
  constructor(readonly code: "SESSION_NOT_FOUND" | "INVALID_REQUEST" | "REVISION_CONFLICT" | "IDEMPOTENCY_CONFLICT" | "SESSION_NOT_ACTIVE") { super(code); }
}
