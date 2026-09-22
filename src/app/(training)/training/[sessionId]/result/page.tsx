import { Result } from "../../../../../frontend/result.js";
export const metadata = { title: "ผลการฝึก" };
export default async function ResultPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <Result key={sessionId} sessionId={sessionId} />;
}
