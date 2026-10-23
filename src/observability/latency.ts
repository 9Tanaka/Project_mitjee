import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

export type LatencyTransport = "http" | "websocket" | "websocket_handshake" | "service";
export type LatencyOperation = "scenarios" | "scenario" | "start" | "resume" | "message" | "opening" | "action" | "quit" | "result" | "voice" | "speech" | "handshake";
export type LatencyStatus = "success" | "failure" | "cancelled";
export type LatencyStage = "auth" | "db_preflight" | "context" | "llm" | "validation" | "retry" | "ai" | "commit" | "durable_save" | "stt" | "tts";
export type LatencyEvent = "request_received" | "auth_complete" | "db_preflight_complete" | "stt_start" | "stt_complete" | "context_ready" | "llm_start" | "llm_first_token" | "llm_complete" | "db_commit_complete" | "tts_start" | "tts_complete" | "response_sent";
export type RepositoryOperation = "get" | "getTemplate" | "create" | "save" | "publish";
type Span = { stage: LatencyStage; startMs: number; durationMs: number; status: LatencyStatus; attempt: number | null };
type Event = { event: LatencyEvent; atMs: number; status: LatencyStatus; attempt: number | null; duplicate: boolean | null };
type Count = { attempts: number; succeeded: number; failed: number };
export interface LatencySummary {
  schemaVersion: 1; event: "latency_summary"; timestamp: string; requestId: string;
  transport: LatencyTransport; operation: LatencyOperation; sessionId: string | null; turnId: string | null;
  status: LatencyStatus; errorCategory: "operation_failed" | "cancelled" | null;
  duplicate: boolean; fallback: boolean; attempts: number; retryCount: number;
  totalMs: number; durationsMs: Record<LatencyStage, number | null>;
  ttftMs: null; ttftUnavailableReason: "non_streaming";
  repositoryReads: number; repositoryWrites: number; repositoryOperations: Record<RepositoryOperation, Count>;
  aggregateDbReads: Count | null;
  persistenceScope: "training_repository"; prismaReadOperations: null; prismaWriteOperations: null; sqlReads: null; sqlWrites: null;
  events: Event[]; spans: Span[]; truncated: boolean;
}
export interface LatencyOptions {
  transport: LatencyTransport; operation: LatencyOperation; enabled?: boolean;
  sink?: (summary: LatencySummary) => void | Promise<void>;
}
type Trace = {
  options: LatencyOptions; requestId: string; timestamp: string; started: number; finished: boolean;
  sessionId: string | null; turnId: string | null; status: LatencyStatus;
  duplicate: boolean; fallback: boolean; attempts: number; events: Event[]; spans: Span[]; truncated: boolean;
  pendingSpans: Set<(status?: LatencyStatus) => void>;
  durations: Record<LatencyStage, number | null>; counts: Record<RepositoryOperation, Count>;
  aggregateDbReads: Count | null;
};
const storage = new AsyncLocalStorage<Trace>();
const key = randomBytes(32);
const stages: LatencyStage[] = ["auth", "db_preflight", "context", "llm", "validation", "retry", "ai", "commit", "durable_save", "stt", "tts"];
const eventNames = new Set<LatencyEvent>(["request_received", "auth_complete", "db_preflight_complete", "stt_start", "stt_complete", "context_ready", "llm_start", "llm_first_token", "llm_complete", "db_commit_complete", "tts_start", "tts_complete", "response_sent"]);
const operations = new Set<LatencyOperation>(["scenarios", "scenario", "start", "resume", "message", "opening", "action", "quit", "result", "voice", "speech", "handshake"]);
const transports = new Set<LatencyTransport>(["http", "websocket", "websocket_handshake", "service"]);
const recordLimit = 96;
const elapsed = (trace: Trace) => Math.max(0, performance.now() - trace.started);
const current = () => { const trace = storage.getStore(); return trace && !trace.finished ? trace : undefined; };
const pseudonym = (kind: string, values: string[]) => createHmac("sha256", key).update(JSON.stringify([kind, ...values])).digest("hex").slice(0, 32);

/** IDs are consumed only for keyed correlation; raw identities never enter records. */
export function identifyLatency(sessionId: string, turnId?: string) {
  try {
    const trace = current(); if (!trace) return;
    trace.sessionId = pseudonym("session", [sessionId]);
    if (turnId !== undefined) trace.turnId = pseudonym("turn", [sessionId, turnId]);
  } catch {}
}
export function latencyRequestId(): string | undefined { return current()?.requestId; }
export function latencyOperation(operation: LatencyOperation) {
  try { const trace = current(); if (trace && operations.has(operation)) trace.options = { ...trace.options, operation }; } catch {}
}
export function latencyOutcome(status: LatencyStatus) {
  try {
    const trace = current();
    if (trace && (status === "cancelled" || (status === "failure" && trace.status === "success"))) trace.status = status;
    return trace?.status;
  } catch { return undefined; }
}
export function latencyFlags(flags: { duplicate?: boolean; fallback?: boolean }) {
  try { const trace = current(); if (!trace) return; if (flags.duplicate === true) trace.duplicate = true; if (flags.fallback === true) trace.fallback = true; } catch {}
}
export function latencyEvent(event: LatencyEvent, status: LatencyStatus = "success", attempt?: number, duplicate?: boolean) {
  recordEvent(current(), event, status, attempt, duplicate);
}
function recordEvent(trace: Trace | undefined, event: LatencyEvent, status: LatencyStatus = "success", attempt?: number, duplicate?: boolean) {
  try {
    if (!trace || trace.finished || !eventNames.has(event) || event === "llm_first_token") return;
    if (trace.events.length >= recordLimit) { trace.truncated = true; return; }
    trace.events.push({ event, atMs: elapsed(trace), status: status === "failure" || status === "cancelled" ? status : "success",
      attempt: Number.isSafeInteger(attempt) && attempt! > 0 && attempt! <= 2 ? attempt! : null, duplicate: typeof duplicate === "boolean" ? duplicate : null });
  } catch {}
}
const milestone: Partial<Record<LatencyStage, LatencyEvent>> = { auth: "auth_complete", db_preflight: "db_preflight_complete", context: "context_ready", llm: "llm_complete", durable_save: "db_commit_complete", stt: "stt_complete", tts: "tts_complete" };
export function beginLatencySpan(stage: LatencyStage, attempt?: number): (status?: LatencyStatus) => void {
  try {
    const trace = current(); if (!trace || !stages.includes(stage)) return () => {};
    const startMs = elapsed(trace); let ended = false;
    if (stage === "llm") { trace.attempts++; latencyEvent("llm_start", "success", attempt); }
    if (stage === "stt") latencyEvent("stt_start");
    if (stage === "tts") latencyEvent("tts_start");
    if (trace.spans.length + trace.pendingSpans.size >= recordLimit) { trace.truncated = true; return () => {}; }
    const end = (status: LatencyStatus = "success") => {
      try {
        if (ended || trace.finished) return; ended = true;
        trace.pendingSpans.delete(end);
        status = status === "failure" || status === "cancelled" ? status : "success";
        const durationMs = Math.max(0, elapsed(trace) - startMs);
        trace.durations[stage] = (trace.durations[stage] ?? 0) + durationMs;
        if (trace.spans.length < recordLimit) trace.spans.push({ stage, startMs, durationMs, status, attempt: attempt ?? null }); else trace.truncated = true;
        const event = milestone[stage];
        // A failed save never claims that a durable commit completed.
        if (event && !(stage === "durable_save" && status !== "success")) recordEvent(trace, event, status, attempt);
      } catch {}
    };
    trace.pendingSpans.add(end);
    return end;
  } catch { return () => {}; }
}
export async function measureLatency<T>(stage: LatencyStage, work: () => Promise<T>, attempt?: number, signal?: AbortSignal): Promise<T> {
  const end = beginLatencySpan(stage, attempt);
  try { const value = await work(); end(); return value; }
  catch (error) { end(signal?.aborted ? "cancelled" : "failure"); throw error; }
}
export function measureLatencySync<T>(stage: LatencyStage, work: () => T): T {
  const end = beginLatencySpan(stage);
  try { const value = work(); end(); return value; }
  catch (error) { end("failure"); throw error; }
}
export function countRepository(operation: RepositoryOperation): (success: boolean) => void {
  try {
    const trace = current(); if (!trace || !Object.hasOwn(trace.counts, operation)) return () => {};
    const count = trace.counts[operation]; count.attempts++; let ended = false;
    return success => { try { if (!trace.finished && !ended) { ended = true; if (success) count.succeeded++; else count.failed++; } } catch {} };
  } catch { return () => {}; }
}
/** Count actual Prisma session aggregate fetches, including the read inside SAVE.
 * An included relation can issue several SQL statements; this is not a SQL counter. */
export async function observeAggregateDbRead<T>(work: () => Promise<T>): Promise<T> {
  const trace = current();
  if (!trace) return work();
  const count = trace.aggregateDbReads ??= { attempts: 0, succeeded: 0, failed: 0 };
  count.attempts++;
  try { const result = await work(); if (!trace.finished) count.succeeded++; return result; }
  catch (error) { if (!trace.finished) count.failed++; throw error; }
}
/** Captures an existing transport deadline without changing its business work. */
export function captureLatencyFinalizer(): (status: LatencyStatus) => void {
  const trace = current();
  return status => {
    if (!trace || trace.finished) return;
    if (status === "cancelled" || (status === "failure" && trace.status === "success")) trace.status = status;
    finish(trace);
  };
}
function finish(trace: Trace) {
  if (trace.finished) return;
  // Deadline races can leave provider work running. Close its observations at
  // this boundary; later settlements must not change this or another trace.
  for (const end of trace.pendingSpans) end(trace.status === "failure" ? "failure" : "cancelled");
  trace.finished = true;
  try {
    const summary: LatencySummary = {
      schemaVersion: 1, event: "latency_summary", timestamp: trace.timestamp, requestId: trace.requestId,
      transport: trace.options.transport, operation: trace.options.operation, sessionId: trace.sessionId, turnId: trace.turnId,
      status: trace.status, errorCategory: trace.status === "success" ? null : trace.status === "cancelled" ? "cancelled" : "operation_failed",
      duplicate: trace.duplicate, fallback: trace.fallback, attempts: trace.attempts, retryCount: Math.max(0, trace.attempts - 1),
      totalMs: elapsed(trace), durationsMs: { ...trace.durations }, ttftMs: null, ttftUnavailableReason: "non_streaming",
      repositoryReads: trace.counts.get.attempts + trace.counts.getTemplate.attempts,
      repositoryWrites: trace.counts.create.attempts + trace.counts.save.attempts + trace.counts.publish.attempts,
      aggregateDbReads: trace.aggregateDbReads ? { ...trace.aggregateDbReads } : null,
      repositoryOperations: trace.counts, persistenceScope: "training_repository", prismaReadOperations: null, prismaWriteOperations: null, sqlReads: null, sqlWrites: null,
      events: trace.events, spans: trace.spans, truncated: trace.truncated,
    };
    const result = trace.options.sink ? trace.options.sink(summary) : console.info(JSON.stringify(summary));
    if (result && typeof result.then === "function") void Promise.resolve(result).catch(() => {});
  } catch {}
}
/** One summary per scope, never awaits logging, and preserves the operation's result/error. */
export async function runLatencyTrace<T>(options: LatencyOptions, work: () => Promise<T>): Promise<T> {
  if (options.enabled === false || !(options.enabled === true || options.sink || process.env.LATENCY_OBSERVABILITY === "1")) return work();
  if (!transports.has(options.transport) || !operations.has(options.operation)) return work();
  const trace: Trace = { options, requestId: randomUUID(), timestamp: new Date().toISOString(), started: performance.now(), finished: false,
    sessionId: null, turnId: null, status: "success", duplicate: false, fallback: false, attempts: 0, events: [], spans: [], pendingSpans: new Set(), truncated: false,
    aggregateDbReads: null,
    durations: Object.fromEntries(stages.map(stage => [stage, null])) as Record<LatencyStage, number | null>,
    counts: { get: { attempts: 0, succeeded: 0, failed: 0 }, getTemplate: { attempts: 0, succeeded: 0, failed: 0 },
      create: { attempts: 0, succeeded: 0, failed: 0 }, save: { attempts: 0, succeeded: 0, failed: 0 }, publish: { attempts: 0, succeeded: 0, failed: 0 } } };
  return storage.run(trace, async () => {
    latencyEvent("request_received");
    try { return await work(); }
    catch (error) { latencyOutcome("failure"); throw error; }
    finally { finish(trace); }
  });
}
/** Framework handoff only; does not claim that the client received the bytes. */
export function observeHttpLatency(operation: LatencyOperation, work: () => Promise<Response>): Promise<Response> {
  return runLatencyTrace({ transport: "http", operation }, async () => {
    const response = await work();
    const responseStatus = response.status >= 400 ? "failure" : "success";
    const status = latencyOutcome(responseStatus) ?? responseStatus;
    latencyEvent("response_sent", status);
    return response;
  });
}
