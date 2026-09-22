import { ScenarioList } from "../../../frontend/scenarios.js";
import { PageIntro } from "../../../frontend/ui.js";
export const metadata = { title: "สถานการณ์ฝึก" };
export default function ScenariosPage() {
  return <><PageIntro eyebrow="YOUR PRACTICE SPACE" title="วันนี้ ลองฝึกรับมือเรื่องไหนดี?">เริ่มจากสถานการณ์ใกล้ตัว ลองตัดสินใจ และเรียนรู้จากผลการฝึกของคุณ</PageIntro><ScenarioList /></>;
}
