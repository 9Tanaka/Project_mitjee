import { expect, it } from "vitest";
import { TrainingCore } from "../src/core.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { ScenarioDialogueOrchestrator } from "../src/dialogue/orchestrator.js";
import type { ScenarioModelProvider } from "../src/dialogue/contracts.js";
import { additionalScamScenarios } from "../src/fixtures/scam-scenarios.js";
import { smsPhishingFeedbackFixture } from "../src/fixtures/sms-phishing-feedback.js";

it.each([...additionalScamScenarios, smsPhishingFeedbackFixture])(
  "$id: multiple free-text turns and high-confidence AI candidates have no assessment authority", async template => {
    const core = await TrainingCore.create([template], new InMemoryTrainingRepository(), () => 1000);
    await core.start("session", "learner", template.id, template.version, template.variant);
    const before = await core.resume("session", "learner");
    const provider: ScenarioModelProvider = { generateCharacterResponse: async () => ({
      character_message: "นี่เป็นข้อความในสถานการณ์สมมติ กรุณาพิจารณาตัวเลือกที่แสดง",
      observed_intent: "share_sensitive_data", candidate_event: "POSSIBLE_CRITICAL_FAILURE",
      event_code: template.criticalFailureRules[0]!.eventCode, confidence: 1,
      safety: { contains_real_pii: false, out_of_scope: false },
    }) };
    const dialogue = new ScenarioDialogueOrchestrator(core, provider);
    for (let i = 0; i < 2; i++) {
      const reply = await dialogue.sendMessage({ sessionId: "session", ownerId: "learner", expectedRevision: i,
        turnId: `turn-${i}`, text: "เขาขอให้ทำตาม แต่ฉันยังไม่ได้ยืนยันการกระทำ" });
      expect(reply.turn.usedFallback).toBe(false);
      expect(reply.turn.candidateStatus).toBe("REJECTED");
    }
    const after = await core.resume("session", "learner");
    expect(after.state).toBe(before.state);
    expect(after.status).toBe("ACTIVE");
    expect(after.opportunities).toEqual(before.opportunities);
    expect(after.events).toEqual([]);
    expect(after.result).toBeNull();
    expect(after.revision).toBe(2);
    expect(after.messages).toHaveLength(4);
  },
);
