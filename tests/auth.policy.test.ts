import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ nextAuth: vi.fn() }));
vi.mock("next-auth", () => ({ default: mocks.nextAuth }));
import { resolveAuthJsSession } from "../src/auth/authjs.js";
import { identityCallbacks } from "../src/auth/session-policy.js";
import { toActionInput, toMessageInput, toQuitInput, toStartInput, toScenarioDto } from "../src/http/mapping.js";
import { publicScenario, playableTemplate } from "../src/application/catalog.js";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it.each([false, true])("without an approved provider even AUTH_SECRET present=%s cannot enable authentication", async configuredSecret => {
  vi.stubEnv("AUTH_SECRET", configuredSecret ? randomUUID() : "");
  expect(await resolveAuthJsSession()).toBeNull(); expect(mocks.nextAuth).not.toHaveBeenCalled();
});
type JWTInput = Parameters<typeof identityCallbacks.jwt>[0];
type SessionInput = Parameters<typeof identityCallbacks.session>[0];
it("supported JWT/session callbacks retain only the stable verified user ID", () => {
  const id = randomUUID(); const secret = randomUUID();
  const token = identityCallbacks.jwt({ user: { id, name: "fictional", email: "fictional@example.test" }, token: { sub: "not-authoritative", access_token: secret, refresh_token: secret } } as unknown as JWTInput);
  expect(token).toEqual({ trainingUserId: id });
  const session = identityCallbacks.session({ token, session: { expires: "2099-01-01T00:00:00.000Z", user: { email: "fictional@example.test" }, access_token: secret } } as unknown as SessionInput);
  expect(session).toEqual({ expires: "2099-01-01T00:00:00.000Z", user: { id } });
});
it("JWT update data cannot replace the existing account ID", () => {
  const id = randomUUID();
  expect(identityCallbacks.jwt({ token: { trainingUserId: id }, trigger: "update", session: { user: { id: randomUUID() }, trainingUserId: randomUUID() } } as unknown as JWTInput)).toEqual({ trainingUserId: id });
});
it.each([undefined, "", "fictional@example.test", "mutable-name", 123])("missing/nonopaque account ID %# never falls back to email, name or sub", id => {
  const token = identityCallbacks.jwt({ user: { id }, token: { sub: randomUUID(), trainingUserId: randomUUID() } } as unknown as JWTInput);
  expect(token).toBeNull();
  expect(identityCallbacks.session({ token: { trainingUserId: id }, session: { expires: "2099-01-01T00:00:00.000Z" } } as unknown as SessionInput).user).toEqual({});
});
it("HTTP input mapping copies only approved application fields and detaches arrays", () => {
  const action = { actionId: "act", expectedRevision: 0, actionDefinitionId: "a03", payload: { selectedEvidenceIds: ["o1"] }, ownerId: "ignored" };
  const mapped = toActionInput(action);
  expect(mapped).toEqual({ actionId: "act", expectedRevision: 0, actionDefinitionId: "a03", payload: { selectedEvidenceIds: ["o1"] } });
  action.payload.selectedEvidenceIds.push("o2"); expect(mapped.payload).toEqual({ selectedEvidenceIds: ["o1"] });
  const message = { turnId: "turn", expectedRevision: 0, text: "hello", ownerId: "ignored" };
  expect(toMessageInput(message)).toEqual({ turnId: "turn", expectedRevision: 0, text: "hello" });
  expect(toQuitInput({ actionId: "quit", expectedRevision: 0 })).toEqual({ actionId: "quit", expectedRevision: 0 });
  const start = { startId: randomUUID(), expectedRevision: 0 as const }; expect(toStartInput(start)).toEqual(start); expect(toStartInput(start)).not.toBe(start);
});
it("HTTP response validation rejects extra application fields rather than leaking them", () => {
  expect(() => toScenarioDto({ ...publicScenario(playableTemplate), internalSecret: "not-public" } as ReturnType<typeof publicScenario>)).toThrow();
});
