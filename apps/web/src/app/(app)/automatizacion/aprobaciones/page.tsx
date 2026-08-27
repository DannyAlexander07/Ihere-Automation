import type { Metadata } from "next";
import { ReviewQueueWorkspace } from "@/features/notes/review-queue-workspace";

export const metadata: Metadata = { title: "Aprobaciones" };

export default function ApprovalsPage() {
  return <ReviewQueueWorkspace />;
}
