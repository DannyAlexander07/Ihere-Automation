import type { Metadata } from "next";
import { ReviewPortalLoader } from "@/features/client-review/review-portal-loader";

export const metadata: Metadata = {
  title: "Revisión de contenido",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function ReviewPage() {
  return <ReviewPortalLoader />;
}
