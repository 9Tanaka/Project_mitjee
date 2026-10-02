import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/speech.live.ts"], testTimeout: 25_000, retry: 0 } });
