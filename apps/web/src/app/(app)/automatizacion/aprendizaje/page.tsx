import type { Metadata } from "next";
import { LearningWorkspace } from "@/features/learning/learning-workspace";

export const metadata: Metadata = { title: "Aprendizaje editorial" };

export default function LearningPage() {
  return <LearningWorkspace />;
}
