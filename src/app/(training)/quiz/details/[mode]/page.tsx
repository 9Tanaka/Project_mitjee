import { notFound } from "next/navigation.js";
import { QuizDetail } from "../../../../../frontend/quiz-detail.js";
export const metadata = { title: "รายละเอียดแบบทดสอบ" };
export default async function Page({ params }: { params: Promise<{ mode: string }> }) {
  const { mode } = await params;
  if (mode !== "pre" && mode !== "post") notFound();
  return <QuizDetail key={mode} mode={mode === "pre" ? "PRE_TEST" : "POST_TEST"} />;
}
