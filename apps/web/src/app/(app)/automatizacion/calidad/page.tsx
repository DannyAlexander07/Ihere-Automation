import type { Metadata } from "next";
import { ReviewQueueWorkspace } from "@/features/notes/review-queue-workspace";

export const metadata: Metadata = { title: "Control de calidad" };

export default function QualityPage() {
  return <ReviewQueueWorkspace mode="quality" />;
}
