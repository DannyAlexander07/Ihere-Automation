import type { Metadata } from "next";
import { NoteEditorWorkspace } from "@/features/notes/note-editor-workspace";

export const metadata: Metadata = { title: "Editor de nota" };

export default async function NoteEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <NoteEditorWorkspace noteId={id} />;
}
