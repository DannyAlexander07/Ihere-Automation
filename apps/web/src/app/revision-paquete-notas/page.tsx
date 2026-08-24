import type { Metadata } from "next";
import { NotePackageReviewPortalLoader } from "@/features/client-review/note-package-review-portal-loader";

export const metadata: Metadata = {
  title: "Revisión de paquete de notas",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function NotePackageReviewPage() {
  return <NotePackageReviewPortalLoader />;
}
