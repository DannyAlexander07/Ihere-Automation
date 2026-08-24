import type { Metadata } from "next";
import { TitleWorkspace } from "@/features/titles/title-workspace";

export const metadata: Metadata = { title: "Propuestas de títulos" };

export default function TitlesPage() {
  return <TitleWorkspace />;
}
