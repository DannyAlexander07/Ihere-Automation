import type { Metadata } from "next";
import { ResultsPortalLoader } from "@/features/results/results-portal-loader";

export const metadata: Metadata = {
  title: "Portal de resultados",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function ResultsPage() {
  return <ResultsPortalLoader />;
}
