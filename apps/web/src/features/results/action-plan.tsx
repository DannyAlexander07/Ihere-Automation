import { CalendarClock, CheckCircle2, ClipboardList, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsActionPlanItem } from "./types";

const statusPresentation: Record<
  AnalyticsActionPlanItem["status"],
  { label: string; className: string }
> = {
  PENDING: {
    label: "Pendiente",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  IN_PROGRESS: {
    label: "En progreso",
    className: "border-sky-200 bg-sky-50 text-sky-800",
  },
  VALIDATED: {
    label: "Validada",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  DISMISSED: {
    label: "Descartada",
    className: "border-slate-200 bg-slate-50 text-slate-700",
  },
};

export function ActionPlan({
  items,
  clientName,
}: {
  items: AnalyticsActionPlanItem[];
  clientName: string;
}) {
  return (
    <Card className="rounded-2xl border-primary/20 shadow-card">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle
            role="heading"
            aria-level={2}
            className="flex items-center gap-2"
          >
            <ClipboardList className="size-5 text-primary" />
            Plan de acción
          </CardTitle>
          <Badge variant="outline">Antes de los indicadores</Badge>
        </div>
        <p className="max-w-4xl text-sm text-muted-foreground">
          Próximos pasos separados por responsable, dependencia, fecha objetivo
          y evidencia de validación.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length ? (
          items.map((item, index) => {
            const status = statusPresentation[item.status];
            return (
              <article
                key={item.id}
                className="rounded-xl border bg-background p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                      Frente {index + 1}
                    </p>
                    <h3 className="mt-1 text-base font-semibold">
                      {item.front}
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Prioridad {item.priority}</Badge>
                    <Badge variant="outline" className={status.className}>
                      {status.label}
                    </Badge>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <Responsibility
                    owner={item.moodOwner}
                    action={item.moodAction}
                  />
                  <Responsibility
                    owner={item.clientOwner.replace(
                      "del cliente",
                      `de ${clientName}`,
                    )}
                    action={item.clientAction}
                  />
                </div>

                <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                  <Detail
                    term="Fecha objetivo"
                    value={formatDate(item.dueDate)}
                    icon={<CalendarClock className="size-4" />}
                  />
                  <Detail term="Dependencia" value={item.dependency} />
                  <Detail term="Evidencia" value={item.evidence} />
                  <Detail
                    term="Validación"
                    value={item.validation}
                    icon={<CheckCircle2 className="size-4" />}
                  />
                </dl>
              </article>
            );
          })
        ) : (
          <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            No hay acciones pendientes sustentadas por los datos del periodo
            seleccionado.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Responsibility({ owner, action }: { owner: string; action: string }) {
  return (
    <div className="rounded-xl bg-muted/45 p-3">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <UsersRound className="size-4" />
        {owner}
      </p>
      <p className="mt-2 text-sm leading-6">{action}</p>
    </div>
  );
}

function Detail({
  term,
  value,
  icon,
}: {
  term: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/70 p-3">
      <dt className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        {icon}
        {term}
      </dt>
      <dd className="mt-1 break-words text-sm leading-5">{value}</dd>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}
