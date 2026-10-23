import { spawnSync } from "node:child_process";

// Explicit opt-in; no automatic .env loading and no private configuration output.
if (!["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "ELEVENLABS_MODEL_ID"].every(name => process.env[name]?.trim())) {
  console.error("Azure STT / ElevenLabs TTS synthetic verification: NOT RUN. Configure AZURE_SPEECH_KEY, AZURE_SPEECH_REGION, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID and ELEVENLABS_MODEL_ID in the private server environment.");
  process.exit(1);
}
const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.speech-live.config.ts"], {
  stdio: "inherit", env: process.env, windowsHide: true,
});
process.exit(result.status ?? 1);
