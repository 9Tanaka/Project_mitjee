import { copy } from "../domain/repository.js";
import type { ScenarioTemplate } from "../domain/schema.js";
import { smsPhishingFixture } from "./sms-phishing.js";

// Preserve version 1; dialogue configuration is a newly published version.
export const smsPhishingDialogueFixture: ScenarioTemplate = {
  ...copy(smsPhishingFixture),
  version: 2,
  characterRole: "ผู้ส่ง SMS ของบริการพัสดุสมมติในแบบฝึกรับมือ Phishing ใช้ข้อมูลจำลองเท่านั้น",
};
