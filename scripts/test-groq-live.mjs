import { spawnSync } from "node:child_process";
// Deliberately opt-in; credentials come only from the private server environment.
if (process.env.AI_PROVIDER !== "groq" || !process.env.GROQ_API_KEY?.trim() || /\s/.test(process.env.GROQ_API_KEY) ||
  !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(process.env.GROQ_MODEL ?? "")) {
  console.error("Groq live verification: NOT RUN. Configure AI_PROVIDER=groq, GROQ_API_KEY and GROQ_MODEL in a private server environment.");
  process.exit(1);
}
const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.groq-live.config.ts"], {
  stdio: "inherit", env: process.env, windowsHide: true,
});
process.exit(result.status ?? 1);
