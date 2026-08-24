import type { Metadata } from "next";
import { ResultsDashboard } from "@/features/results/results-dashboard";

export const metadata: Metadata = { title: "Resumen ejecutivo" };

export default function ExecutiveSummaryPage() {
  return <ResultsDashboard />;
}
