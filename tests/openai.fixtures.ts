import { vi } from "vitest";
import type { AICharacterResponse, ScenarioAIContext } from "../src/dialogue/contracts.js";
import type { ResponsesClient } from "../src/providers/openai-scenario-provider.js";
export const answer = (overrides: Partial<AICharacterResponse> = {}): AICharacterResponse => ({
  character_message: "ข้อความสมมติสำหรับฝึกพิจารณาสถานการณ์", observed_intent: "continue",
  candidate_event: "NONE", event_code: null, confidence: null,
  safety: { contains_real_pii: false, out_of_scope: false }, ...overrides,
});
export const envelope = (output: unknown = answer()) => ({
  id: "resp_synthetic", status: "completed", model: "test-model", usage: { output_tokens: 1 },
  output: [{ type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: JSON.stringify(output) }] }],
});
export const refusal = () => ({ status: "completed", output: [{ type: "message", role: "assistant", status: "completed",
  content: [{ type: "refusal", refusal: "RAW_REFUSAL_MUST_NOT_ESCAPE" }] }] });
export const context = (): ScenarioAIContext => ({
  scenario: { templateId: "test-template", templateVersion: 2, category: "SMS_PHISHING", variant: "DEFAULT", title: "สถานการณ์สมมติ" },
  currentState: "contact", characterRole: "ตัวละครสมมติ",
  allowedBehaviors: ["แสดงข้อความสมมติ"], forbiddenBehaviors: ["ห้ามขอข้อมูลจริง"],
  recentSanitizedMessages: [{ id: "old-user", role: "user", state: "contact", text: "ข้อความก่อนหน้า" }],
  currentUserMessage: { id: "current-user", role: "user", state: "contact", text: "ขอรายละเอียดเพิ่มเติม" },
});
export function fakeClient() { return { create: vi.fn<ResponsesClient["create"]>().mockResolvedValue(envelope()) }; }
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
