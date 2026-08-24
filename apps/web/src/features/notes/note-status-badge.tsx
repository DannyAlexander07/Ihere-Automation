import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { noteStatusLabels, type NoteStatus } from "./types";

const tones: Record<NoteStatus, string> = {
  DRAFT: "border-slate-200 bg-slate-50 text-slate-700",
  GENERATING: "border-blue-200 bg-blue-50 text-blue-700",
  QA_QUEUED: "border-violet-200 bg-violet-50 text-violet-700",
  QA_RUNNING: "border-violet-200 bg-violet-50 text-violet-700",
  CHANGES_REQUESTED: "border-amber-200 bg-amber-50 text-amber-800",
  READY_FOR_REVIEW: "border-cyan-200 bg-cyan-50 text-cyan-800",
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
  EXPORTED: "border-sky-200 bg-sky-50 text-sky-700",
  ARCHIVED: "border-slate-200 bg-slate-50 text-slate-500",
};

export function NoteStatusBadge({ status }: { status: NoteStatus }) {
  return <Badge variant="outline" className={cn("whitespace-nowrap", tones[status])}>{noteStatusLabels[status]}</Badge>;
}
