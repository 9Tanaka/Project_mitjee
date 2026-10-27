import { expect, it, vi } from "vitest";
import { saveScopeTransaction, installSaveReloadShadow } from "../scripts/shadow-aggregate/save-reload.mjs";
import { readTrainingAggregate } from "../src/persistence/aggregate-reader.js";
import type { Prisma } from "../src/generated/prisma/client.js";

it("SAVE candidate changes only the root owner predicate and binds only the existing session ID", async () => {
  const query = vi.fn().mockResolvedValue([]);
  await readTrainingAggregate(saveScopeTransaction({ $queryRawUnsafe: query }) as unknown as Prisma.TransactionClient, "private-id' OR 1=1", "private-owner");
  const args = query.mock.calls[0]!; expect(args[0]).toMatch(/WHERE s\.id=\$1$/);
  expect(args[0]).not.toContain('AND s."ownerId"=$2'); expect(args[0]).not.toContain("private-id");
  expect(args.slice(1)).toEqual(["private-id' OR 1=1"]);
});
it("scope adapter refuses a query outside the fixed aggregate boundary", () => {
  const query = vi.fn(), tx = saveScopeTransaction({ $queryRawUnsafe: query });
  expect(() => tx.$queryRawUnsafe("UPDATE anything", "id", "owner")).toThrow("UNEXPECTED_AGGREGATE_QUERY"); expect(query).not.toHaveBeenCalled();
});
it("a candidate mismatch/rejection cannot replace the authoritative row or stop its write", async () => {
  const baseline = { revision: 1, ownerId: "owner" }, written = vi.fn();
  const tx = { trainingSession: { updateMany: async () => ({ count: 1 }), findUniqueOrThrow: async (_args?: unknown) => baseline } };
  const repo = { async transaction(_op: string, run: (client: typeof tx) => Promise<unknown>) { return run(tx); },
    async save(next: typeof baseline, _expected: number) {
      return this.transaction("SAVE", async tx => { await tx.trainingSession.updateMany(); const row = await tx.trainingSession.findUniqueOrThrow({ where: { id: "id" } } as never); expect(row).toBe(baseline); written(next); });
    } };
  const shadow = installSaveReloadShadow(repo, { readAggregate: async () => ({ ...baseline, ownerId: "PRIVATE_CANDIDATE" }), decode: (v: unknown) => structuredClone(v),
    assertUpdate: (current: typeof baseline) => { if (current.ownerId !== "owner") throw Object.assign(new Error(), { code: "SESSION_IDENTITY_IMMUTABLE" }); } });
  await shadow.run("mismatch", () => repo.save({ revision: 1, ownerId: "owner" }, 0)); expect(written).toHaveBeenCalledOnce();
  expect(shadow.comparisons[0]).toMatchObject({ baselineValidation: "ACCEPT", candidateValidation: "SESSION_IDENTITY_IMMUTABLE", rowMismatches: ["SCALAR_VALUE"] });
  expect(JSON.stringify(shadow.comparisons)).not.toContain("PRIVATE_CANDIDATE");
});
it("stale CAS never calls either reload or candidate", async () => {
  const read = vi.fn(), candidate = vi.fn();
  const tx = { trainingSession: { updateMany: async () => ({ count: 0 }), findUniqueOrThrow: read } };
  const repo = { async transaction(_op: string, run: (client: typeof tx) => Promise<unknown>) { return run(tx); }, async save(_next: unknown, _revision: number) {
    return this.transaction("SAVE", async tx => { const c = await tx.trainingSession.updateMany(); if (!c.count) throw Object.assign(new Error(), { code: "REVISION_CONFLICT" }); await tx.trainingSession.findUniqueOrThrow(); });
  } };
  const shadow = installSaveReloadShadow(repo, { readAggregate: candidate, decode: (v: unknown) => v, assertUpdate: () => {} });
  await expect(shadow.run("stale", () => repo.save({}, 0))).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  expect(read).not.toHaveBeenCalled(); expect(candidate).not.toHaveBeenCalled(); expect(shadow.comparisons).toEqual([]);
});
