import type { Metadata } from "next";
import { DashboardOverview } from "@/features/dashboard/dashboard-overview";

export const metadata: Metadata = { title: "Inicio" };

export default function DashboardPage() {
  return <DashboardOverview />;
}
