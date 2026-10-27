import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/groq.live.ts"], testTimeout: 50_000, retry: 0 } });
