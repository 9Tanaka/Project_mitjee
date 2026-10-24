import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { buildFixtures } from "../scripts/shadow-aggregate/fixtures.mjs";
import { orderingViolations, domainOrderingViolations, writerFacts, coreFacts } from "../scripts/shadow-aggregate/ordering-contract.mjs";
import { PrismaTrainingRepository } from "../src/persistence/prisma-repository.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { repositoryHarness, safeActions } from "./repository-contract.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { IDLE_TIMEOUT_MS } from "../src/domain/constants.js";
import { TrainingCore } from "../src/core.js";

describe("supported writer ordering contract (no reader promotion)", () => {
  it("actual public Prisma create assigns dense positions for every supported historical fixture", async () => {
    const data = await buildFixtures();
    const templates = new Map(data.templates.map(t => [[t.id, t.version, t.variant].join("@"), t]));
    for (const f of data.cases.filter(f => !Object.hasOwn(f, "resultVariant"))) {
      const rows: Record<string, unknown[]> = {};
      const tx = new Proxy({}, { get(_target, model: string) { return {
        async create(args: { data: unknown }) { (rows[model] ??= []).push(args.data); },
        async createMany(args: { data: unknown[] }) { (rows[model] ??= []).push(...args.data); },
      }; } });
      const client = { scenarioTemplateVersion: { async findUnique(args: { where: { templateId_version_variant: { templateId: string; version: number; variant: string } } }) {
        const k = args.where.templateId_version_variant; return { configuration: templates.get([k.templateId, k.version, k.variant].join("@")) };
      } }, async $transaction(run: (tx: unknown) => unknown) { return run(tx); } };
      await new PrismaTrainingRepository(client as unknown as PrismaClient).create(f.snapshot);
      expect(orderingViolations({ revision: f.snapshot.revision, actions: rows.trainingAction ?? [],
        opportunities: rows.sessionOpportunity ?? [], events: rows.trainingEvent ?? [], messages: rows.trainingMessage ?? [], turns: rows.dialogueTurnReceipt ?? [] })).toEqual([]);
    }
  });
  it("replay, provider retry and competing CAS cannot reuse a committed receipt revision", async () => {
    const h = await repositoryHarness(new InMemoryTrainingRepository());
    const request = { sessionId: h.id, ownerId: "test-owner", turnId: "same-turn", expectedRevision: 0, text: "ขอรายละเอียด" };
    const replies = await Promise.all([h.dialogue.sendMessage(request), h.dialogue.sendMessage(request)]);
    expect(replies.filter(r => r.duplicate)).toHaveLength(1);
    const before = await h.current(); expect(domainOrderingViolations(before)).toEqual([]);
    await h.dialogue.sendMessage(request); expect(await h.current()).toEqual(before);
    const revision = before.revision;
    const competing = await Promise.allSettled(["turn-a", "turn-b"].map(turnId => h.dialogue.sendMessage({ ...request, turnId, expectedRevision: revision })));
    expect(competing.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const after = await h.current(); expect(domainOrderingViolations(after)).toEqual([]);
    expect(after.dialogueTurns.map(t => t.committedRevision)).toEqual([1, 2]);
    await h.act(safeActions[0]!); await h.say();
    expect((await h.current()).dialogueTurns.map(t => t.committedRevision)).toEqual([1, 2, 4]);
  });
  it("resume/expiry adds no receipt or child and cannot reuse a revision", async () => {
    const repo = new InMemoryTrainingRepository(), h = await repositoryHarness(repo); await h.say();
    const before = await h.current();
    const expiredCore = await TrainingCore.create([], repo, () => before.lastActivityAt + IDLE_TIMEOUT_MS);
    const [a, b] = await Promise.all([expiredCore.resume(h.id, "test-owner"), expiredCore.resume(h.id, "test-owner")]);
    expect(a).toEqual(b); expect(a.revision).toBe(before.revision + 1); expect(a.status).toBe("EXPIRED");
    for (const key of ["opportunities", "events", "messages", "dialogueTurns"] as const) expect(a[key]).toEqual(before[key]);
    expect(domainOrderingViolations(a)).toEqual([]);
  });
  it("the ordering checker rejects synthetic ties without sorting or changing the input", () => {
    const row = { revision: 2, actions: [], opportunities: [{ position: 0 }, { position: 0 }], events: [], messages: [], turns: [] };
    const before = structuredClone(row); expect(orderingViolations(row)).toContain("SessionOpportunity:TIED_KEY"); expect(row).toEqual(before);
  });
  it("receipt ordering allows gaps but requires its own Core action revision", () => {
    const row = { revision: 4, opportunities: [], events: [], messages: [], actions: [{ id: "dialogue:a", revision: 0 }, { id: "dialogue:b", revision: 3 }],
      turns: [{ id: "a", snapshotRevision: 0, committedRevision: 1 }, { id: "b", snapshotRevision: 3, committedRevision: 4 }] };
    expect(orderingViolations(row)).toEqual([]); row.turns[1]!.committedRevision = 1;
    expect(orderingViolations(row)).toContain("DialogueTurnReceipt:TIED_KEY");
  });
  it("all retained writer revisions and Core revisions preserve the assignment rule", () => {
    for (const [file, check] of [["src/persistence/prisma-repository.ts", writerFacts], ["src/core.ts", coreFacts]] as const) {
      const revisions = execFileSync("git", ["log", "--all", "--format=%H", "--", file], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
      const sources = [readFileSync(file, "utf8"), ...revisions.map(ref => execFileSync("git", ["show", `${ref}:${file}`], { encoding: "utf8" }))];
      for (const source of sources) expect(Object.values(check(source)).every(Boolean)).toBe(true);
    }
  });
});
