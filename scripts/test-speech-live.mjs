import { spawnSync } from "node:child_process";

// Explicit opt-in; no automatic .env loading and no private configuration output.
if (!process.env.AZURE_SPEECH_KEY || !process.env.AZURE_SPEECH_REGION) {
  console.error("Azure synthetic speech verification: NOT RUN. Configure AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in the private server environment.");
  process.exit(1);
}
const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.speech-live.config.ts"], {
  stdio: "inherit", env: process.env, windowsHide: true,
});
process.exit(result.status ?? 1);
