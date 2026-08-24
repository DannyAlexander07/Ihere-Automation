import { ArrowRight, CircleCheck, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function WorkflowBoard({
  workflow,
  generatedAt,
}: {
  workflow: { titles: number; drafting: number; quality: number; review: number; active: number };
  generatedAt: string;
}) {
  const steps = [
    { label: "Títulos por revisar", value: workflow.titles, meta: "Propuestos o en evaluación", color: "bg-violet-500" },
    { label: "En redacción", value: workflow.drafting, meta: "Borradores y generaciones", color: "bg-blue-500" },
    { label: "Control de calidad", value: workflow.quality, meta: "QA o cambios solicitados", color: "bg-amber-500" },
    { label: "Aprobación humana", value: workflow.review, meta: "Listas para decisión", color: "bg-pink-500" },
  ];
  return (
    <Card className="border-border/80 bg-card/95 shadow-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div>
          <CardTitle className="text-base">Flujo editorial actual</CardTitle>
          <CardDescription className="mt-1">Conteos calculados desde los expedientes que puedes consultar.</CardDescription>
        </div>
        <Badge variant="outline" className="bg-card">Actualizado {formatTime(generatedAt)}</Badge>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((step, index) => (
            <div key={step.label} className="relative rounded-xl border bg-background/55 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className={`size-2.5 rounded-full ${step.color}`} />
                <span className="text-[10px] font-semibold text-muted-foreground">PASO {index + 1}</span>
              </div>
              <p className="mt-3 text-sm font-semibold">{step.label}</p>
              <div className="mt-1 flex items-end justify-between">
                <span className="font-heading text-2xl font-extrabold">{step.value}</span>
                {index < steps.length - 1 ? <ArrowRight className="size-4 text-muted-foreground" /> : <CircleCheck className="size-4 text-emerald-600" />}
              </div>
              <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground"><Clock3 className="size-3" />{step.meta}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/60 px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-secondary-foreground">{workflow.active} piezas activas</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">La decisión final siempre queda registrada a nombre de una persona.</p>
          </div>
          <Badge variant="outline" className="border-primary/20 bg-card text-primary">Trazabilidad activa</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
