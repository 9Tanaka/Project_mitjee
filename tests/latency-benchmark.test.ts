import { describe, expect, it } from "vitest";
import {
  classifySample, distribution, nearestRank, summarizeSamples,
} from "../scripts/benchmark-latency-helpers.mjs";

function trace(overrides: Record<string, unknown> = {}) {
  return {
    status: "success",
    errorCategory: null,
    duplicate: false,
    fallback: false,
    totalMs: 100,
    durationsMs: { llm: 35, stt: null, tts: null },
    attempts: 1,
    retryCount: 0,
    repositoryReads: 4,
    repositoryWrites: 2,
    repositoryOperations: {
      get: { attempts: 3, succeeded: 3, failed: 0 },
      getTemplate: { attempts: 1, succeeded: 1, failed: 0 },
      create: { attempts: 0, succeeded: 0, failed: 0 },
      save: { attempts: 2, succeeded: 2, failed: 0 },
      publish: { attempts: 0, succeeded: 0, failed: 0 },
    },
    ...overrides,
  } as any;
}

describe("latency benchmark statistics", () => {
  it("uses nearest-rank percentiles and preserves null for unavailable distributions", () => {
    expect(nearestRank([90, 10, 40, 20, 30], 0.5)).toBe(30);
    expect(nearestRank([90, 10, 40, 20, 30], 0.95)).toBe(90);
    expect(distribution([])).toBeNull();
    expect(distribution([5, 1, 9])).toEqual({ samples: 3, min: 1, p50: 5, p95: 9, max: 9 });
    expect(() => nearestRank([1], 0)).toThrow(RangeError);
  });

  it("keeps fallback, replay, failures, and incomplete voice out of provider-success percentiles", () => {
    const fallback = trace({ fallback: true, totalMs: 240, retryCount: 1, attempts: 2 });
    const replay = trace({ duplicate: true, totalMs: 10 });
    const failed = trace({ status: "failure", totalMs: 80 });
    const audioUnavailable = trace({ totalMs: 120 });
    const voiceFallback = trace({ fallback: true, totalMs: 260, retryCount: 1, attempts: 2 });
    expect(classifySample(trace())).toBe("provider_success");
    expect(classifySample(fallback)).toBe("fallback");
    expect(classifySample(replay)).toBe("replay");
    expect(classifySample(failed)).toBe("operation_failure");
    expect(classifySample(audioUnavailable, { voice: true, audioStatus: "UNAVAILABLE" })).toBe("committed_audio_unavailable");
    expect(classifySample(audioUnavailable, { voice: true })).toBe("operation_failure");

    const records = [
      { trace: trace({ totalMs: 100 }), outcome: "provider_success" },
      { trace: trace({ totalMs: 200 }), outcome: "provider_success" },
      { trace: fallback, outcome: "fallback" },
      { trace: replay, outcome: "replay" },
      { trace: failed, outcome: "operation_failure" },
      { trace: audioUnavailable, outcome: "committed_audio_unavailable", audioStatus: "UNAVAILABLE" },
      { trace: voiceFallback, outcome: "fallback", audioStatus: "UNAVAILABLE" },
    ];
    const summary = summarizeSamples(records, ["llm", "stt", "tts"]);
    expect(summary.outcomeCounts).toMatchObject({ provider_success: 2, fallback: 2, replay: 1, operation_failure: 1, committed_audio_unavailable: 1 });
    expect(summary).toMatchObject({ successfulDialogueCalls: 5, llmFallbacks: 2, committedTtsUnavailable: 2,
      audioStatusCounts: { UNAVAILABLE: 2 } });
    expect(summary.providerSuccess.totalMs).toEqual({ samples: 2, min: 100, p50: 100, p95: 200, max: 200 });
    expect(summary.cohorts.fallback!.totalMs).toEqual({ samples: 2, min: 240, p50: 240, p95: 260, max: 260 });
    expect(summary.providerSuccess.durationsMs.stt).toBeNull();
    expect(summary.providerSuccess.durationsMs.llm).toEqual({ samples: 2, min: 35, p50: 35, p95: 35, max: 35 });
  });

  it("retains logical repository counts and retries separately from latency eligibility", () => {
    const summary = summarizeSamples([
      { trace: trace({ attempts: 2, retryCount: 1, repositoryReads: 5, repositoryWrites: 3,
        repositoryOperations: { get: { attempts: 4, succeeded: 3, failed: 1 } } }), outcome: "fallback" },
      { trace: trace({ attempts: 1, retryCount: 0, repositoryReads: 4, repositoryWrites: 2 }), outcome: "provider_success" },
    ]);
    expect(summary).toMatchObject({ attempts: 3, retryCount: 1, repositoryReads: 9, repositoryWrites: 5 });
    expect(summary.repositoryOperations.get).toEqual({ attempts: 7, succeeded: 6, failed: 1 });
  });

  it("keeps setup failures without trace data visible and preserves unavailable stage values", () => {
    const summary = summarizeSamples([
      { trace: null, outcome: "operation_failure", audioStatus: null },
    ]);
    expect(summary.samples).toBe(1);
    expect(summary.outcomeCounts.operation_failure).toBe(1);
    expect(summary.providerSuccess.totalMs).toBeNull();
    expect(summary.attempts).toBe(0);
    expect(summary.repositoryReads).toBe(0);
    expect(summary.audioStatusCounts.unknown).toBe(1);
  });
});
