import type { Metadata } from "next";
import { TitlePackageReviewPortalLoader } from "@/features/client-review/title-package-review-portal-loader";

export const metadata: Metadata = {
  title: "Revisión de paquete de títulos",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function TitlePackageReviewPage() {
  return <TitlePackageReviewPortalLoader />;
}
