export const requiredStories = Object.freeze(["CC-01", "CC-02", "CC-N01", "CC-N02"]);
/** Do not stringify exceptions: they may contain secrets or raw provider bodies. */
export async function runAllCallStories(runStory) {
  const stories = [];
  for (const story of requiredStories) {
    try { stories.push({ story, ...(await runStory(story)) }); }
    catch { stories.push({ story, status: "FAILED", failureCategory: "VERIFICATION_OR_RUNTIME_FAILURE", turns: [] }); }
  }
  return { status: stories.every(s => s.status === "PASSED") ? "PASSED" : "FAILED", stories };
}
