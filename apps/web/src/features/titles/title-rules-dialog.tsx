import { AlertTriangle, BookOpenCheck, GitCompareArrows, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const rules = [
  { icon: BookOpenCheck, title: "Contexto obligatorio", detail: "Toda propuesta debe indicar objetivo, público, intención, enfoque, oportunidad y riesgo." },
  { icon: GitCompareArrows, title: "Duplicidad antes de aprobar", detail: "Se comparan título, intención y similitud semántica. Una coincidencia alta requiere una decisión humana." },
  { icon: ShieldCheck, title: "Aprobación humana", detail: "La evaluación especializada recomienda; únicamente una persona autorizada aprueba, rechaza o solicita cambios." },
];

export function TitleRulesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">Reglas editoriales de Adecco</DialogTitle>
          <DialogDescription>Resumen operativo aplicado a Propuestas de títulos según la documentación del proyecto.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2 sm:grid-cols-3">
          {rules.map((rule) => {
            const Icon = rule.icon;
            return (
              <article key={rule.title} className="rounded-xl border p-4">
                <span className="grid size-9 place-items-center rounded-xl bg-secondary text-primary"><Icon className="size-4.5" /></span>
                <h2 className="mt-3 text-sm font-bold">{rule.title}</h2>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{rule.detail}</p>
              </article>
            );
          })}
        </div>
        <div className="rounded-xl border bg-muted/40 p-4">
          <p className="text-xs font-bold">Flujo de estados</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {[
              "Propuesto",
              "En evaluación",
              "Requiere cambios",
              "Aprobado o rechazado",
              "Utilizado",
            ].map((state, index) => (
              <span key={state} className="inline-flex items-center gap-2"><Badge variant="outline" className="bg-card">{state}</Badge>{index < 4 && <span className="text-muted-foreground">→</span>}</span>
            ))}
          </div>
        </div>
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          <AlertTriangle />
          <AlertTitle>Bloqueos que impiden aprobar</AlertTitle>
          <AlertDescription>Duplicidad alta sin resolver, bloqueo especializado activo o información todavía pendiente de confirmación.</AlertDescription>
        </Alert>
      </DialogContent>
    </Dialog>
  );
}
