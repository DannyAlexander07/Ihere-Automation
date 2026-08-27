import type { Metadata } from "next";
import { NoteEditorWorkspace } from "@/features/notes/note-editor-workspace";

export const metadata: Metadata = { title: "Editor de nota" };

export default async function NoteEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const origin = from === "approval" ? from : undefined;
  return <NoteEditorWorkspace noteId={id} origin={origin} />;
}
