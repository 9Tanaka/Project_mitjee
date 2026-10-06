import { expect, it, vi } from "vitest";
import { createApplication } from "../src/application/composition.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";
import { PrismaTrainingRepository } from "../src/persistence/prisma-repository.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { smsPhishingFixture } from "../src/fixtures/sms-phishing.js";
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
