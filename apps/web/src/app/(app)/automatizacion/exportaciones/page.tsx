import type { Metadata } from "next";
import { ExportsWorkspace } from "@/features/notes/exports-workspace";

export const metadata: Metadata = { title: "Exportaciones" };

export default function ExportsPage() {
  return <ExportsWorkspace />;
}
