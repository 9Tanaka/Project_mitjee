import { copy } from "../domain/copy.js";
import type { ScenarioState } from "../domain/types.js";
import { ProviderRefusal } from "./contracts.js";
import type { AICharacterResponse, ProviderOptions, ScenarioAIContext, ScenarioModelProvider } from "./contracts.js";

export type MockBehavior =
  | { kind: "normal" }
  | { kind: "refusal" }
  | { kind: "error" }
  | { kind: "timeout" }
  | { kind: "invalid"; output: unknown }
  | { kind: "response"; response: AICharacterResponse };

const lines: Record<ScenarioState, readonly [string, string]> = {
  contact: ["สวัสดี มี SMS เกี่ยวกับพัสดุสมมติส่งถึงคุณ", "คุณสามารถพิจารณาผู้ส่งก่อนตัดสินใจในแบบฝึกนี้"],
  build_trust: ["ข้อความจำลองแสดงชื่อบริการพัสดุและลิงก์ parcel-check.example", "หลักฐานในข้อความยังคงเดิม กรุณาพิจารณาสิ่งที่คุณเห็นว่าน่าสงสัย"],
  create_pressure: ["มีข้อความจำลองเพิ่มเติมอ้างว่าต้องดำเนินการภายในห้านาที", "นี่เป็นแรงกดดันที่เกิดขึ้นภายในสถานการณ์สมมติเท่านั้น"],
  request_action: ["ข้อความกำลังนำคุณไปยังขั้นตอนยืนยันข้อมูลจำลอง ห้ามกรอกข้อมูลจริง", "คุณสามารถถามต่อได้ การส่งข้อความยังไม่ใช่การยืนยันการกระทำจำลอง"],
  user_verification: ["กรุณาพิจารณาวิธีตรวจสอบและยุติการติดต่อในแบบฝึก", "บทสนทนายังอยู่ในขั้นตอนเดิมจนกว่าคุณจะทำการตัดสินใจที่ระบบกำหนด"],
  end_scenario: ["สิ้นสุดสถานการณ์จำลองแล้ว", "ผลประเมินมาจากระบบอิงกฎ ไม่ใช่ตัวละคร"],
};

export function normalMockResponse(context: ScenarioAIContext): AICharacterResponse {
  const turnsHere = context.recentSanitizedMessages.filter(m => m.role === "character" && m.state === context.currentState).length;
  const line = context.scenario.category === "SMS_PHISHING" ? lines[context.currentState][turnsHere % 2]!
    : context.allowedBehaviors[turnsHere % Math.max(context.allowedBehaviors.length, 1)] ?? `ข้อความจำลองของ ${context.scenario.title}`;
  return {
    character_message: `${line}\nรับข้อความของคุณแล้ว: ${context.currentUserMessage.text.slice(0, 160)}`,
    observed_intent: "continue", candidate_event: "NONE", event_code: null, confidence: null,
    safety: { contains_real_pii: false, out_of_scope: false },
  };
}

/** No Core import, callback, network client, repository or scoring access. */
export class MockScenarioModelProvider implements ScenarioModelProvider {
  readonly #behaviors: readonly MockBehavior[];
  #calls = 0;

  constructor(behaviors: readonly MockBehavior[] = [{ kind: "normal" }]) {
    if (behaviors.length === 0) throw new Error("Mock behavior sequence cannot be empty");
    this.#behaviors = copy(behaviors);
  }

  get callCount(): number { return this.#calls; }

  async generateCharacterResponse(context: ScenarioAIContext, options?: ProviderOptions): Promise<AICharacterResponse> {
    options?.signal?.throwIfAborted();
    const behavior = this.#behaviors[Math.min(this.#calls++, this.#behaviors.length - 1)]!;
    switch (behavior.kind) {
      case "refusal": throw new ProviderRefusal("Simulated provider refusal");
      case "error": throw new Error("Simulated provider error");
      case "timeout": return new Promise<AICharacterResponse>((_, reject) => {
        options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
      });
      // Deliberate fault injection: the orchestrator must validate the runtime boundary.
      case "invalid": return copy(behavior.output) as AICharacterResponse;
      case "response": return copy(behavior.response);
      case "normal": return normalMockResponse(context);
    }
  }
}
