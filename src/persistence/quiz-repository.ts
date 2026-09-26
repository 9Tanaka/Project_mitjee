import { Prisma } from "../generated/prisma/client.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { QuizAttempt, QuizRepository } from "../quiz/contracts.js";

const include = { receipts: { orderBy: { revision: "asc" as const } } };
type Row = Prisma.QuizAttemptGetPayload<{ include: typeof include }>;
const json = (value: unknown) => structuredClone(value) as Prisma.InputJsonValue;
function decode(row: Row): QuizAttempt {
  const snapshot = row.snapshot as unknown as Pick<QuizAttempt, "questions" | "baseline">;
  return { id: row.id, ownerId: row.ownerId, mode: row.mode as QuizAttempt["mode"], bankVersion: row.bankVersion,
    blueprint: row.blueprint, status: row.status as QuizAttempt["status"], revision: row.revision, startedAt: row.startedAt.getTime(),
    questions: snapshot.questions, baseline: snapshot.baseline, answers: row.answers as Record<string,string>,
    result: row.result as unknown as QuizAttempt["result"], receipts: row.receipts.map(r => ({ requestId: r.requestId, fingerprint: r.fingerprint })) };
}
const uniqueConflict = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
export class PrismaQuizRepository implements QuizRepository {
  constructor(private readonly client: PrismaClient, private readonly beforeCommit?: () => void | Promise<void>) {}
  async create(a: QuizAttempt) {
    try {
      await this.client.quizAttempt.create({ data: { id: a.id, ownerId: a.ownerId, mode: a.mode, bankVersion: a.bankVersion,
        blueprint: a.blueprint, status: "ACTIVE", revision: 0, startedAt: new Date(a.startedAt),
        snapshot: json({ questions: a.questions, baseline: a.baseline }), answers: json({}) } });
      return true;
    } catch (error) { if (uniqueConflict(error)) return false; throw error; }
  }
  async get(id: string, ownerId: string) {
    // Prisma may fetch included receipts in another SELECT. Pin both reads to
    // one snapshot so a concurrent submit cannot mix an old revision with a new receipt.
    return this.client.$transaction(async tx => {
      const row = await tx.quizAttempt.findFirst({ where: { id, ownerId }, include });
      return row ? decode(row) : null;
    }, { isolationLevel: "RepeatableRead" });
  }
  async recent(ownerId: string) {
    return this.client.$transaction(async tx => {
      const rows = await tx.quizAttempt.findMany({ where: { ownerId }, include, orderBy: [{ startedAt: "desc" }, { id: "desc" }], take: 50 });
      return rows.map(decode);
    }, { isolationLevel: "RepeatableRead" });
  }
  async latestPreTest(ownerId: string, bankVersion: string, blueprint: string, before: number) {
    return this.client.$transaction(async tx => {
      const row = await tx.quizAttempt.findFirst({ where: { ownerId, bankVersion, blueprint, mode: "PRE_TEST", status: "COMPLETED", completedAt: { lte: new Date(before) } }, include,
        orderBy: [{ completedAt: "desc" }, { id: "desc" }] });
      return row ? decode(row) : null;
    }, { isolationLevel: "RepeatableRead" });
  }
  async commit(a: QuizAttempt, expectedRevision: number) {
    try {
      return await this.client.$transaction(async tx => {
        const changed = await tx.quizAttempt.updateMany({ where: { id: a.id, ownerId: a.ownerId, revision: expectedRevision, status: "ACTIVE" },
          data: { revision: expectedRevision + 1, status: a.status, answers: json(a.answers),
            result: a.result ? json(a.result) : Prisma.DbNull, completedAt: a.result ? new Date(a.result.completedAt) : null } });
        if (changed.count !== 1) return false;
        const receipt = a.receipts.at(-1)!;
        await tx.quizReceipt.create({ data: { attemptId: a.id, requestId: receipt.requestId, fingerprint: receipt.fingerprint, revision: expectedRevision + 1 } });
        await this.beforeCommit?.();
        return true;
      });
    } catch (error) { if (uniqueConflict(error)) return false; throw error; }
  }
}
