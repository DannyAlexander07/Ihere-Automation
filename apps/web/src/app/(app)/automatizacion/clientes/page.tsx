import type { Metadata } from "next";
import { ClientCrmWorkspace } from "@/features/clients/client-crm-workspace";

export const metadata: Metadata = { title: "Clientes editoriales" };

export default function ClientsPage() {
  return <ClientCrmWorkspace />;
}
