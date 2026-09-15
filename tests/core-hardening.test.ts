import { describe, expect, it } from "vitest";
import { TrainingCore } from "../src/core.js";
import { copy, InMemorySessionRepository } from "../src/domain/repository.js";
import type { ActionInput } from "../src/domain/training-action.js";
import { smsPhishingFixture } from "../src/fixtures/sms-phishing.js";
import { smsPhishingDialogueFixture } from "../src/fixtures/sms-phishing-dialogue.js";

describe("published template version immutability", () => {
  it("locks configuration at publication, even before the first session", async () => {
    const core = (await TrainingCore.create([], new InMemorySessionRepository()));
    (await core.publishTemplate(smsPhishingFixture));
    const changed = copy(smsPhishingFixture); changed.title = "Changed configuration";
    await expect((async () => (await core.publishTemplate(changed)))()).rejects.toThrow("PUBLISHED_TEMPLATE_IMMUTABLE");
    await core.publishTemplate(smsPhishingFixture);
  });

  it("a new Core instance cannot replace a version referenced by an existing session", async () => {
    const repository = new InMemorySessionRepository();
    const first = (await TrainingCore.create([smsPhishingFixture], repository));
    (await first.start("s", "u", smsPhishingFixture.id, 1));
    const changed = copy(smsPhishingFixture); changed.states[0]!.fallbackMessage = "Changed fallback";
    await expect((async () => (await TrainingCore.create([changed], repository)))()).rejects.toThrow("PUBLISHED_TEMPLATE_IMMUTABLE");
    const restored = (await TrainingCore.create([], repository));
    expect((await restored.getSessionTemplate("s", "u"))).toEqual(smsPhishingFixture);
  });

  it("permits a new version without changing existing session configuration", async () => {
    const core = (await TrainingCore.create([smsPhishingFixture], new InMemorySessionRepository()));
    (await core.start("old", "u", smsPhishingFixture.id, 1));
    (await core.publishTemplate(smsPhishingDialogueFixture));
    (await core.start("new", "u", smsPhishingFixture.id, 2));
    expect((await core.getSessionTemplate("old", "u")).characterRole).toBeUndefined();
    expect((await core.getSessionTemplate("new", "u")).characterRole).toBe(smsPhishingDialogueFixture.characterRole);
    const detached = (await core.getSessionTemplate("new", "u")); detached.states.length = 0;
    expect((await core.getSessionTemplate("new", "u")).states.length).toBe(6);
  });

  it("cannot change the version reference of an existing session via repository save", async () => {
    const repository = new InMemorySessionRepository();
    const core = (await TrainingCore.create([smsPhishingFixture, smsPhishingDialogueFixture], repository));
    const session = (await core.start("s", "u", smsPhishingFixture.id, 1));
    session.templateVersion = 2; session.revision++;
    await expect((async () => (await repository.save(session, 0)))()).rejects.toThrow("SESSION_IDENTITY_IMMUTABLE");
    expect((await core.resume("s", "u")).templateVersion).toBe(1);
  });
});

describe("two competing commands share one revision", () => {
  it.each(["DECISION", "WARNING_FINALIZE", "PROGRESS"] as const)("only the first %s commits; the stale update changes nothing", async kind => {
    const core = (await TrainingCore.create([smsPhishingFixture], new InMemorySessionRepository())); (await core.start("s", "u", smsPhishingFixture.id, 1));
    let sequence = 0;
    const submit = async (action: ActionInput) => (await core.submit({ sessionId: "s", ownerId: "u", actionId: `setup-${++sequence}`, expectedRevision: (await core.resume("s", "u")).revision, action }));
    let action: ActionInput = { kind: "DECISION", opportunityId: "d1", choiceId: "verify" };
    if (kind !== "DECISION") (await submit(action));
    if (kind === "PROGRESS") action = { kind: "PROGRESS", transitionId: "review-sms" };
    if (kind === "WARNING_FINALIZE") {
      (await submit({ kind: "PROGRESS", transitionId: "review-sms" }));
      action = { kind: "WARNING_FINALIZE", opportunityId: "w1", selectedEvidenceIds: ["wrong-domain", "urgency"] };
    }
    const revision = (await core.resume("s", "u")).revision;
    const first = { sessionId: "s", ownerId: "u", actionId: "request-a", expectedRevision: revision, action };
    const second = { ...first, actionId: "request-b" };
    const successful = (await core.submit(first)).session;
    expect(successful.revision).toBe(revision + 1);
    await expect((async () => (await core.submit(second)))()).rejects.toThrow("REVISION_CONFLICT");
    const current = (await core.resume("s", "u"));
    expect(current).toEqual(successful); // Events, opportunities, scores and state all identical.
    expect(current.actions.filter(a => a.id === "request-a")).toHaveLength(1);
    expect(current.actions.some(a => a.id === "request-b")).toBe(false);
    expect(new Set(current.events.map(e => e.id)).size).toBe(current.events.length);
    expect(new Set(current.opportunities.map(o => o.definitionId)).size).toBe(current.opportunities.length);
  });

  it("selecting all evidence preserves full W and incorrect IDs without a false-positive penalty", async () => {
    const core = (await TrainingCore.create([smsPhishingFixture], new InMemorySessionRepository())); (await core.start("s", "u", smsPhishingFixture.id, 1));
    const actions: ActionInput[] = [
      { kind: "DECISION", opportunityId: "d1", choiceId: "verify" },
      { kind: "PROGRESS", transitionId: "review-sms" },
      { kind: "WARNING_FINALIZE", opportunityId: "w1", selectedEvidenceIds: ["wrong-domain", "urgency", "logo"] },
      { kind: "PROGRESS", transitionId: "inspect-link" },
      { kind: "DECISION", opportunityId: "d2", choiceId: "refuse" },
      { kind: "PROGRESS", transitionId: "verify-and-close" },
      { kind: "DECISION", opportunityId: "d3", choiceId: "official-channel" },
      { kind: "SAFE_ACTION", opportunityId: "s1", actionId: "verify-end-report" },
      { kind: "PROGRESS", transitionId: "resolve" },
    ];
    for (const [index, action] of actions.entries()) (await core.submit({ sessionId: "s", ownerId: "u", actionId: `a-${index}`, expectedRevision: index, action }));
    const session = (await core.resume("s", "u"));
    expect(session.result?.scores.W.normalized).toBe(100);
    expect(session.opportunities.find(o => o.definitionId === "w1")?.incorrectEvidenceIds).toEqual(["logo"]);
  });
});
