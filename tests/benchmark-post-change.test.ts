import { describe, expect, it } from "vitest";
import { postChangeDatabaseConfiguration, validatePostChangeGates } from "../scripts/benchmark-post-change-config.mjs";

const env = {
  DATABASE_URL: "mysql://example@localhost/runtime",
  POSTGRES_TEST_DATABASE_URL: "postgres://example@localhost/mitjee_test_benchmark",
  POSTGRES_TEST_TLS_CA: "fixture trusted certificate",
  ELEVENLABS_API_KEY: "fixture-server-key", ELEVENLABS_VOICE_ID: "fixtureVoice", ELEVENLABS_MODEL_ID: "eleven_v4_turbo",
};
const pg = { status: "PASS", postgresql: { passed: 60, failed: 0, skipped: 0 } };
const speech = { status: "PASS", exitCode: 0, model: "eleven_v4_turbo", evidence: { cacheFailed: false } };
describe("bounded post-change benchmark guard", () => {
  it("uses only an explicit dedicated target without rewriting runtime configuration", () => {
    expect(postChangeDatabaseConfiguration(env)).toEqual({ url: env.POSTGRES_TEST_DATABASE_URL, tlsCa: env.POSTGRES_TEST_TLS_CA });
    expect(env.DATABASE_URL).toBe("mysql://example@localhost/runtime");
  });
  it("never falls back to the runtime database or accepts its PostgreSQL aliases", () => {
    expect(() => postChangeDatabaseConfiguration({ ...env, POSTGRES_TEST_DATABASE_URL: undefined })).toThrow("TARGET_REJECTED");
    expect(() => postChangeDatabaseConfiguration({ ...env, DATABASE_URL: "postgres://other@remote/mitjee_test_benchmark" })).toThrow("TARGET_REJECTED");
  });
  it("requires trusted TLS configuration and the owner-approved TTS model", () => {
    expect(() => postChangeDatabaseConfiguration({ ...env, POSTGRES_TEST_TLS_CA: undefined })).toThrow("CA_REQUIRED");
    expect(() => postChangeDatabaseConfiguration({ ...env, ELEVENLABS_MODEL_ID: "another-model" })).toThrow("SPEECH_CONFIGURATION_REQUIRED");
  });
  it("requires actual zero-skip database and successful live speech evidence", () => {
    expect(() => validatePostChangeGates(pg, speech)).not.toThrow();
    expect(() => validatePostChangeGates({ ...pg, postgresql: { passed: 59, failed: 1, skipped: 0 } }, speech)).toThrow("GATE_REQUIRED");
    expect(() => validatePostChangeGates({ ...pg, postgresql: { passed: 60, failed: 0, skipped: 1 } }, speech)).toThrow("GATE_REQUIRED");
    expect(() => validatePostChangeGates(pg, { ...speech, exitCode: 1 })).toThrow("GATE_REQUIRED");
    expect(() => validatePostChangeGates(pg, { ...speech, model: "another-model" })).toThrow("GATE_REQUIRED");
  });
});
