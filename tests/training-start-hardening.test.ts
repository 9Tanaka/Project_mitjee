import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaTrainingRepository } from "../src/persistence/prisma-repository.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { TrainingCore } from "../src/core.js";
import { smsPhishingFixture } from "../src/fixtures/sms-phishing.js";
import { trainingFailureCategory } from "../src/server/training-diagnostics.js";
import { DomainError } from "../src/domain/types.js";
import { z } from "zod";

describe("immutable publication cold-start fast path", () => {
  it("already-published identical versions do not open transactions or perform writes", async () => {
    const findUnique = vi.fn().mockResolvedValue({ configuration: smsPhishingFixture });
    const transaction = vi.fn(), upsert = vi.fn();
    const client = { scenarioTemplateVersion: { findUnique }, scenario: { upsert }, $transaction: transaction } as unknown as PrismaClient;
    await new PrismaTrainingRepository(client).publish(smsPhishingFixture);
    expect(findUnique).toHaveBeenCalledTimes(1); expect(transaction).not.toHaveBeenCalled(); expect(upsert).not.toHaveBeenCalled();
    await expect(new PrismaTrainingRepository(client).publish({ ...smsPhishingFixture, title: "mutated" })).rejects.toThrow("PUBLISHED_TEMPLATE_IMMUTABLE");
    expect(transaction).not.toHaveBeenCalled();
  });
  it("an absent version is rechecked inside the transaction before a racing insert", async () => {
    const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValue({ configuration: smsPhishingFixture });
    const create = vi.fn(), upsert = vi.fn();
    const tx = { scenarioTemplateVersion: { findUnique, create }, scenario: { upsert } };
    const transaction = vi.fn(async (work: (tx: unknown) => Promise<void>) => work(tx));
    const client = { ...tx, $transaction: transaction } as unknown as PrismaClient;
    await new PrismaTrainingRepository(client).publish(smsPhishingFixture);
    expect(transaction).toHaveBeenCalledTimes(1); expect(create).not.toHaveBeenCalled(); expect(upsert).not.toHaveBeenCalled();
  });
  it("template registration is concurrent but bounded, never an unbounded pool fan-out", async () => {
    const repo = new InMemoryTrainingRepository(); let active = 0, maximum = 0;
    const original = repo.publish.bind(repo);
    const spy = vi.spyOn(repo, "publish").mockImplementation(async t => {
      active++; maximum = Math.max(active, maximum);
      await new Promise(resolve => setTimeout(resolve, 1));
      try { await original(t); } finally { active--; }
    });
    await TrainingCore.create(Array.from({ length: 12 }, (_, i) => ({ ...smsPhishingFixture, id: `bounded-${i}` })), repo);
    expect(maximum).toBe(4); expect(spy).toHaveBeenCalledTimes(12);
  });
});

describe("sanitized failure taxonomy", () => {
  it.each([["P2028", "DATABASE_TRANSACTION"], ["P2002", "DATABASE_UNIQUE"], ["P2003", "DATABASE_FOREIGN_KEY"],
    ["P2024", "DATABASE_CONNECTION"], ["ECONNRESET", "DATABASE_CONNECTION"], ["private-password", "UNKNOWN_INTERNAL"]])("%s returns only a fixed category", (code, category) => {
    expect(trainingFailureCategory({ code, message: "mysql://secret:private@host/db", meta: { sql: "raw SQL" } })).toBe(category);
  });
  it("classifies domain and schema failures without exposing their details", () => {
    expect(trainingFailureCategory(new DomainError("PUBLISHED_TEMPLATE_IMMUTABLE", "private"))).toBe("TEMPLATE_IMMUTABILITY");
    expect(trainingFailureCategory(z.string().safeParse(42).error)).toBe("SCHEMA_VALIDATION");
    expect(trainingFailureCategory(new Error("private"))).toBe("UNKNOWN_INTERNAL");
  });
});
