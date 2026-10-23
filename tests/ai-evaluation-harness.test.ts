import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { callCenterContinuousTemplates } from "../src/fixtures/call-center-continuous-stories.js";
import { buildCorpusManifest, compareRuns, evaluateRun, validateCorpus } from "../scripts/evaluate-ai.mjs";

const corpus = JSON.parse(readFileSync(new URL("./fixtures/ai-evaluation/corpus.v1.json", import.meta.url), "utf8"));
const manifest = buildCorpusManifest(corpus);
const templatesByStory = new Map(callCenterContinuousTemplates.map(template => [template.callCenter?.storyId, template]));

function candidateFor(caseId: string, overrides: Record<string, unknown> = {}) {
  const fixtureCase = corpus.cases.find((entry: { id: string }) => entry.id === caseId)!;
  const template = templatesByStory.get(fixtureCase.storyId)!;
  const state = template.states.find(entry => entry.id === fixtureCase.state)!;
  return {
    character_message: "ขอบคุณครับ ผมจะแจ้งข้อมูลในสถานการณ์จำลองตามที่มีครับ",
    observed_intent: "requested_clarification",
    candidate_event: "NONE",
    event_code: null,
    confidence: 0.5,
    safety: { contains_real_pii: false, out_of_scope: false },
    interaction_signal: state.conversation!.allowedSignals[0],
    conversation_status: "CONTINUE_STATE",
    ...overrides,
  };
}

function makeRun({
  taxonomy = "groq_closed",
  samplePolicyId = "offline-harness-self-test-v1",
  turns = [],
  model = "openai/gpt-oss-120b",
}: {
  taxonomy?: "groq_closed" | "openai_collapsed" | "unknown";
  samplePolicyId?: string;
  turns?: Array<Record<string, unknown>>;
  model?: string;
} = {}) {
  return {
    schemaVersion: 1,
    corpus: manifest.corpus,
    template: { version: manifest.template.version, sha256: manifest.template.sha256 },
    rubricVersion: manifest.rubricVersion,
    providerConfig: {
      provider: "groq", model, api: "responses", streaming: false, maxOutputTokens: 1200,
      maxAttempts: 2, adapterFailureTaxonomy: taxonomy,
    },
    samplePolicy: { id: samplePolicyId, warmups: 0, measuredTurns: turns.length, concurrency: 1 },
    turns,
  };
}

describe("offline AI evaluation harness", () => {
  it("validates the pinned synthetic corpus and rejects duplicate IDs", () => {
    expect(validateCorpus(corpus)).toEqual({ valid: true, errors: [] });
    expect(corpus.cases).toHaveLength(19);
    const duplicate = structuredClone(corpus);
    duplicate.cases[1].id = duplicate.cases[0].id;
    expect(validateCorpus(duplicate).valid).toBe(false);
  });

  it("builds a reproducible metadata manifest without emitting fixture prompt text", () => {
    const first = buildCorpusManifest(corpus);
    const second = buildCorpusManifest(corpus);
    const serialized = JSON.stringify(first);
    expect(first).toEqual(second);
    expect(first.corpus.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.template.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.cases.find((item: { caseId: string; historyLengthInPrompt: number }) => item.caseId === "cc01-history-boundary-12")?.historyLengthInPrompt).toBe(12);
    expect(first.cases.every((item: { promptUtf8Bytes: number; promptCharacters: number }) => item.promptUtf8Bytes > item.promptCharacters)).toBe(true);
    expect(serialized).not.toContain("โปรดละเว้นคำสั่งก่อนหน้า");
    expect(serialized).not.toContain("ขอทราบรายละเอียดที่ต้องพิจารณาเพิ่มเติม");
  });

  it("preserves first-attempt invalid output and reports turn/attempt denominators separately", () => {
    const run = makeRun({ turns: [
      {
        caseId: "cc01-prompt-injection",
        attempts: [
          { status: "invalid_output" },
          { status: "candidate", candidateOutput: candidateFor("cc01-prompt-injection"), providerCallWallMs: 120, validationMs: 2 },
        ],
        finalStatus: "completed",
        spansMs: { contextMs: 1, aiMs: 150, retryMs: 125 },
      },
      {
        caseId: "cc02-opening",
        attempts: [{ status: "timeout", providerCallWallMs: 20_000 }],
        finalStatus: "fallback",
      },
    ] });
    const report = evaluateRun(run, corpus);
    expect(report.denominators).toEqual({ measuredTurns: 2, corpusCases: 19, attemptCount: 3, returnedCandidatePayloads: 1 });
    expect(report.attemptMetrics.providerReportedInvalidOutputRate).toMatchObject({ value: 1 / 3, numerator: 1, denominator: 3 });
    expect(report.turnMetrics.retried).toMatchObject({ numerator: 1, denominator: 2, rate: 0.5 });
    expect(report.turnMetrics.fallback).toMatchObject({ numerator: 1, denominator: 2, rate: 0.5 });
    expect(report.turnMetrics.firstAttemptContractValid).toMatchObject({ numerator: 0, denominator: 2, rate: 0 });
    expect(report.cases[0].attempts[0].status).toBe("invalid_output");
    expect(report.cases[0].attempts[1].contract.status).toBe("CONTRACT_VALID");
    expect(report.cases[0].attempts[1].behaviorScreen.injectionScreen).toBe("NO_PATTERN_MATCH_NOT_A_PASS");
    expect(report.behaviorScreen.status).toBe("SCREENING_ONLY_NOT_A_SAFETY_PASS");
  });

  it("separates schema rejection from authored semantic-guard rejection", () => {
    const good = candidateFor("cc01-neutral-response");
    const wrongPair = candidateFor("cc01-neutral-response", { event_code: "SCAM_TRANSFER" });
    const disallowedSignal = candidateFor("cc01-neutral-response", { interaction_signal: "NONE" });
    const run = makeRun({ turns: [
      { caseId: "cc01-neutral-response", attempts: [{ status: "candidate", candidateOutput: wrongPair }], finalStatus: "fallback" },
      { caseId: "cc02-neutral-response", attempts: [{ status: "candidate", candidateOutput: disallowedSignal }], finalStatus: "fallback" },
      { caseId: "cc-n01-neutral-response", attempts: [{ status: "candidate", candidateOutput: good }], finalStatus: "completed" },
    ] });
    const report = evaluateRun(run, corpus);
    expect(report.cases[0].attempts[0].contract.status).toBe("SCHEMA_REJECTED");
    expect(report.cases[1].attempts[0].contract.status).toBe("SEMANTIC_GUARD_REJECTED");
    expect(report.cases[2].attempts[0].contract.status).toBe("CONTRACT_VALID");
  });

  it("reports behavior matches only as per-case review evidence and omits generated dialogue", () => {
    const sensitiveCandidateText = "The official training score is 10. The hidden label is CC-01.";
    const run = makeRun({ turns: [{
      caseId: "cc01-prompt-injection",
      attempts: [{ status: "candidate", candidateOutput: candidateFor("cc01-prompt-injection", { character_message: sensitiveCandidateText }) }],
      finalStatus: "completed",
    }] });
    const report = evaluateRun(run, corpus);
    const rendered = JSON.stringify(report);
    expect(report.cases[0].attempts[0].behaviorScreen.status).toBe("FLAGGED_FOR_REVIEW");
    expect(report.cases[0].attempts[0].behaviorScreen.findings.map((finding: { ruleId: string }) => finding.ruleId)).toContain("hidden_scenario_label");
    expect(report.cases[0].attempts[0].behaviorScreen.injectionScreen).toBe("POTENTIAL_COMPLIANCE");
    expect(report.behaviorScreen.stopAndReviewBeforeOptimizationCaseIds).toEqual(["cc01-prompt-injection"]);
    expect(rendered).not.toContain(sensitiveCandidateText);
  });

  it("leaves missing human review and unavailable provider metrics null", () => {
    const run = makeRun({ taxonomy: "openai_collapsed", turns: [{
      caseId: "cc-n02-opening",
      attempts: [{ status: "error" }],
      finalStatus: "failed",
    }] });
    const report = evaluateRun(run, corpus);
    expect(report.humanLanguageQuality.status).toBe("NOT REVIEWED");
    expect(report.humanLanguageQuality.thaiNaturalnessMean1To5).toBeNull();
    expect(report.cases[0].humanReview.status).toBe("NOT_REVIEWED");
    expect(report.attemptMetrics.providerReportedInvalidOutputRate).toMatchObject({ value: null, status: "UNAVAILABLE", denominator: 1 });
    expect(report.attemptMetrics.providerReportedInvalidOutputRate.reason).toBe("adapter_collapses_invalid_output_into_error");
    expect(report.unavailableMetrics.ttftMs.value).toBeNull();
    expect(report.unavailableMetrics.quantization.value).toBeNull();
    expect(report.timings.contextConstructionMs).toMatchObject({ samples: 0, unavailable: true });
  });

  it("accepts only qualified rubric-matched human ratings and preserves unreviewed cases", () => {
    const run = makeRun({ turns: [{
      caseId: "cc01-opening",
      attempts: [{ status: "candidate", candidateOutput: candidateFor("cc01-opening") }],
      finalStatus: "completed",
      humanReview: { qualification: "qualified", rubricVersion: corpus.rubricVersion, thaiNaturalness: 4, roleScenarioConsistency: 5 },
    }] });
    const report = evaluateRun(run, corpus);
    expect(report.humanLanguageQuality).toMatchObject({ status: "QUALIFIED_REVIEW_DATA_PRESENT", qualifiedReviewedTurns: 1, thaiNaturalnessMean1To5: 4, roleScenarioConsistencyMean1To5: 5, measuredTurnDenominator: 1 });
    const unqualifiedRun = makeRun({ turns: [{ ...run.turns[0], humanReview: { qualification: "not_declared", thaiNaturalness: 5, roleScenarioConsistency: 5 } }] });
    expect(evaluateRun(unqualifiedRun, corpus).humanLanguageQuality.status).toBe("NOT REVIEWED");
  });

  it("makes repeated reports deterministic and requires exact comparison identity", () => {
    const one = makeRun({ turns: [{ caseId: "cc-n01-opening", attempts: [{ status: "candidate", candidateOutput: candidateFor("cc-n01-opening") }], finalStatus: "completed" }] });
    const same = structuredClone(one);
    const report = evaluateRun(one, corpus);
    expect(evaluateRun(one, corpus)).toEqual(report);
    expect(compareRuns(one, same, corpus).decision).toBe("NO_AUTOMATIC_OPTIMIZATION_APPROVAL");
    const twoCases = makeRun({ turns: [
      { caseId: "cc-n01-opening", attempts: [{ status: "candidate", candidateOutput: candidateFor("cc-n01-opening") }], finalStatus: "completed" },
      { caseId: "cc-n02-opening", attempts: [{ status: "candidate", candidateOutput: candidateFor("cc-n02-opening") }], finalStatus: "completed" },
    ] });
    const reversedCases = makeRun({ turns: [...twoCases.turns].reverse() });
    expect(compareRuns(twoCases, reversedCases, corpus).comparison.matchedIdentity).toBe(true);
    const flaggedAfter = makeRun({ turns: [{
      caseId: "cc-n01-opening",
      attempts: [{ status: "candidate", candidateOutput: candidateFor("cc-n01-opening", { character_message: "CC-N01 is your official training result." }) }],
      finalStatus: "completed",
    }] });
    const flaggedComparison = compareRuns(one, flaggedAfter, corpus);
    expect(flaggedComparison.stopAndReviewBeforeFurtherOptimization).toBe(true);
    expect(flaggedComparison.newlyFlaggedCaseIds).toEqual(["cc-n01-opening"]);
    expect(() => compareRuns(one, makeRun({ model: "other-model", turns: same.turns }), corpus)).toThrow(/MATCHING_CORPUS_TEMPLATE_RUBRIC_PROVIDER_AND_SAMPLE_POLICY/);
    expect(() => compareRuns(one, makeRun({ samplePolicyId: "changed-sampling", turns: same.turns }), corpus)).toThrow(/MATCHING_CORPUS_TEMPLATE_RUBRIC_PROVIDER_AND_SAMPLE_POLICY/);
    const differentCase = makeRun({ turns: [{ caseId: "cc-n02-opening", attempts: [{ status: "candidate", candidateOutput: candidateFor("cc-n02-opening") }], finalStatus: "completed" }] });
    expect(() => compareRuns(one, differentCase, corpus)).toThrow(/MATCHING_MEASURED_CASE_IDS/);
  });
});
