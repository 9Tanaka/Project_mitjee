import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { readTrainingAggregate, hydrateAggregate } from "../src/persistence/aggregate-reader.js";
import type { Prisma } from "../src/generated/prisma/client.js";
import { hydrateAggregate as provenCodec } from "../scripts/shadow-aggregate/explicit-reader.mjs";

const base = () => ({ revision: 5, startedAt: "2026-10-23T19:34:56.789+07:00", lastActivityAt: "2026-10-23T12:34:56.789Z", endedAt: null,
  actions: [], opportunities: [], events: [], messages: [], turns: [], result: null });
const txFor = (row: unknown) => ({ $queryRawUnsafe: vi.fn().mockResolvedValue(row === null ? [] : [{ aggregate: row }]) });

describe("authoritative explicit aggregate GET boundary", () => {
  it("uses the exact proven SQL with separately bound owner/session and no native preview feature", async () => {
    const tx = txFor(null), id = "private-id' OR 1=1";
    expect(await readTrainingAggregate(tx as unknown as Prisma.TransactionClient, id, "private-owner")).toBeNull();
    expect(tx.$queryRawUnsafe).toHaveBeenCalledOnce();
    const args = tx.$queryRawUnsafe.mock.calls[0]!;
    const expected = readFileSync("scripts/shadow-aggregate/explicit-reader.mjs", "utf8").match(/const sql = `([\s\S]*?)`;/)![1];
    expect(args[0]).toBe(expected); expect(args.slice(1)).toEqual([id, "private-owner"]); expect(args[0]).not.toContain(id);
    expect(readFileSync("prisma/schema.prisma", "utf8")).not.toContain("relationJoins");
  });
  it("preserves the proven null/float/date/nested JSON codec behavior", () => {
    const wire = { ...base(), actions: [{ at: "1969-12-31T23:59:58.766Z" }],
      opportunities: [{ position: 0, openedAt: "1970-01-01T00:00:00.001Z", finalizedAt: null, eligibleMaximum: "10.5", earned: "-0", assessment: null }],
      result: { trainingScore: null, calculatedAt: "2026-10-23T12:34:56.789Z", scores: { nested: [false, 0, null, [], {}], dateText: "2026-01-01T00:00:00Z" } } };
    const row = hydrateAggregate(structuredClone(wire)); expect(row).toEqual(provenCodec(structuredClone(wire)));
    expect(row!.startedAt.getTime()).toBe(row!.lastActivityAt.getTime()); expect(row!.actions[0]!.at.getTime()).toBe(-1234);
    expect(Object.is(row!.opportunities[0]!.earned, -0)).toBe(true); expect(row!.opportunities[0]).toHaveProperty("assessment", null);
    expect(row!.result!.trainingScore).toBeNull(); expect(hydrateAggregate(null)).toBeNull();
  });
  it.each(["opportunities", "events", "messages"])("rejects malformed tied %s positions without repairing or writing", async relation => {
    const wire = { ...base(), [relation]: [{ position: 0, at: "1970-01-01T00:00:00Z", openedAt: "1970-01-01T00:00:00Z", finalizedAt: null }, { position: 0, at: "1970-01-01T00:00:00Z", openedAt: "1970-01-01T00:00:00Z", finalizedAt: null }] };
    const tx = txFor(wire); await expect(readTrainingAggregate(tx as unknown as Prisma.TransactionClient, "id", "owner")).rejects.toThrow("UNSUPPORTED_PERSISTED_ORDERING");
    expect(tx.$queryRawUnsafe).toHaveBeenCalledOnce(); expect(wire[relation as keyof typeof wire]).toBeDefined();
  });
  it("allows legitimate receipt revision gaps and rejects ties", async () => {
    const wire = { ...base(), turns: [{ committedRevision: 1 }, { committedRevision: 4 }] };
    expect((await readTrainingAggregate(txFor(wire) as unknown as Prisma.TransactionClient, "id", "owner"))!.turns).toHaveLength(2);
    await expect(readTrainingAggregate(txFor({ ...wire, turns: [{ committedRevision: 1 }, { committedRevision: 1 }] }) as unknown as Prisma.TransactionClient, "id", "owner")).rejects.toThrow("UNSUPPORTED_PERSISTED_ORDERING");
  });
});
