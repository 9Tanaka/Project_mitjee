import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
const injected = vi.hoisted(() => ({ runtime: vi.fn() }));
vi.mock("../src/server/runtime.js", () => ({ getRuntime: injected.runtime }));
import { POST as message } from "../src/app/api/training/[sessionId]/message/route.js";
import { createApplication } from "../src/application/composition.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { GroqScenarioModelProvider } from "../src/providers/groq-scenario-provider.js";
import { messageDto } from "../src/http/dto.js";
import { fakeClient } from "./openai.fixtures.js";

afterEach(() => { vi.restoreAllMocks(); });
async function harness() {
  const client = fakeClient();
  const app = await createApplication(new InMemoryTrainingRepository(), new GroqScenarioModelProvider(client, "openai/gpt-oss-120b"));
  const principal = { id: "synthetic-owner" };
  const session = (await app.start("sms-phishing-demo", principal, { startId: randomUUID(), expectedRevision: 0 })).session;
  injected.runtime.mockReturnValue({ authenticator: { authenticate: async () => principal }, application: async () => app });
  const input = { turnId: "groq-turn", expectedRevision: session.revision, text: "ขอตรวจสอบข้อความจำลอง" };
  const send = (body: unknown) => message(new Request(`http://localhost/api/training/${session.sessionId}/message`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ sessionId: session.sessionId }) });
  return { client, input, send };
}
it.each(["provider", "model", "AI_PROVIDER", "GROQ_MODEL", "GROQ_API_KEY", "baseURL"])(
  "browser cannot override %s on a Groq-backed route", async field => {
    const h = await harness(); expect((await h.send({ ...h.input, [field]: "override" })).status).toBe(400);
    expect(h.client.create).not.toHaveBeenCalled();
  },
);
it("Groq route returns only public DTO and replays duplicate receipt", async () => {
  const h = await harness(); const response = await h.send(h.input); expect(response.status).toBe(200);
  const body = await response.json(); messageDto.parse(body.data);
  expect(JSON.stringify(body)).not.toMatch(/gpt-oss|GROQ|candidate_event|confidence|resp_synthetic|usage|allowedBehaviors/);
  const replay = await h.send(h.input); expect(replay.status).toBe(200); expect((await replay.json()).data.duplicate).toBe(true);
  expect(h.client.create).toHaveBeenCalledTimes(1);
});
