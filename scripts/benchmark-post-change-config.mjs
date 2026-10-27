import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { dedicatedPostgresTestUrl } from "./postgres-config.mjs";

function reject(code) { throw Object.assign(new Error(code), { code }); }

export function validatePostChangeGates(pg, speech) {
  if (pg?.status !== "PASS" || pg.postgresql?.passed !== 60 || pg.postgresql?.failed !== 0 || pg.postgresql?.skipped !== 0 ||
      speech?.status !== "PASS" || speech.exitCode !== 0 || speech.model !== "eleven_v4_turbo" || speech.evidence?.cacheFailed !== false) {
    reject("POST_CHANGE_GATE_REQUIRED");
  }
}

/** Explicit disposable target only; never substitutes or rewrites DATABASE_URL. */
export function postChangeDatabaseConfiguration(env) {
  let url;
  try { url = dedicatedPostgresTestUrl(env.POSTGRES_TEST_DATABASE_URL, env.DATABASE_URL); }
  catch { reject("POST_CHANGE_TARGET_REJECTED"); }
  let tlsCa;
  try { tlsCa = env.POSTGRES_TEST_TLS_CA || (env.POSTGRES_TEST_TLS_CA_PATH ? readFileSync(env.POSTGRES_TEST_TLS_CA_PATH, "utf8") : undefined); }
  catch { reject("POST_CHANGE_CA_REQUIRED"); }
  if (!tlsCa?.trim()) reject("POST_CHANGE_CA_REQUIRED");
  if (!["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "ELEVENLABS_MODEL_ID"].every(name => env[name]?.trim()) || env.ELEVENLABS_MODEL_ID !== "eleven_v4_turbo") {
    reject("POST_CHANGE_SPEECH_CONFIGURATION_REQUIRED");
  }
  return { url, tlsCa };
}

export function checkPostChangeEvidence(directory = process.cwd()) {
  let pg, speech;
  try {
    pg = JSON.parse(readFileSync(resolve(directory, "docs/engineering/postgres-live-test-results.json"), "utf8"));
    speech = JSON.parse(readFileSync(resolve(directory, "docs/engineering/elevenlabs-live-verification.json"), "utf8"));
  } catch { reject("POST_CHANGE_GATE_REQUIRED"); }
  validatePostChangeGates(pg, speech);
  for (const [file, expected] of Object.entries({ ...pg.verificationSourceSha256, ...speech.sourceSha256 })) {
    let actual;
    try { actual = createHash("sha256").update(readFileSync(resolve(directory, file))).digest("hex"); }
    catch { reject("POST_CHANGE_GATE_REQUIRED"); }
    if (actual !== expected) reject("POST_CHANGE_GATE_REQUIRED");
  }
  for (const [file, expected] of Object.entries(pg.installedPatchedAdapterSha256 ?? {})) {
    let actual;
    try { actual = createHash("sha256").update(readFileSync(resolve(directory, "node_modules/@prisma/adapter-pg/dist", file))).digest("hex"); }
    catch { reject("POST_CHANGE_GATE_REQUIRED"); }
    if (actual !== expected) reject("POST_CHANGE_GATE_REQUIRED");
  }
}
