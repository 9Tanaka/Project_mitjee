import { ScenarioStart } from "../../../../../frontend/scenarios.js";
export const metadata = { title: "คำเตือนก่อนเริ่มฝึก" };
export default async function Page({ params }: { params: Promise<{ scenarioId: string }> }) {
  const { scenarioId } = await params;
  return <ScenarioStart key={scenarioId} scenarioId={scenarioId} />;
}
