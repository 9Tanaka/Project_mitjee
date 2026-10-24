import { expect, it, vi } from "vitest";
import type { Prisma } from "../src/generated/prisma/client.js";
import { readTrainingAggregate, readTrainingAggregateAfterCas } from "../src/persistence/aggregate-reader.js";

it("GET keeps its owner predicate while post-CAS SAVE uses only a bound ID and preserves P2025", async () => {
  const query = vi.fn().mockResolvedValue([]), tx = { $queryRawUnsafe: query } as unknown as Prisma.TransactionClient;
  expect(await readTrainingAggregate(tx, "private-id' OR 1=1", "owner")).toBeNull();
  await expect(readTrainingAggregateAfterCas(tx, "private-id' OR 1=1")).rejects.toMatchObject({ code: "P2025" });
  expect(query.mock.calls[0]![0]).toMatch(/WHERE s\.id=\$1 AND s\."ownerId"=\$2$/);
  expect(query.mock.calls[0]!.slice(1)).toEqual(["private-id' OR 1=1", "owner"]);
  expect(query.mock.calls[1]![0]).toBe(query.mock.calls[0]![0].replace('WHERE s.id=$1 AND s."ownerId"=$2', 'WHERE s.id=$1'));
  expect(query.mock.calls[1]!.slice(1)).toEqual(["private-id' OR 1=1"]);
  expect(query.mock.calls[1]![0]).not.toContain("private-id");
});

it("post-CAS SAVE reuses the supported-ordering guard without altering malformed rows", async () => {
  const row = { revision: 2, startedAt: "1970-01-01T00:00:00Z", lastActivityAt: "1970-01-01T00:00:00Z", endedAt: null,
    actions: [], opportunities: [], events: [], messages: [{ position: 0, at: "1970-01-01T00:00:00Z" }, { position: 0, at: "1970-01-01T00:00:00Z" }], turns: [], result: null };
  const query = vi.fn().mockResolvedValue([{ aggregate: row }]);
  await expect(readTrainingAggregateAfterCas({ $queryRawUnsafe: query } as unknown as Prisma.TransactionClient, "id")).rejects.toThrow("UNSUPPORTED_PERSISTED_ORDERING");
  expect(row.messages.map(m => m.position)).toEqual([0, 0]); expect(query).toHaveBeenCalledOnce();
});
