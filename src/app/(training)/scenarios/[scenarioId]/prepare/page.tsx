import { ScenarioStart } from "../../../../../frontend/scenarios.js";
import { permanentRedirect } from "next/navigation.js";
export const metadata = { title: "คำเตือนก่อนเริ่มฝึก" };
export default async function Page({ params }: { params: Promise<{ scenarioId: string }> }) {
  const { scenarioId } = await params;
  if (scenarioId === "call-center-scam") permanentRedirect("/scenarios/call-center/prepare");
  return <ScenarioStart key={scenarioId} scenarioId={scenarioId} />;
}
