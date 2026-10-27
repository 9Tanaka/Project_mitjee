import { expect, it } from "vitest";
import { runAllCallStories, requiredStories } from "../scripts/call-live-runner.mjs";
it("checks all four after failures, aggregates failure and never serializes raw errors", async () => {
  const visited: string[] = [];
  const result = await runAllCallStories(async (story: string) => {
    visited.push(story);
    if (story === "CC-N01") throw new Error("PRIVATE_PROVIDER_BODY_KEY_PASSWORD");
    return { status: story === "CC-01" ? "FAILED" : "PASSED", turns: [] };
  });
  expect(visited).toEqual(requiredStories); expect(result.stories).toHaveLength(4);
  expect(result.status).toBe("FAILED"); expect(result.stories[3].status).toBe("PASSED");
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
});
it("overall passes only when all four pass", async () => {
  expect((await runAllCallStories(async () => ({ status: "PASSED", turns: [] }))).status).toBe("PASSED");
});
