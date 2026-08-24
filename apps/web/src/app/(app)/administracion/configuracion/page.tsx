import type { Metadata } from "next";
import { AdminConfigurationWorkspace } from "@/features/admin/admin-configuration-workspace";

export const metadata: Metadata = { title: "Configuración | I HERE" };

export default function AdminConfigurationPage() {
  return <AdminConfigurationWorkspace />;
}
