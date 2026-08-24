import { CircleAlert, CircleCheck, FileSearch, RotateCw } from "lucide-react";
import { ActivityOrb } from "@/components/brand/activity-orb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function StateShowcase() {
  return (
    <Card className="border-border/80 bg-card/95 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Estados del sistema</CardTitle>
        <CardDescription>Respuestas claras para cada momento del proceso.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex min-h-24 items-center rounded-xl border border-primary/15 bg-secondary/50 p-3">
          <ActivityOrb state="composing" />
        </div>
        <div className="flex min-h-24 items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <div><p className="text-xs font-semibold">Revisión requerida</p><p className="mt-1 text-[10px] leading-4">Falta confirmar una fuente normativa.</p></div>
        </div>
        <div className="flex min-h-24 items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-950">
          <CircleCheck className="mt-0.5 size-4 shrink-0" />
          <div><p className="text-xs font-semibold">Entrega completada</p><p className="mt-1 text-[10px] leading-4">Los archivos quedaron listos para descargar.</p></div>
        </div>
        <div className="flex min-h-24 items-center justify-between gap-2 rounded-xl border bg-background/60 p-3">
          <div className="flex gap-2"><FileSearch className="size-4 text-muted-foreground" /><div><p className="text-xs font-semibold">Sin pendientes</p><p className="mt-1 text-[10px] text-muted-foreground">Todo está al día.</p></div></div>
          <Button variant="ghost" size="icon-sm" aria-label="Actualizar"><RotateCw /></Button>
        </div>
      </CardContent>
    </Card>
  );
}
