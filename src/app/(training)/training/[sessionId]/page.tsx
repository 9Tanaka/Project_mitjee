import { Training } from "../../../../frontend/training.js";
export const metadata = { title: "ฝึกสถานการณ์จำลอง" };
export default async function TrainingPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <Training key={sessionId} sessionId={sessionId} />;
}
