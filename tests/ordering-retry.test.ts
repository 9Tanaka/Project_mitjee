import { expect, it } from "vitest";
import { repositoryHarness } from "./repository-contract.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { ScenarioDialogueOrchestrator } from "../src/dialogue/orchestrator.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";
import { domainOrderingViolations } from "../scripts/shadow-aggregate/ordering-contract.mjs";

it("provider error then retry success produces one revision, receipt and ordered message pair", async () => {
  const h = await repositoryHarness(new InMemoryTrainingRepository());
  const provider = new MockScenarioModelProvider([{ kind: "error" }, { kind: "normal" }]);
  const dialogue = new ScenarioDialogueOrchestrator(h.core, provider);
  const request = { sessionId: h.id, ownerId: "test-owner", turnId: "retry-order", expectedRevision: 0, text: "ขอรายละเอียด" };
  const first = await dialogue.sendMessage(request), before = await h.current();
  expect(provider.callCount).toBe(2); expect(first.turn).toMatchObject({ attempts: 2, usedFallback: false, committedRevision: 1 });
  expect(before.revision).toBe(1); expect(before.dialogueTurns).toHaveLength(1); expect(before.messages).toHaveLength(2);
  expect(domainOrderingViolations(before)).toEqual([]);
  expect((await dialogue.sendMessage(request)).duplicate).toBe(true);
  expect(await h.current()).toEqual(before); expect(provider.callCount).toBe(2);
});

it("exhausted provider retries commit one authored fallback without duplicate ordering keys", async () => {
  const h = await repositoryHarness(new InMemoryTrainingRepository());
  const provider = new MockScenarioModelProvider([{ kind: "error" }]);
  const dialogue = new ScenarioDialogueOrchestrator(h.core, provider);
  await dialogue.sendMessage({ sessionId: h.id, ownerId: "test-owner", turnId: "fallback-order", expectedRevision: 0, text: "ขอรายละเอียด" });
  const s = await h.current();
  expect(provider.callCount).toBe(2); expect(s.dialogueTurns).toHaveLength(1);
  expect(s.dialogueTurns[0]).toMatchObject({ attempts: 2, usedFallback: true, committedRevision: 1 });
  expect(s.messages).toHaveLength(2); expect(s.revision).toBe(1); expect(domainOrderingViolations(s)).toEqual([]);
});
