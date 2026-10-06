import { afterEach, expect, it, vi } from "vitest";
import { createApplication } from "../src/application/composition.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";
import { PrismaTrainingRepository } from "../src/persistence/prisma-repository.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { smsPhishingFixture } from "../src/fixtures/sms-phishing.js";
import { transactionFailureContext } from "../src/persistence/transaction-diagnostics.js";
afterEach(() => vi.restoreAllMocks());
it("fresh call start avoids rereading the newly-created aggregate; resume reads once", async () => {
  const repo = new InMemoryTrainingRepository(), app = await createApplication(repo, new MockScenarioModelProvider());
  const get = vi.spyOn(repo, "get"), user = { id: "profile-user" };
  const input = { startId: "profile-start", expectedRevision: 0 as const };
  const first = await app.start("call-center", user, input);
  expect(get).toHaveBeenCalledTimes(2); // Preserve legacy-first identity compatibility.
  get.mockClear(); await app.resume(first.session.sessionId, user); expect(get).toHaveBeenCalledOnce();
  expect((await app.start("call-center", user, input)).duplicate).toBe(true);
});
it("immutable template cache is validated, detached and publication still compares DB", async () => {
  const findUnique = vi.fn().mockResolvedValue({ configuration: smsPhishingFixture });
  const repo = new PrismaTrainingRepository({ scenarioTemplateVersion: { findUnique } } as unknown as PrismaClient);
  await repo.publish(smsPhishingFixture);
  const t = await repo.getTemplate(smsPhishingFixture.id, smsPhishingFixture.version, smsPhishingFixture.variant);
  t.title = "mutated local copy";
  expect((await repo.getTemplate(t.id, t.version, t.variant)).title).toBe(smsPhishingFixture.title);
  expect(findUnique).toHaveBeenCalledOnce();
  await expect(repo.publish({ ...smsPhishingFixture, title: "mutated publication" })).rejects.toThrow("PUBLISHED_TEMPLATE_IMMUTABLE");
  expect(findUnique).toHaveBeenCalledTimes(2);
});
it("uncached invalid database JSON is rejected, never remembered", async () => {
  const findUnique = vi.fn().mockResolvedValue({ configuration: { title: "invalid" } });
  const repo = new PrismaTrainingRepository({ scenarioTemplateVersion: { findUnique } } as unknown as PrismaClient);
  await expect(repo.getTemplate("invalid", 5, "SCAM_CALL")).rejects.toThrow();
  await expect(repo.getTemplate("invalid", 5, "SCAM_CALL")).rejects.toThrow();
  expect(findUnique).toHaveBeenCalledTimes(2);
});
it("owned aggregate read keeps repeatable-read with a finite remote-network transaction budget", async () => {
  const findFirst = vi.fn().mockResolvedValue(null);
  const transaction = vi.fn(async (run: (tx: unknown) => Promise<unknown>, _options: unknown) => run({ trainingSession: { findFirst } }));
  const repo = new PrismaTrainingRepository({ $transaction: transaction } as unknown as PrismaClient);
  await expect(repo.get("private-session-id", "private-owner-id")).rejects.toThrow("SESSION_NOT_FOUND");
  expect(transaction.mock.calls[0]![1]).toEqual({ isolationLevel: "RepeatableRead", timeout: 15_000, maxWait: 5_000 });
  expect(findFirst.mock.calls[0]![0].where).toEqual({ id: "private-session-id", ownerId: "private-owner-id" });
});
it("transaction diagnostics contain only operation/category/timing; original error still propagates", async () => {
  const error = Object.assign(new Error("PRIVATE_SQL_PASSWORD_URL"), { code: "P2028", meta: { error: "PRIVATE_META" } });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const repo = new PrismaTrainingRepository({ $transaction: vi.fn().mockRejectedValue(error) } as unknown as PrismaClient);
  await expect(repo.get("private-id", "private-owner")).rejects.toBe(error);
  expect(JSON.parse(log.mock.calls[0]![0])).toEqual({ event: "training_transaction_failed", operation: "GET", category: "DATABASE_TRANSACTION", durationMs: expect.any(Number), budgetMs: 15_000 });
  expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE");
  expect(transactionFailureContext(error)).toEqual({ operation: "GET", durationMs: expect.any(Number), budgetMs: 15_000 });
  expect(transactionFailureContext({ code: "P2028", operation: "PRIVATE" })).toBeUndefined();
  expect(transactionFailureContext(null)).toBeUndefined();
  log.mockImplementation(() => { throw new Error("LOGGER_FAILED"); });
  await expect(repo.get("private-id", "private-owner")).rejects.toBe(error);
});
