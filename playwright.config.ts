import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", workers: 1, retries: 0, timeout: 90_000, reporter: "line",
  use: { baseURL: process.env.E2E_BASE_URL, headless: true, viewport: { width: 1440, height: 1000 },
    trace: "off", video: "off", screenshot: "off" },
});
