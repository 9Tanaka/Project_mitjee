export const LATENCY_STAGES = Object.freeze([
  "auth", "db_preflight", "context", "llm", "validation", "retry", "ai",
  "commit", "durable_save", "stt", "tts",
]);

const OUTCOMES = Object.freeze([
  "provider_success", "fallback", "committed_audio_unavailable",
  "operation_failure", "cancelled", "replay",
]);

export function nearestRank(values, percentile) {
  if (!Array.isArray(values) || values.length === 0) return null;
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 1) {
    throw new RangeError("Percentile must be in (0, 1].");
  }
  const sorted = values.map(Number).sort((a, b) => a - b);
  if (sorted.some(value => !Number.isFinite(value) || value < 0)) {
    throw new TypeError("Latency samples must be finite non-negative numbers.");
  }
  return sorted[Math.ceil(percentile * sorted.length) - 1];
}

export function distribution(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = values.map(Number).sort((a, b) => a - b);
  if (sorted.some(value => !Number.isFinite(value) || value < 0)) {
    throw new TypeError("Latency samples must be finite non-negative numbers.");
  }
  return {
    samples: sorted.length,
    min: sorted[0],
    p50: nearestRank(sorted, 0.5),
    p95: nearestRank(sorted, 0.95),
    max: sorted.at(-1),
  };
}

/**
 * @param {any} trace
 * @param {{ voice?: boolean, audioStatus?: "READY" | "UNAVAILABLE" | "REPLAY" | null }} options
 */
export function classifySample(trace, { voice = false, audioStatus = null } = {}) {
  if (trace?.duplicate) return "replay";
  if (trace?.status === "cancelled" || trace?.errorCategory === "cancelled") return "cancelled";
  if (trace?.status !== "success") return "operation_failure";
  if (trace?.fallback) return "fallback";
  if (voice && audioStatus === "UNAVAILABLE") return "committed_audio_unavailable";
  if (voice && audioStatus !== "READY") return "operation_failure";
  return "provider_success";
}

function sum(records, getValue) {
  return records.reduce((total, record) => total + (Number.isFinite(getValue(record)) ? getValue(record) : 0), 0);
}

function timingMetrics(records, stages) {
  const totalMs = distribution(records.map(record => record.trace?.totalMs).filter(Number.isFinite));
  const durationsMs = Object.fromEntries(stages.map(stage => [stage,
    distribution(records.map(record => record.trace?.durationsMs?.[stage]).filter(Number.isFinite))]));
  return { totalMs, durationsMs };
}

/** Keep fallback, replay, incomplete voice, and failures out of provider-success percentiles. */
export function summarizeSamples(records, stages = LATENCY_STAGES) {
  const outcomeCounts = Object.fromEntries(OUTCOMES.map(outcome => [outcome, 0]));
  const audioStatusCounts = { READY: 0, UNAVAILABLE: 0, REPLAY: 0, unknown: 0 };
  for (const record of records) {
    if (Object.hasOwn(outcomeCounts, record.outcome)) outcomeCounts[record.outcome] += 1;
    const audioStatus = record.audioStatus;
    if (Object.hasOwn(audioStatusCounts, audioStatus)) audioStatusCounts[audioStatus] += 1;
    else audioStatusCounts.unknown += 1;
  }
  const successful = records.filter(record => record.outcome === "provider_success");
  const groups = Object.fromEntries(OUTCOMES.map(outcome => {
    const cohort = records.filter(record => record.outcome === outcome);
    return [outcome, { samples: cohort.length, ...timingMetrics(cohort, stages) }];
  }));
  return {
    samples: records.length,
    outcomeCounts,
    successfulDialogueCalls: records.filter(record => record.trace?.status === "success" && !record.trace?.duplicate).length,
    llmFallbacks: records.filter(record => record.trace?.fallback === true).length,
    committedTtsUnavailable: records.filter(record => record.trace?.status === "success" && record.audioStatus === "UNAVAILABLE").length,
    audioStatusCounts,
    providerSuccess: { samples: successful.length, ...timingMetrics(successful, stages) },
    cohorts: groups,
    attempts: sum(records, record => record.trace?.attempts),
    retryCount: sum(records, record => record.trace?.retryCount),
    repositoryReads: sum(records, record => record.trace?.repositoryReads),
    repositoryWrites: sum(records, record => record.trace?.repositoryWrites),
    repositoryOperations: Object.fromEntries(["get", "getTemplate", "create", "save", "publish"].map(operation => {
      const totals = { attempts: 0, succeeded: 0, failed: 0 };
      for (const record of records) {
        const count = record.trace?.repositoryOperations?.[operation];
        for (const key of Object.keys(totals)) totals[key] += Number.isFinite(count?.[key]) ? count[key] : 0;
      }
      return [operation, totals];
    })),
  };
}
