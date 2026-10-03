import { ScenarioDetail } from "../../../../frontend/scenarios.js";
export const metadata = { title: "รายละเอียดสถานการณ์" };
export default async function Page({ params }: { params: Promise<{ scenarioId: string }> }) {
  const { scenarioId } = await params;
  return <ScenarioDetail key={scenarioId} scenarioId={scenarioId} />;
}
