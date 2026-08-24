"use client";

import { useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Eye, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TitlePackageGroup } from "./title-packages";
import type { TitleCandidate } from "./types";

type Props = {
  group: TitlePackageGroup | null;
  onClose: () => void;
  onEdit: (candidate: TitleCandidate) => void;
};

export function TitlePackagePreviewDialog({ group, onClose, onEdit }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!group) return null;
  const active = group.candidates[activeIndex];
  if (!active) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader className="pr-8">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary">
            <Eye className="size-4" /> Vista previa interna
          </div>
          <DialogTitle className="text-xl sm:text-2xl">{group.topic}</DialogTitle>
          <DialogDescription>
            Revisa las {group.candidates.length} propuestas antes de compartir el paquete. Puedes abrir cualquiera para corregir sus datos.
          </DialogDescription>
        </DialogHeader>

        <nav className="flex gap-2 overflow-x-auto border-y py-3" aria-label="Propuestas del paquete">
          {group.candidates.map((candidate, index) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                index === activeIndex
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-secondary"
              }`}
            >
              Título {index + 1}
              {candidate.status === "approved" ? <CheckCircle2 className="ml-1 inline size-3.5" /> : null}
            </button>
          ))}
        </nav>

        <article className="space-y-4 rounded-2xl border bg-background p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Título {activeIndex + 1} de {group.candidates.length}</Badge>
            <Badge variant="secondary">{active.intent}</Badge>
            <Badge variant="outline">Duplicidad {active.duplicate.score}%</Badge>
          </div>
          <h2 className="text-xl font-bold leading-tight sm:text-2xl">{active.title}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <PreviewField label="Objetivo" value={active.objective} />
            <PreviewField label="Público" value={active.audience} />
            <PreviewField label="Enfoque diferencial" value={active.focus} />
            <PreviewField label="Oportunidad" value={active.opportunity} />
            <PreviewField label="Riesgo a evitar" value={active.risk} className="md:col-span-2" />
          </div>
          {active.tags.length ? (
            <div className="flex flex-wrap gap-2">
              {active.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}
            </div>
          ) : null}
        </article>

        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setActiveIndex((value) => Math.max(0, value - 1))} disabled={activeIndex === 0}>
              <ChevronLeft /> Anterior
            </Button>
            <Button variant="outline" size="sm" onClick={() => setActiveIndex((value) => Math.min(group.candidates.length - 1, value + 1))} disabled={activeIndex === group.candidates.length - 1}>
              Siguiente <ChevronRight />
            </Button>
          </div>
          <Button onClick={() => onEdit(active)}><Pencil />Editar esta propuesta</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewField({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <section className={`rounded-xl border bg-card p-3.5 ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-sm leading-6">{value || "Pendiente de completar"}</p>
    </section>
  );
}
