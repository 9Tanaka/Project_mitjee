import { expect, it } from "vitest";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaQuizRepository } from "../src/persistence/quiz-repository.js";

it.each(["get", "recent", "latestPreTest"] as const)("Quiz %s reads rows and receipts in a repeatable-read transaction", async operation => {
  const row = { id: "quiz", ownerId: "owner", mode: "PRE_TEST", bankVersion: "bank", blueprint: "blueprint",
    status: "ACTIVE", revision: 0, startedAt: new Date(1000), snapshot: { questions: [], baseline: null },
    answers: {}, result: null, receipts: [] };
  let snapshotReads = 0;
  const tx = { quizAttempt: { findFirst: async () => { snapshotReads++; return row; },
    findMany: async () => { snapshotReads++; return [row]; } } };
  const client = {
    // Using the unprotected client path would expose a mixed receipt/revision view.
    quizAttempt: { findFirst: async () => { throw new Error("Read outside coherent snapshot"); },
      findMany: async () => { throw new Error("Read outside coherent snapshot"); } },
    $transaction: async (read: (transaction: typeof tx) => Promise<unknown>, options: { isolationLevel: string }) => {
      expect(options.isolationLevel).toBe("RepeatableRead");
      return read(tx);
    },
  } as unknown as PrismaClient;
  const repository = new PrismaQuizRepository(client);
  const result = operation === "get" ? await repository.get("quiz", "owner")
    : operation === "recent" ? (await repository.recent("owner"))[0]
      : await repository.latestPreTest("owner", "bank", "blueprint", 1000);
  expect(result).toMatchObject({ revision: 0, receipts: [], status: "ACTIVE" });
  expect(snapshotReads).toBe(1);
});
