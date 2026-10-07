import { QuizRound } from "../../../../frontend/quiz.js";
export default async function QuizRoundPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return <QuizRound key={attemptId} attemptId={attemptId} />;
}
