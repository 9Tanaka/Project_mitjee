import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { api, ApiFailure, errorMessages, MutationAttempt } from "../src/frontend/api.js";
import { scenarioDto } from "../src/public-api/contracts.js";
import * as original from "../src/http/dto.js";
import * as shared from "../src/public-api/contracts.js";
afterEach(() => vi.unstubAllGlobals());
it("public schemas remain the identical HTTP contracts rather than copies", () => {
  expect(original.sessionDto).toBe(shared.sessionDto); expect(original.resultDto).toBe(shared.resultDto);
});
it("API uses same-origin cookies, no-store and validates response", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ data: { count: 1 } })); vi.stubGlobal("fetch", fetcher);
  expect(await api("/api/example", z.strictObject({ count: z.number() }))).toEqual({ count: 1 });
  expect(fetcher.mock.calls[0]![1]).toMatchObject({ credentials: "same-origin", cache: "no-store", method: "GET" });
});
it("hidden/unexpected response data is rejected", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: { id: "x", category: "SMS", title: "t", description: "d", learningObjectives: [], communicationMode: "TEXT", configuration: {} } })));
  await expect(api("/api/scenarios/x", scenarioDto)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
it.each(Object.keys(errorMessages).filter(code => !["NETWORK_ERROR", "INVALID_RESPONSE"].includes(code)))("safe Thai mapping for %s never echoes server details", async code => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code, message: "PRIVATE_STACK_OR_INPUT" } }, { status: 400 })));
  const error = await api("/api/example", z.unknown()).catch(e => e as ApiFailure);
  if (!(error instanceof ApiFailure)) throw new Error("Expected safe API failure");
  expect(error.message).toBe(errorMessages[code]); expect(error.message).not.toContain("PRIVATE");
});
it("transport failure is uncertain and safe", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("raw network details")));
  await expect(api("/api/example", z.unknown())).rejects.toMatchObject({ code: "NETWORK_ERROR", status: 0, uncertain: true });
});
it("abort stays cancellation, not a misleading mutation error", async () => {
  const controller = new AbortController(); controller.abort();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("abort")));
  await expect(api("/api/example", z.unknown(), { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
});
it("mutation snapshots keep ID, revision and payload byte-for-byte when caller changes original", () => {
  const body = { actionId: crypto.randomUUID(), expectedRevision: 2, payload: { selectedEvidenceIds: ["option"] } };
  const attempt = new MutationAttempt("/api/training/id/action", body), first = attempt.body;
  body.expectedRevision = 3; body.payload.selectedEvidenceIds.push("later");
  expect(attempt.body).toBe(first); expect(JSON.parse(attempt.body).expectedRevision).toBe(2);
});
