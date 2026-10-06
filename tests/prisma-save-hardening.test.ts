import { expect, it, vi } from "vitest";
import { PrismaTrainingRepository } from "../src/persistence/prisma-repository.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import type { TrainingSession } from "../src/domain/types.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { repositoryHarness } from "./repository-contract.js";
import { smsPhishingDialogueFixture as fixture } from "../src/fixtures/sms-phishing-dialogue.js";

// Adapter-level query-graph tests, NOT a substitute for dedicated real-MySQL rollback tests.
async function setup() {
  const h = await repositoryHarness(new InMemoryTrainingRepository());
  const before = await h.current(); await h.say(); const next = await h.current();
  const at = (v: number | null) => v === null ? null : new Date(v);
  const row = (s: TrainingSession) => ({ ...s, template: { configuration: fixture },
    revision: s.revision + 1, startedAt: at(s.startedAt), lastActivityAt: at(s.lastActivityAt), endedAt: at(s.endedAt),
    actions: s.actions.map(a => ({ ...a, at: at(a.at) })),
    opportunities: s.opportunities.map(o => ({ ...o, assessment: o.assessment ?? null, openedAt: at(o.openedAt), finalizedAt: at(o.finalizedAt) })),
    events: s.events.map(e => ({ ...e, at: at(e.at) })),
    messages: s.messages.map(m => ({ ...m, at: at(m.at) })), turns: s.dialogueTurns, result: null });
  const order: string[] = [];
  const create = (label: string) => vi.fn(async (_data: unknown) => { order.push(label); });
  const tx = { trainingSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: vi.fn().mockResolvedValue(row(before)), update: vi.fn() },
    trainingAction: { create: create("action") }, sessionOpportunity: { create: create("opportunity"), update: create("opportunity") },
    trainingEvent: { create: create("event") }, dialogueTurnReceipt: { create: create("receipt") },
    trainingMessage: { createMany: create("messages") }, trainingResult: { create: create("result") } };
  const beforeCommit = vi.fn();
  const transaction = vi.fn(async (run: (client: unknown) => Promise<unknown>, _options: unknown) => run(tx));
  const repo = new PrismaTrainingRepository({ $transaction: transaction } as unknown as PrismaClient, { beforeCommit });
  return { repo, tx, beforeCommit, transaction, before, next, order };
}
it("header shares the revision CAS and both dialogue messages use one strict batch after receipt", async () => {
  const h = await setup(); await h.repo.save(h.next, h.before.revision);
  expect(h.transaction.mock.calls[0]![1]).toEqual({ isolationLevel: "ReadCommitted", timeout: 15_000, maxWait: 5_000 });
  expect(h.tx.trainingSession.updateMany).toHaveBeenCalledExactlyOnceWith({ where: { id: h.next.id, revision: h.before.revision },
    data: { revision: { increment: 1 }, status: h.next.status, state: h.next.state, lastActivityAt: new Date(h.next.lastActivityAt), endedAt: null } });
  expect(h.tx.trainingSession.update).not.toHaveBeenCalled();
  expect(h.order).toEqual(["action", "receipt", "messages"]);
  expect(h.tx.trainingMessage.createMany.mock.calls[0]![0]).toEqual({ data: h.next.messages.map((m, position) => ({ ...m, sessionId: h.next.id, position, at: new Date(m.at) })) });
  expect(h.beforeCommit).toHaveBeenCalledOnce();
});
it("stale CAS cannot execute any readback, child insert or commit hook", async () => {
  const h = await setup(); h.tx.trainingSession.updateMany.mockResolvedValue({ count: 0 });
  await expect(h.repo.save(h.next, h.before.revision)).rejects.toThrow("REVISION_CONFLICT");
  expect(h.tx.trainingSession.findUniqueOrThrow).not.toHaveBeenCalled(); expect(h.order).toEqual([]);
  expect(h.beforeCommit).not.toHaveBeenCalled();
});
it("immutable identity is still checked inside the transaction before child writes", async () => {
  const h = await setup(); h.next.ownerId = "foreign";
  await expect(h.repo.save(h.next, h.before.revision)).rejects.toThrow("SESSION_IDENTITY_IMMUTABLE");
  expect(h.order).toEqual([]); expect(h.beforeCommit).not.toHaveBeenCalled();
});
it("unique/FK failure in the message batch is not skipped or converted into success", async () => {
  const h = await setup(), error = Object.assign(new Error("PRIVATE_DB_ERROR"), { code: "P2002" });
  h.tx.trainingMessage.createMany.mockRejectedValue(error);
  await expect(h.repo.save(h.next, h.before.revision)).rejects.toBe(error);
  expect(h.beforeCommit).not.toHaveBeenCalled(); expect(h.tx.trainingMessage.createMany).toHaveBeenCalledOnce();
});
