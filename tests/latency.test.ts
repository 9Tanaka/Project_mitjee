import { afterEach, expect, it, vi } from "vitest";
import { voiceHarness } from "./voice.helpers.js";
import { beginLatencySpan, captureLatencyFinalizer, identifyLatency, latencyEvent, latencyOutcome, measureLatency, measureLatencySync, observeAggregateDbRead, observeHttpLatency, runLatencyTrace, type LatencySummary } from "../src/observability/latency.js";
import { measuredRepository } from "../src/observability/measured-repository.js";
import type { TrainingRepository } from "../src/domain/training-repository.js";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); });
const collect = (records: LatencySummary[]) => (summary: LatencySummary) => { records.push(summary); };

it("counts aggregate database fetches separately from cached template/port calls and preserves errors", async () => {
  const records: LatencySummary[] = [], expected = { revision: 1 }, failure = new Error("PRIVATE_DB_ERROR");
  await runLatencyTrace({ transport: "service", operation: "message", sink: collect(records) }, async () => {
    expect(await observeAggregateDbRead(async () => expected)).toBe(expected);
    await expect(observeAggregateDbRead(async () => { throw failure; })).rejects.toBe(failure);
  });
  expect(records[0]!.aggregateDbReads).toEqual({ attempts: 2, succeeded: 1, failed: 1 });
  expect(records[0]!.repositoryReads).toBe(0);
  expect(records[0]!.sqlReads).toBeNull();
  expect(JSON.stringify(records)).not.toContain("PRIVATE_DB_ERROR");
});

it("disabled observation preserves return identity and never invokes the sink", async () => {
  const records: LatencySummary[] = [], result = { text: "private text" };
  expect(await runLatencyTrace({ transport: "service", operation: "message", enabled: false, sink: collect(records) }, async () => {
    identifyLatency("private-session", "private-turn");
    return measureLatency("llm", async () => result, 1);
  })).toBe(result);
  expect(records).toEqual([]);
});

it("isolates concurrent scopes, pseudonymizes identities, bounds records, and leaves unavailable stages null", async () => {
  const records: LatencySummary[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = runLatencyTrace({ transport: "service", operation: "message", sink: collect(records) }, async () => {
    identifyLatency("owner@example.com", "turn-secret");
    await measureLatency("llm", async () => gate, 1);
    for (let index = 0; index < 120; index++) latencyEvent("context_ready");
  });
  await runLatencyTrace({ transport: "service", operation: "voice", sink: collect(records) }, async () => {
    identifyLatency("other@example.com", "turn-secret");
    await measureLatency("stt", async () => {});
  });
  release(); await first;
  expect(records).toHaveLength(2);
  const voice = records.find(record => record.operation === "voice")!, text = records.find(record => record.operation === "message")!;
  expect(voice.sessionId).not.toBe(text.sessionId); expect(voice.turnId).not.toBe(text.turnId);
  expect(voice.requestId).not.toBe(text.requestId);
  expect(voice.durationsMs.llm).toBeNull(); expect(text.durationsMs.stt).toBeNull();
  expect(text.durationsMs.auth).toBeNull(); expect(text.ttftMs).toBeNull(); expect(text.ttftUnavailableReason).toBe("non_streaming");
  expect(text.sqlReads).toBeNull(); expect(text.prismaReadOperations).toBeNull();
  expect(text.events).toHaveLength(96); expect(text.truncated).toBe(true);
  expect(JSON.stringify(records)).not.toMatch(/owner@|other@|turn-secret/);
  for (const record of records) {
    expect(record.totalMs).toBeGreaterThanOrEqual(0);
    expect(record.events.every((event, index, events) => event.atMs >= (events[index - 1]?.atMs ?? 0))).toBe(true);
  }
});

it.each(["throw", "reject"] as const)("a %s sink cannot alter a committed voice turn or its text fallback", async mode => {
  const h = await voiceHarness();
  h.tts.synthesize.mockRejectedValue(new Error("private TTS credentials"));
  const sink = mode === "throw" ? () => { throw new Error("sink failed"); } : async () => { throw new Error("sink failed"); };
  const reply = await runLatencyTrace({ transport: "service", operation: "voice", sink }, () => h.voice.send(h.session.sessionId, h.owner, h.input));
  expect(reply.audioStatus).toBe("UNAVAILABLE"); expect(reply.dialogue.session.revision).toBe(h.session.revision + 1);
  expect(h.stt.transcribe).toHaveBeenCalledOnce(); expect(h.tts.synthesize).toHaveBeenCalledOnce();
  expect(h.provider.callCount).toBe(1);
  expect((await h.app.resume(h.session.sessionId, h.owner)).revision).toBe(h.session.revision + 1);
});

it("counts the same logical calls as the port and observes one durable save; replay performs no providers or save", async () => {
  const h = await voiceHarness(), records: LatencySummary[] = [];
  const get = vi.spyOn(h.repository, "get"), getTemplate = vi.spyOn(h.repository, "getTemplate"), save = vi.spyOn(h.repository, "save");
  const reply = await runLatencyTrace({ transport: "service", operation: "voice", sink: collect(records) }, () => h.voice.send(h.session.sessionId, h.owner, h.input));
  const fresh = records[0]!;
  expect(fresh.repositoryReads).toBe(get.mock.calls.length + getTemplate.mock.calls.length);
  expect(fresh.repositoryWrites).toBe(save.mock.calls.length); expect(save).toHaveBeenCalledOnce();
  expect(fresh.events.filter(event => event.event === "db_commit_complete")).toHaveLength(1);
  expect(fresh.durationsMs.commit).toBeGreaterThanOrEqual(fresh.durationsMs.durable_save!);
  expect(fresh.durationsMs.stt).not.toBeNull(); expect(fresh.durationsMs.tts).not.toBeNull();
  const replay = await runLatencyTrace({ transport: "service", operation: "voice", sink: collect(records) }, () => h.voice.send(h.session.sessionId, h.owner, h.input));
  expect(replay.dialogue).toEqual({ ...reply.dialogue, duplicate: true }); expect(replay.audioStatus).toBe("REPLAY");
  const duplicate = records[1]!;
  expect(duplicate.duplicate).toBe(true); expect(duplicate.attempts).toBe(0); expect(duplicate.repositoryWrites).toBe(0);
  expect(duplicate.events.some(event => event.event === "db_commit_complete")).toBe(false);
  expect(duplicate.durationsMs.stt).toBeNull(); expect(duplicate.durationsMs.tts).toBeNull();
  expect(h.stt.transcribe).toHaveBeenCalledOnce(); expect(h.tts.synthesize).toHaveBeenCalledOnce(); expect(h.provider.callCount).toBe(1);
  expect(measuredRepository(measuredRepository(h.repository))).toBe(measuredRepository(h.repository));
});

it("records recovered provider retries and separate validation without recording inputs or errors", async () => {
  const h = await voiceHarness(), records: LatencySummary[] = [];
  const provider = vi.spyOn(h.provider, "generateCharacterResponse").mockRejectedValueOnce(new Error("PASSWORD SQL private@provider.com"));
  const reply = await runLatencyTrace({ transport: "service", operation: "message", sink: collect(records) }, () =>
    h.app.message(h.session.sessionId, h.owner, { turnId: h.input.turnId, expectedRevision: h.input.expectedRevision, text: "private@example.com OTP 123456" }));
  const summary = records[0]!;
  expect(provider).toHaveBeenCalledTimes(2); expect(reply.session.revision).toBe(h.session.revision + 1);
  expect(summary.attempts).toBe(2); expect(summary.retryCount).toBe(1); expect(summary.fallback).toBe(false);
  expect(summary.spans.filter(span => span.stage === "llm").map(span => span.status)).toEqual(["failure", "success"]);
  expect(summary.durationsMs.validation).not.toBeNull(); expect(summary.durationsMs.retry).not.toBeNull();
  expect(JSON.stringify(summary)).not.toMatch(/PASSWORD|SQL|private@|123456/);
});

it("failed provider attempts fall back once while failed commits preserve the original error", async () => {
  const h = await voiceHarness(), records: LatencySummary[] = [];
  vi.spyOn(h.provider, "generateCharacterResponse").mockRejectedValue(new Error("private provider payload"));
  const failure = new Error("private DB SQL parameters");
  vi.spyOn(h.repository, "save").mockRejectedValue(failure);
  await expect(runLatencyTrace({ transport: "service", operation: "message", sink: collect(records) }, () =>
    h.app.message(h.session.sessionId, h.owner, { turnId: h.input.turnId, expectedRevision: h.input.expectedRevision, text: "ขอตรวจสอบก่อน" }))).rejects.toBe(failure);
  const summary = records[0]!;
  expect(summary.status).toBe("failure"); expect(summary.fallback).toBe(true); expect(summary.retryCount).toBe(1);
  expect(summary.repositoryOperations.save).toEqual({ attempts: 1, succeeded: 0, failed: 1 });
  expect(summary.events.some(event => event.event === "db_commit_complete")).toBe(false);
  expect(JSON.stringify(summary)).not.toContain("private");
  expect((await h.app.resume(h.session.sessionId, h.owner)).revision).toBe(h.session.revision);
});

it("keeps failed STT and cancellation before the commit and failed TTS after the commit visible", async () => {
  const h = await voiceHarness(), records: LatencySummary[] = [];
  h.stt.transcribe.mockRejectedValue(new Error("private speech payload"));
  await expect(runLatencyTrace({ transport: "service", operation: "voice", sink: collect(records) }, () => h.voice.send(h.session.sessionId, h.owner, h.input))).rejects.toMatchObject({ code: "STT_FAILED" });
  expect(records[0]!.spans.find(span => span.stage === "stt")?.status).toBe("failure");
  expect(records[0]!.repositoryWrites).toBe(0); expect(h.provider.callCount).toBe(0);
  const controller = new AbortController(); controller.abort();
  await expect(runLatencyTrace({ transport: "service", operation: "voice", sink: collect(records) }, () => h.voice.send(h.session.sessionId, h.owner, h.input, controller.signal))).rejects.toMatchObject({ code: "STT_FAILED" });
  expect(records[1]!.status).toBe("cancelled");
  expect(records[1]!.spans.find(span => span.stage === "stt")?.status).toBe("cancelled");
  h.stt.transcribe.mockResolvedValue("ขอตรวจสอบก่อน"); h.tts.synthesize.mockRejectedValue(new Error("private synthesis payload"));
  const reply = await runLatencyTrace({ transport: "service", operation: "voice", sink: collect(records) }, () => h.voice.send(h.session.sessionId, h.owner, h.input));
  expect(reply.audioStatus).toBe("UNAVAILABLE"); expect(records[2]!.status).toBe("success");
  expect(records[2]!.spans.find(span => span.stage === "tts")?.status).toBe("failure");
  expect(records[2]!.repositoryOperations.save.succeeded).toBe(1);
});

it("timeout settlement finalizes once and late callbacks cannot mutate any finished trace", async () => {
  const h = await voiceHarness(), records: LatencySummary[] = [];
  vi.useFakeTimers();
  const release: (() => void)[] = [];
  vi.spyOn(h.provider, "generateCharacterResponse").mockImplementation(() => new Promise(resolve => {
    const end = beginLatencySpan("validation");
    release.push(() => { identifyLatency("late-private-id", "late-private-turn"); latencyEvent("context_ready"); end(); resolve({} as Awaited<ReturnType<typeof h.provider.generateCharacterResponse>>); });
  }));
  const work = runLatencyTrace({ transport: "service", operation: "message", sink: collect(records) }, () => h.app.message(h.session.sessionId, h.owner, { turnId: h.input.turnId, expectedRevision: h.input.expectedRevision, text: "ขอตรวจสอบก่อน" }));
  await vi.advanceTimersByTimeAsync(40_001); await work;
  expect(records).toHaveLength(1); expect(records[0]!.attempts).toBe(2); expect(records[0]!.fallback).toBe(true);
  expect(records[0]!.spans.filter(span => span.stage === "validation").map(span => span.status)).toEqual(["cancelled", "cancelled"]);
  const frozen = JSON.stringify(records);
  for (const complete of release) complete();
  await Promise.resolve();
  expect(JSON.stringify(records)).toBe(frozen); expect(records).toHaveLength(1);
  expect((await h.app.resume(h.session.sessionId, h.owner)).revision).toBe(h.session.revision + 1);
});

it("HTTP final handoff and auth failure emit one summary and no successful auth milestone", async () => {
  vi.stubEnv("LATENCY_OBSERVABILITY", "1");
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const response = await observeHttpLatency("message", async () => {
    try { await measureLatency("auth", async () => { throw new Error("cookie=private-secret"); }); }
    catch { return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 }); }
    throw new Error("unreachable");
  });
  expect(response.status).toBe(401); expect(log).toHaveBeenCalledOnce();
  const summary = JSON.parse(log.mock.calls[0]![0]) as LatencySummary;
  expect(summary.status).toBe("failure"); expect(summary.events.filter(event => event.event === "response_sent")).toHaveLength(1);
  expect(summary.events.find(event => event.event === "auth_complete")?.status).toBe("failure");
  expect(JSON.stringify(summary)).not.toContain("private-secret");
});

it("repository observation keeps method binding and failure identity without changing the port", async () => {
  const failure = new Error("private persistence failure"), records: LatencySummary[] = [];
  const repository = {
    marker: 7,
    async get() { expect(this.marker).toBe(7); throw failure; },
  };
  const wrapped = measuredRepository(repository as unknown as TrainingRepository);
  await expect(runLatencyTrace({ transport: "service", operation: "resume", sink: collect(records) }, () => wrapped.get("private-id", "private-owner"))).rejects.toBe(failure);
  expect(records[0]!.repositoryOperations.get).toEqual({ attempts: 1, succeeded: 0, failed: 1 });
  expect(records[0]!.durationsMs.commit).toBeNull();
});

it("span completion remains attached to its originating scope when invoked inside another request", async () => {
  const records: LatencySummary[] = [];
  let end!: () => void, release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const first = runLatencyTrace({ transport: "service", operation: "message", sink: collect(records) }, async () => {
    end = beginLatencySpan("context");
    await pending;
  });
  await runLatencyTrace({ transport: "service", operation: "voice", sink: collect(records) }, async () => { end(); });
  release(); await first;
  expect(records.find(record => record.operation === "message")!.events.filter(event => event.event === "context_ready")).toHaveLength(1);
  expect(records.find(record => record.operation === "voice")!.events.filter(event => event.event === "context_ready")).toHaveLength(0);
});

it("synchronous context exceptions close their failed span and preserve the original error", async () => {
  const records: LatencySummary[] = [], failure = new Error("private context");
  await expect(runLatencyTrace({ transport: "service", operation: "message", sink: collect(records) }, async () =>
    measureLatencySync("context", () => { throw failure; }))).rejects.toBe(failure);
  expect(records[0]!.spans).toMatchObject([{ stage: "context", status: "failure" }]);
  expect(records[0]!.events.find(event => event.event === "context_ready")?.status).toBe("failure");
  expect(JSON.stringify(records)).not.toContain("private context");
});

it("an existing transport deadline finalizes pending work once without aborting it or contaminating another trace", async () => {
  const records: LatencySummary[] = [];
  let finalize!: (status: "cancelled") => void, release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const work = runLatencyTrace({ transport: "websocket_handshake", operation: "handshake", sink: collect(records) }, async () => {
    finalize = captureLatencyFinalizer();
    await measureLatency("auth", () => pending);
    latencyEvent("response_sent");
    return "original result";
  });
  await runLatencyTrace({ transport: "service", operation: "message", sink: collect(records) }, async () => { finalize("cancelled"); finalize("cancelled"); });
  expect(records).toHaveLength(2);
  const cancelled = records.find(record => record.transport === "websocket_handshake")!;
  expect(cancelled.status).toBe("cancelled");
  expect(cancelled.spans).toMatchObject([{ stage: "auth", status: "cancelled" }]);
  const frozen = JSON.stringify(records);
  release(); expect(await work).toBe("original result");
  expect(JSON.stringify(records)).toBe(frozen);
});

it("bounds unfinished spans and closes them without inventing successful completion", async () => {
  const records: LatencySummary[] = [];
  await runLatencyTrace({ transport: "service", operation: "message", sink: collect(records) }, async () => {
    for (let index = 0; index < 200; index++) beginLatencySpan("context");
  });
  expect(records[0]!.spans).toHaveLength(96);
  expect(records[0]!.truncated).toBe(true);
  expect(records[0]!.spans.every(span => span.status === "cancelled")).toBe(true);
  expect(records[0]!.events.filter(event => event.event === "context_ready").every(event => event.status === "cancelled")).toBe(true);
});

it.each([200, 422])("HTTP cancellation takes precedence over response status %s without rewriting a successful save", async status => {
  vi.stubEnv("LATENCY_OBSERVABILITY", "1");
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const response = await observeHttpLatency("voice", async () => {
    await measureLatency("durable_save", async () => {});
    latencyOutcome("cancelled");
    return Response.json({ data: "unchanged" }, { status });
  });
  expect(response.status).toBe(status);
  const summary = JSON.parse(log.mock.calls[0]![0]) as LatencySummary;
  expect(summary.status).toBe("cancelled");
  expect(summary.events.find(event => event.event === "response_sent")?.status).toBe("cancelled");
  expect(summary.spans.find(span => span.stage === "durable_save")?.status).toBe("success");
});
