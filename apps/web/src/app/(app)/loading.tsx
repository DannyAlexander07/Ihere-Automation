import { ActivityOrb } from "@/components/brand/activity-orb";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProductLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Cargando espacio de trabajo">
      <div className="flex items-center justify-between rounded-2xl border bg-card p-5">
        <div className="space-y-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-8 w-72 max-w-[70vw]" /></div>
        <ActivityOrb showLabel={false} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
