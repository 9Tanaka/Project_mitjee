import { ScenarioDetail } from "../../../../frontend/scenarios.js";
import { permanentRedirect } from "next/navigation.js";
export const metadata = { title: "รายละเอียดสถานการณ์" };
export default async function Page({ params }: { params: Promise<{ scenarioId: string }> }) {
  const { scenarioId } = await params;
  if (scenarioId === "call-center-scam") permanentRedirect("/scenarios/call-center");
  return <ScenarioDetail key={scenarioId} scenarioId={scenarioId} />;
}
