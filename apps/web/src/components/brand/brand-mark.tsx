import { PanelsTopLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("inline-flex min-w-0 items-center gap-2.5", className)} aria-label="I HERE">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
        <PanelsTopLeft className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
      </span>
      {!compact && (
        <span className="truncate font-heading text-base font-semibold tracking-[0.16em] text-foreground">
          I HERE
        </span>
      )}
    </div>
  );
}
