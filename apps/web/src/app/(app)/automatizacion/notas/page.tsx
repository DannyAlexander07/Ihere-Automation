import type { Metadata } from "next";
import { NotesWorkspace } from "@/features/notes/notes-workspace";

export const metadata: Metadata = { title: "Notas" };

export default function NotesPage() {
  return <NotesWorkspace />;
}
