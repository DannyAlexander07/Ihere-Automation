import type { Metadata } from "next";
import { TitleReviewPortalLoader } from "@/features/client-review/title-review-portal-loader";

export const metadata: Metadata = {
  title: "Revisión de título",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function TitleReviewPage() {
  return <TitleReviewPortalLoader />;
}
