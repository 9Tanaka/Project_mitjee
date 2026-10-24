// Bounded service/authenticated-loopback benchmark. The historical live guard is
// retained; --post-change uses only the explicitly approved PostgreSQL test DB.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import nextEnv from "@next/env";
import { register } from "tsx/esm/api";
import { classifySample, summarizeSamples, LATENCY_STAGES } from "./benchmark-latency-helpers.mjs";
import { checkPostChangeEvidence, postChangeDatabaseConfiguration } from "./benchmark-post-change-config.mjs";

register();
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });

const args = new Set(process.argv.slice(2));
const mode = args.has("--live") ? "live" : args.has("--synthetic") ? "synthetic" : null;
const useWebSocket = args.has("--websocket");
const postChange = args.has("--post-change");
if (mode === "live" && !postChange) {
  console.error("Run the authenticated MySQL/Groq/Azure baseline from a separate checkout of c7e0a2ce7cd9bfc529b9f57822ccec7c6e08e479 (historical service-only baseline: 91e707f376372aed5bdf415dd7bbb32d58583536). This checkout uses the later PostgreSQL/provider preparation.");
  process.exit(1);
}
const runId = randomUUID();
const startedAt = new Date().toISOString();
const LIVE_PLAN = { warmups: 2, measured: 10 };
const SYNTHETIC_PLAN = { warmups: 2, measured: 30 };
const INPUT_TEXT = "ขอตรวจสอบผ่านช่องทางทางการก่อนครับ";
const artifacts = { summary: null, traces: null, retainedSessions: null };
const records = [];
const retainedSessions = [];
const setupCounts = { actions: 0, mockOpenings: 0, retainedSessions: 0 };
const blockers = [];
const report = {
  schemaVersion: 1,
  runId,
  mode,
  stack: postChange ? "post-change" : "historical",
  status: "RUNNING",
  startedAt,
  completedAt: null,
  gitCommit: null,
  methodology: null,
  runtime: null,
  provider: null,
  initialization: { durationMs: null, scope: null },
  setup: null,
  cohorts: null,
  blockers,
  artifacts,
};

function progress(fields) {
  process.stdout.write(`${JSON.stringify({ event: "latency_benchmark_progress", runId, ...fields })}\n`);
}

function stop(code) {
  const error = new Error(code);
  error.name = "BenchmarkBlocker";
  error.code = code;
  throw error;
}

function safeFailureCategory(error) {
  if (error && typeof error === "object" && typeof error.code === "string") {
    const allowed = new Set([
      "LATENCY_CONFIG_MISSING", "LIVE_PROVIDER_NOT_CONFIGURED", "DATABASE_NOT_MYSQL",
      "DATABASE_UNAVAILABLE", "SCENARIO_PROVIDER_CONFIG_INVALID", "SPEECH_CONFIG_MISSING",
      "VOICE_INPUT_FIXTURE_UNAVAILABLE", "BENCHMARK_TEMPLATE_MISSING", "BENCHMARK_ACTION_MISSING",
      "BENCHMARK_SETUP_STATE_MISMATCH", "BENCHMARK_SAMPLE_SETUP_FAILED", "BENCHMARK_SAMPLE_FAILED",
      "APPLICATION_INITIALIZATION_FAILED",
      "POST_CHANGE_GATE_REQUIRED", "POST_CHANGE_TARGET_REJECTED", "POST_CHANGE_CA_REQUIRED", "POST_CHANGE_SPEECH_CONFIGURATION_REQUIRED",
    ]);
    if (allowed.has(error.code)) return error.code;
  }
  return "OPERATION_FAILED";
}

function safeProviderErrorCategory(error, classes) {
  if (classes.GroqProviderError && error instanceof classes.GroqProviderError) {
    return ["AUTHENTICATION", "RATE_LIMITED", "API_INCOMPATIBLE", "INVALID_OUTPUT", "UNAVAILABLE"].includes(error.category)
      ? error.category : "PROVIDER_FAILURE";
  }
  if (classes.ProviderRefusal && error instanceof classes.ProviderRefusal) return "REFUSAL";
  if (classes.OpenAIProviderError && error instanceof classes.OpenAIProviderError) return "PROVIDER_FAILURE";
  return error?.name === "AbortError" ? "CANCELLED" : "PROVIDER_FAILURE";
}

function liveConfigurationBlocker(env) {
  if (!postChange && !env.DATABASE_URL) return "LATENCY_CONFIG_MISSING";
  try { if (!postChange && new URL(env.DATABASE_URL).protocol !== "mysql:") return "DATABASE_NOT_MYSQL"; }
  catch { return "LATENCY_CONFIG_MISSING"; }
  if (!env.AI_PROVIDER || env.AI_PROVIDER === "mock") return "LIVE_PROVIDER_NOT_CONFIGURED";
  if (env.AI_PROVIDER === "groq" && (!env.GROQ_API_KEY?.trim() || !env.GROQ_MODEL?.trim())) return "LIVE_PROVIDER_NOT_CONFIGURED";
  if (env.AI_PROVIDER === "openai" && (!env.OPENAI_API_KEY?.trim() || !env.OPENAI_MODEL?.trim())) return "LIVE_PROVIDER_NOT_CONFIGURED";
  if (!["groq", "openai"].includes(env.AI_PROVIDER)) return "LIVE_PROVIDER_NOT_CONFIGURED";
  if (!env.AZURE_SPEECH_KEY?.trim() || !env.AZURE_SPEECH_REGION?.trim()) return "SPEECH_CONFIG_MISSING";
  return null;
}

function providerMetadata(env) {
  const scenarioProvider = mode === "live" ? env.AI_PROVIDER : "mock";
  const model = scenarioProvider === "groq" ? env.GROQ_MODEL : scenarioProvider === "openai" ? env.OPENAI_MODEL : "deterministic-mock";
  return {
    scenarioProvider,
    model: model || null,
    speechProvider: mode === "live" ? (postChange ? "azure-stt/elevenlabs-tts" : "azure") : "mock",
    speechRegion: mode === "live" ? env.AZURE_SPEECH_REGION : null,
    ttsModel: mode === "live" && postChange ? env.ELEVENLABS_MODEL_ID : null,
    ttsVoiceFingerprint: mode === "live" && postChange
      ? createHash("sha256").update(env.ELEVENLABS_VOICE_ID).digest("hex") : null,
  };
}

function makeSyntheticWav() {
  const pcmBytes = 3_200;
  const wav = new Uint8Array(44 + pcmBytes);
  const view = new DataView(wav.buffer);
  const writeTag = (offset, text) => [...text].forEach((char, index) => { wav[offset + index] = char.charCodeAt(0); });
  writeTag(0, "RIFF"); view.setUint32(4, wav.length - 8, true); writeTag(8, "WAVE");
  writeTag(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, 16_000, true); view.setUint32(28, 32_000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); writeTag(36, "data");
  view.setUint32(40, pcmBytes, true);
  return wav;
}

function actionIdForTransition(template, bindings, from, to) {
  const transition = template.states.find(state => state.id === from)?.transitions.find(edge => edge.target === to);
  const binding = transition && bindings.find(candidate => candidate.transitionId === transition.id);
  if (!binding) stop("BENCHMARK_ACTION_MISSING");
  return binding.public.id;
}

let database;
let socketBenchmark;
let app;
let voice;
let liveProvider;
let speechProvider;
let ttsProvider;
let activeProviderErrors = null;
let paidProviderEnabled = false;
let setupProvider;
let classes;
let audioInput;
let runLatencyTrace;
let template;
let templateBindings;
let environment;

async function prepareSession(cohort, phase, index) {
  const user = { id: randomUUID() };
  let sessionId = null;
  try {
    const started = await app.start("call-center", user, { startId: randomUUID() });
    sessionId = started.session.sessionId;
    if (mode === "live") {
      retainedSessions.push({ cohort, phase, index, sessionId });
      setupCounts.retainedSessions++;
    }
    let session = started.session;
    if (session.phone?.state !== "INCOMING_CALL") stop("BENCHMARK_SETUP_STATE_MISMATCH");

    const answerId = actionIdForTransition(template, templateBindings, "INCOMING_CALL", "CALL_CONNECTED");
    const answered = await app.action(sessionId, user, {
      actionId: randomUUID(), expectedRevision: session.revision, actionDefinitionId: answerId, payload: {},
    });
    setupCounts.actions++;
    session = answered.session;
    if (session.phone?.state !== "CALL_CONNECTED") stop("BENCHMARK_SETUP_STATE_MISMATCH");

    // The authored v6 caller openings use the deterministic mock before the measured learner turn.
    for (let attempt = 0; attempt < 3 && !(session.phone?.state === "IDENTITY_CLAIM" && session.phone.openingStatus === "READY"); attempt++) {
      if (!["CALL_CONNECTED", "IDENTITY_CLAIM"].includes(session.phone?.state ?? "")) stop("BENCHMARK_SETUP_STATE_MISMATCH");
      const opened = await app.opening(sessionId, user, { expectedRevision: session.revision });
      setupCounts.mockOpenings++;
      session = opened.session;
    }
    if (session.phone?.state !== "IDENTITY_CLAIM" || session.phone.openingStatus !== "READY") stop("BENCHMARK_SETUP_STATE_MISMATCH");
    return { sessionId, user, revision: session.revision };
  } catch {
    if (sessionId && mode === "live" && !retainedSessions.some(item => item.sessionId === sessionId)) {
      retainedSessions.push({ cohort, phase, index, sessionId });
      setupCounts.retainedSessions++;
    }
    stop("BENCHMARK_SAMPLE_SETUP_FAILED");
  }
}

async function runOneSample(cohort, phase, index) {
  const prepared = await prepareSession(cohort, phase, index);
  const providerErrorCategories = [];
  let trace = null;
  let result = null;
  let safeFailure = null;
  let clientRoundTripMs = null;
  activeProviderErrors = providerErrorCategories;
  paidProviderEnabled = true;
  try {
    const work = cohort === "text"
      ? () => app.message(prepared.sessionId, prepared.user, {
        turnId: randomUUID(), expectedRevision: prepared.revision, text: INPUT_TEXT,
      })
      : () => voice.send(prepared.sessionId, prepared.user, {
        turnId: randomUUID(), expectedRevision: prepared.revision, audio: audioInput, mime: "audio/wav",
      });
    if (socketBenchmark) {
      const sample = await socketBenchmark.sample(cohort, prepared, INPUT_TEXT, audioInput);
      trace = sample.trace; result = sample.result; clientRoundTripMs = sample.clientRoundTripMs;
    } else result = await (cohort === "text"
      ? runLatencyTrace({
        transport: "service", operation: "message", sink: summary => { trace = summary; },
      }, work)
      : runLatencyTrace({
        transport: "service", operation: "voice", sink: summary => { trace = summary; },
      }, work));
  } catch (error) {
    safeFailure = safeFailureCategory(error);
  } finally {
    paidProviderEnabled = false;
    activeProviderErrors = null;
  }
  const audioStatus = cohort === "voice" && result ? result.audioStatus : null;
  const outcome = trace ? classifySample(trace, { voice: cohort === "voice", audioStatus })
    : "operation_failure";
  return {
    cohort, phase, sample: index, outcome, audioStatus,
    safeFailure,
    providerErrorCategories,
    trace,
    clientRoundTripMs,
  };
}

function summarizeCohort(cohort) {
  const selected = records.filter(record => record.cohort === cohort);
  const warmups = selected.filter(record => record.phase === "warmup");
  const measured = selected.filter(record => record.phase === "measured");
  const warmupSummary = summarizeSamples(warmups, LATENCY_STAGES);
  return {
    warmups: { samples: warmups.length, outcomeCounts: warmupSummary.outcomeCounts },
    measured: summarizeSamples(measured, LATENCY_STAGES),
  };
}

function stopReasonFor(record, state) {
  for (const category of record.providerErrorCategories) {
    state.providerErrorCounts[category] = (state.providerErrorCounts[category] ?? 0) + 1;
    if (category === "AUTHENTICATION") return "AUTHENTICATION_FAILURE";
    if (category === "RATE_LIMITED" && state.providerErrorCounts[category] >= 2) return "REPEATED_RATE_LIMIT_FAILURE";
  }
  if (record.trace?.fallback || record.outcome === "operation_failure") state.failureStreak++;
  else state.failureStreak = 0;
  if (state.failureStreak >= 2) return "REPEATED_FALLBACK_OR_OPERATION_FAILURE";

  if (record.audioStatus === "UNAVAILABLE") state.ttsUnavailableStreak++;
  else if (record.cohort === "voice") state.ttsUnavailableStreak = 0;
  if (record.cohort === "voice" && state.ttsUnavailableStreak >= 2) return "REPEATED_TTS_UNAVAILABLE";
  return null;
}

async function main() {
  if (!mode) stop("LATENCY_CONFIG_MISSING");
  if (args.size !== 1 + Number(useWebSocket) + Number(postChange) || [...args].some(arg => !["--live", "--synthetic", "--websocket", "--post-change"].includes(arg)) || (args.has("--live") && args.has("--synthetic"))) stop("LATENCY_CONFIG_MISSING");

  const modules = await Promise.all([
    import("../src/application/composition.ts"),
    import("../src/domain/repository.ts"),
    import("../src/dialogue/mock-provider.ts"),
    import("../src/application/catalog.ts"),
    import("../src/persistence/prisma-repository.ts"),
    import("../src/server/database.ts"),
    import("../src/server/scenario-provider.ts"),
    import("../src/server/voice-runtime.ts"),
    import("../src/application/voice-service.ts"),
    import("../src/speech/contracts.ts"),
    import("../src/providers/groq-scenario-provider.ts"),
    import("../src/providers/openai-scenario-provider.ts"),
    import("../src/dialogue/contracts.ts"),
    import("../src/observability/latency.ts"),
    import("node:child_process"),
  ]);
  const [composition, inMemory, mock, catalog, persistence, databaseModule, scenarioRuntime, speechRuntime,
    voiceModule, speechContracts, groq, openai, dialogueContracts, latency, childProcess] = modules;
  runLatencyTrace = latency.runLatencyTrace;
  classes = {
    GroqProviderError: groq.GroqProviderError,
    OpenAIProviderError: openai.OpenAIProviderError,
    ProviderRefusal: dialogueContracts.ProviderRefusal,
    SpeechError: speechContracts.SpeechError,
  };
  environment = process.env;
  if (mode === "live") {
    let postChangeDatabase;
    if (postChange) {
      checkPostChangeEvidence();
      postChangeDatabase = postChangeDatabaseConfiguration(environment);
    }
    const blocker = liveConfigurationBlocker(environment);
    if (blocker) stop(blocker);
    try { liveProvider = scenarioRuntime.createScenarioProvider(environment); }
    catch { stop("SCENARIO_PROVIDER_CONFIG_INVALID"); }
    try {
      speechProvider = postChange ? speechRuntime.createSpeechToTextProvider(environment) : speechRuntime.createSpeechProvider(environment);
      ttsProvider = postChange ? speechRuntime.createTextToSpeechProvider(environment) : speechProvider;
      const fixtureStarted = performance.now();
      audioInput = await speechContracts.speechDeadline(signal => postChange
        ? import("./benchmark-azure-input.mjs").then(module => module.baselineInputAudio(INPUT_TEXT, environment, signal))
        : speechProvider.synthesize(INPUT_TEXT, signal));
      speechContracts.validateWav(audioInput, "audio/wav");
      report.setup = { inputAudioFixture: "single Azure-generated synthetic WAV; outside trace", inputAudioFixtureBytes: audioInput.byteLength,
        inputAudioFixtureMs: Math.round(performance.now() - fixtureStarted), mockProviderSetup: true };
    } catch { stop("VOICE_INPUT_FIXTURE_UNAVAILABLE"); }
    try { database = postChange
      ? (await import("../src/persistence/prisma-client.ts")).createPrismaClient(postChangeDatabase.url, { tlsCa: postChangeDatabase.tlsCa })
      : databaseModule.createDatabase(); }
    catch { stop("DATABASE_UNAVAILABLE"); }
  } else {
    audioInput = makeSyntheticWav();
    report.setup = { inputAudioFixture: "in-memory synthetic WAV with deterministic mock STT", mockProviderSetup: true };
  }

  const repository = mode === "live" ? new persistence.PrismaTrainingRepository(database) : new inMemory.InMemoryTrainingRepository();
  setupProvider = new mock.MockScenarioModelProvider();
  const syntheticProvider = new mock.MockScenarioModelProvider();
  const routedProvider = {
    async generateCharacterResponse(context, options) {
      const provider = mode === "live" ? (paidProviderEnabled ? liveProvider : setupProvider)
        : (paidProviderEnabled ? syntheticProvider : setupProvider);
      if (mode === "live" && paidProviderEnabled) {
        try { return await provider.generateCharacterResponse(context, options); }
        catch (error) { activeProviderErrors?.push(safeProviderErrorCategory(error, classes)); throw error; }
      }
      return provider.generateCharacterResponse(context, options);
    },
  };

  const initStarted = performance.now();
  try { app = await composition.createApplication(repository, routedProvider, Date.now, undefined, () => "CC-01"); }
  catch { stop(mode === "live" ? "DATABASE_UNAVAILABLE" : "APPLICATION_INITIALIZATION_FAILED"); }
  report.initialization = { durationMs: Math.max(0, Math.round(performance.now() - initStarted)),
    scope: mode === "live" ? `application setup plus ${postChange ? "PostgreSQL" : "MySQL"} template publication/connection` : "application setup over in-memory repository" };
  if (mode === "live") voice = new voiceModule.VoiceApplicationService(app, speechProvider, ttsProvider);
  else {
    const speechMock = {
      async transcribe() { return INPUT_TEXT; },
      async synthesize() { return makeSyntheticWav(); },
    };
    voice = new voiceModule.VoiceApplicationService(app, speechMock, speechMock);
  }

  // Start uses the public v6 template. Resolve it from the registered catalog rather than stale v5 labels.
  const targetTemplate = catalog.registeredTemplates.find(candidate => candidate.callCenter?.storyId === "CC-01" && candidate.version === 6);
  if (!targetTemplate) stop("BENCHMARK_TEMPLATE_MISSING");
  template = targetTemplate;
  templateBindings = catalog.actionBindings(template);
  if (useWebSocket) socketBenchmark = await (await import("./benchmark-latency-socket.mjs")).createSocketBenchmark(app, voice);

  report.status = "RUNNING";
  report.methodology = {
    scenario: { story: "CC-01", templateVersion: 6, initialMeasuredState: "IDENTITY_CLAIM", measuredUserTurnsPerSession: 1 },
    concurrency: 1,
    warmupsPerCohort: mode === "live" ? LIVE_PLAN.warmups : SYNTHETIC_PLAN.warmups,
    measuredSamplesPerCohort: mode === "live" ? LIVE_PLAN.measured : SYNTHETIC_PLAN.measured,
    percentile: "nearest-rank; p95 exploratory at these sample counts",
    liveSuccessfulDialogueCallCap: 24,
    auth: useWebSocket ? "production SocketCookieAuthenticator with ephemeral Auth.js JWT fixture" : null,
    sqlReads: null,
    sqlWrites: null,
    traceTransport: useWebSocket ? "websocket" : "service",
    syntheticLiveSetup: "mock caller openings and one received-call action per fresh session, outside measured traces",
  };
  report.runtime = mode === "live" ? { database: postChange ? "dedicated PostgreSQL test target" : "MySQL runtime", persistenceScope: "training_repository", serviceAuthentication: null }
    : { database: "in-memory", persistenceScope: "training_repository", serviceAuthentication: null };
  report.provider = providerMetadata(environment);
  report.executionEnvironment = { node: process.version, platform: process.platform, architecture: process.arch };

  try {
    const git = childProcess.execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    report.gitCommit = /^[0-9a-f]{40}$/i.test(git) ? git : null;
  } catch { report.gitCommit = null; }
  const plan = mode === "live" ? LIVE_PLAN : SYNTHETIC_PLAN;
  const guard = { providerErrorCounts: {}, failureStreak: 0, ttsUnavailableStreak: 0 };

  progress({ stage: "initialization_complete", cohort: null, phase: null, completed: 0, total: 0 });
  for (const cohort of ["text", "voice"]) {
    const cohortPlan = plan;
    const phases = [["warmup", cohortPlan.warmups], ["measured", cohortPlan.measured]];
    for (const [phase, total] of phases) {
      for (let index = 1; index <= total; index++) {
        progress({ stage: "sample_start", cohort, phase, completed: index - 1, total });
        let record;
        try { record = await runOneSample(cohort, phase, index); }
        catch (error) {
          record = { cohort, phase, sample: index, outcome: "operation_failure", audioStatus: null,
            safeFailure: safeFailureCategory(error), providerErrorCategories: [], trace: null };
        }
        records.push(record);
        if (mode === "live") await saveRetainedManifest();
        progress({ stage: "sample_complete", cohort, phase, completed: index, total, outcome: record.outcome,
          providerErrors: record.providerErrorCategories });
        const stopReason = stopReasonFor(record, guard);
        if (record.safeFailure === "BENCHMARK_SAMPLE_SETUP_FAILED" || record.safeFailure === "BENCHMARK_SETUP_STATE_MISMATCH" || stopReason) {
          blockers.push(record.safeFailure ?? stopReason);
          report.status = "PARTIAL";
          break;
        }
      }
      if (report.status === "PARTIAL") break;
    }
    if (report.status === "PARTIAL") break;
  }
  report.cohorts = { text: summarizeCohort("text"), voice: summarizeCohort("voice") };
  report.setup.mockProviderSetup = true;
  report.setup.mockActions = setupCounts.actions;
  report.setup.mockOpenings = setupCounts.mockOpenings;
  report.setup.retainedSyntheticSessions = setupCounts.retainedSessions;
  if (report.status === "RUNNING") report.status = "COMPLETED";
}

async function saveRetainedManifest() {
  const directory = path.join(process.cwd(), "frontend-artifacts");
  await mkdir(directory, { recursive: true });
  const filename = path.join(directory, `latency-benchmark-${runId}-retained-sessions.json`);
  await writeFile(filename, JSON.stringify({ runId, createdAt: startedAt, sessions: retainedSessions }, null, 2), "utf8");
  artifacts.retainedSessions = path.relative(process.cwd(), filename).replaceAll("\\", "/");
}

async function saveArtifacts() {
  const directory = path.join(process.cwd(), "frontend-artifacts");
  await mkdir(directory, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const stem = `latency-benchmark-${mode ?? "unknown"}${postChange ? "-post-change" : ""}-${stamp}-${runId.slice(0, 8)}`;
  const summaryPath = path.join(directory, `${stem}.json`);
  const tracePath = path.join(directory, `${stem}.jsonl`);
  artifacts.summary = path.relative(process.cwd(), summaryPath).replaceAll("\\", "/");
  artifacts.traces = path.relative(process.cwd(), tracePath).replaceAll("\\", "/");
  await writeFile(tracePath, records.map(record => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""), "utf8");
  report.completedAt = new Date().toISOString();
  await writeFile(summaryPath, JSON.stringify(report, null, 2), "utf8");
}

async function closeResources() {
  if (socketBenchmark) await socketBenchmark.close();
  if (database) {
    try { await (await import("../src/server/database.ts")).closeDatabase(database); }
    catch { blockers.push("DATABASE_DISCONNECT_FAILED"); }
  }
}

if (!mode) {
  process.stderr.write("Usage: node scripts/benchmark-latency.mjs (--synthetic | --live) [--websocket] [--post-change]\n");
  process.exitCode = 2;
} else {
  try { await main(); }
  catch (error) {
    const category = safeFailureCategory(error);
    if (!blockers.includes(category)) blockers.push(category);
    report.status = "BLOCKED";
    report.completedAt = new Date().toISOString();
  } finally {
    await closeResources();
    if (mode === "live" && retainedSessions.length) {
      try { await saveRetainedManifest(); } catch { blockers.push("RETAINED_SESSION_MANIFEST_WRITE_FAILED"); }
    }
    if (report.cohorts === null && records.length) report.cohorts = { text: summarizeCohort("text"), voice: summarizeCohort("voice") };
    try { await saveArtifacts(); }
    catch { process.stderr.write("Latency benchmark artifact writing failed.\n"); }
    process.stdout.write(`${JSON.stringify({ event: "latency_benchmark_complete", runId, mode, status: report.status,
      cohorts: report.cohorts && Object.fromEntries(Object.entries(report.cohorts).map(([cohort, value]) =>
        [cohort, { measuredSamples: value.measured.samples, warmupSamples: value.warmups.samples, outcomes: value.measured.outcomeCounts }])),
      blockers, artifacts })}\n`);
    if (!["COMPLETED"].includes(report.status)) process.exitCode = 1;
  }
}
