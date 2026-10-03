import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaTrainingRepository } from "../src/persistence/prisma-repository.js";
import { TrainingCore } from "../src/core.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { additionalScamScenarios } from "../src/fixtures/scam-scenarios.js";
import { smsPhishingDialogueFixture } from "../src/fixtures/sms-phishing-dialogue.js";

// Decoder-only fixture, deliberately not evidence of a real MySQL round trip.
// Exercise the adapter's public read boundary; never expose a production decode API.
async function readPersisted(version: number, categorical: boolean, assessment: string | null, finalized = true) {
  const template = structuredClone(categorical ? additionalScamScenarios.find(t => t.id === "investment-scam")! : smsPhishingDialogueFixture);
  template.version = version;
  const core = await TrainingCore.create([template], new InMemoryTrainingRepository(), () => 1000);
  const session = await core.start("decoder-test", "owner", template.id, version, template.variant);
  const row = {
    ...session, startedAt: new Date(session.startedAt), lastActivityAt: new Date(session.lastActivityAt), endedAt: null,
    template: { configuration: template }, actions: [], events: [], messages: [], turns: [], result: null,
    opportunities: session.opportunities.map(o => ({ ...o, assessment, openedAt: new Date(o.openedAt),
      finalizedAt: finalized ? new Date(1000) : null, finalizedByActionId: finalized ? "action" : null })),
  };
  const tx = { trainingSession: { findFirst: async () => row } };
  const client = { $transaction: async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx) } as unknown as PrismaClient;
  return (await new PrismaTrainingRepository(client).get(session.id, session.ownerId)).opportunities[0]!;
}

describe("persisted assessment decoding is independent of template version", () => {
  it.each([1, 2, 3, 4, 30])("categorical version %s preserves each finalized assessment and an unanswered null", async version => {
    for (const assessment of ["SAFE", "REVIEW", "UNASSESSED"] as const) {
      expect((await readPersisted(version, true, assessment)).assessment).toBe(assessment);
    }
    expect(await readPersisted(version, true, null, false)).toHaveProperty("assessment", null);
  });
  it.each([1, 2, 30])("legacy version %s keeps the old shape without a synthetic assessment", async version => {
    expect(await readPersisted(version, false, null)).not.toHaveProperty("assessment");
  });
  it("never discards a non-null persisted assessment", async () => {
    expect(await readPersisted(1, false, "REVIEW")).toHaveProperty("assessment", "REVIEW");
  });
});
