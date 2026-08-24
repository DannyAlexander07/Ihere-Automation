import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { duplicateTone, titleStatusLabels, titleStatusTone } from "./rules";
import type { DuplicateLevel, TitleStatus } from "./types";

export function TitleStatusBadge({ status }: { status: TitleStatus }) {
  return <Badge variant="outline" className={cn("whitespace-nowrap", titleStatusTone(status))}>{titleStatusLabels[status]}</Badge>;
}

export function DuplicateBadge({ level, score }: { level: DuplicateLevel; score: number }) {
  const label = level === "low" ? "Baja" : level === "medium" ? "Media" : "Alta";
  return <Badge variant="outline" className={cn("whitespace-nowrap", duplicateTone(level))}>{label} · {score}%</Badge>;
}
