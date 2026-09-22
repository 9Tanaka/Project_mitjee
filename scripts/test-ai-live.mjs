import { spawnSync } from "node:child_process";
// Deliberately separate from npm test; no .env loading, no credential output.
if (process.env.AI_PROVIDER !== "openai" || !process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
  console.error("Real OpenAI network verification: NOT RUN. Configure AI_PROVIDER=openai, OPENAI_API_KEY and OPENAI_MODEL in a private server environment.");
  process.exit(1);
}
const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.ai-live.config.ts"], {
  stdio: "inherit", env: process.env, windowsHide: true,
});
process.exit(result.status ?? 1);
