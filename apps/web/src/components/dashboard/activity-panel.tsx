import { CheckCircle2, FileCheck2, MessageSquareText, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Activity = {
  id: string;
  action: string;
  actorName: string;
  clientName: string | null;
  createdAt: string;
};

export function ActivityPanel({ activity }: { activity: Activity[] }) {
  return (
    <Card className="h-full border-border/80 bg-card/95 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Actividad reciente</CardTitle>
        <CardDescription>Decisiones y cambios con responsable visible.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {activity.length ? activity.map((entry) => {
          const presentation = activityPresentation(entry.action);
          const Icon = presentation.icon;
          return (
            <div key={entry.id} className="flex gap-3 rounded-xl px-2 py-3 hover:bg-muted/60">
              <Avatar size="sm" className="mt-0.5 size-8">
                <AvatarFallback className={presentation.color}>{initials(entry.actorName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="flex items-start gap-1.5 text-xs font-semibold leading-5">
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  {entry.actorName} {presentation.label}
                </p>
                <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                  {[entry.clientName, formatDate(entry.createdAt)].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
          );
        }) : (
          <div className="grid min-h-40 place-items-center rounded-xl border border-dashed p-5 text-center">
            <div><CheckCircle2 className="mx-auto size-5 text-emerald-600" /><p className="mt-2 text-xs font-semibold">Sin actividad editorial reciente</p><p className="mt-1 text-[10px] text-muted-foreground">Las próximas decisiones aparecerán aquí.</p></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function activityPresentation(action: string) {
  if (action.includes("approve")) return { icon: CheckCircle2, label: "registró una aprobación", color: "bg-emerald-50 text-emerald-700" };
  if (action.includes("request_changes") || action.includes("updated") || action.includes("version")) return { icon: MessageSquareText, label: "registró un cambio", color: "bg-accent text-accent-foreground" };
  if (action.includes("evaluation")) return { icon: Sparkles, label: "envió una evaluación", color: "bg-blue-50 text-blue-700" };
  if (action.includes("note")) return { icon: FileCheck2, label: "creó un expediente de nota", color: "bg-secondary text-primary" };
  return { icon: FileCheck2, label: "actualizó el flujo editorial", color: "bg-secondary text-primary" };
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("es")).join("") || "IH";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
