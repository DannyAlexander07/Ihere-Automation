import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  detail,
  trend,
  icon: Icon,
  tone = "violet",
}: {
  label: string;
  value: string;
  detail: string;
  trend?: "up" | "down";
  icon: LucideIcon;
  tone?: "violet" | "pink" | "blue" | "green";
}) {
  const tones = {
    violet: "bg-secondary text-primary",
    pink: "bg-accent text-accent-foreground",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
  };

  return (
    <Card className="border-border/80 bg-card/95 shadow-card">
      <CardContent className="flex min-h-28 items-start justify-between gap-2 p-3 sm:gap-4 sm:p-4 min-[1920px]:p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1.5 font-heading text-2xl font-extrabold tracking-tight min-[1920px]:text-3xl">{value}</p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            {trend === "up" && <ArrowUpRight className="size-3 text-emerald-600" />}
            {trend === "down" && <ArrowDownRight className="size-3 text-amber-600" />}
            {detail}
          </p>
        </div>
        <div className={cn("grid size-9 shrink-0 place-items-center rounded-xl sm:size-10", tones[tone])}>
          <Icon className="size-4.5 sm:size-5" />
        </div>
      </CardContent>
    </Card>
  );
}
