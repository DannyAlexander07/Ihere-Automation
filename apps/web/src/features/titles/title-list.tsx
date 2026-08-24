"use client";

import { ArrowRight, CalendarDays, SearchX, UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DuplicateBadge, TitleStatusBadge } from "./title-status-badge";
import type { TitleCandidate } from "./types";

export function TitleList({ candidates, onSelect }: { candidates: TitleCandidate[]; onSelect: (candidate: TitleCandidate) => void }) {
  if (candidates.length === 0) {
    return (
      <Card className="border-dashed bg-card/70 shadow-none">
        <CardContent className="grid min-h-64 place-items-center p-8 text-center">
          <div>
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground"><SearchX /></div>
            <h2 className="mt-4 text-base font-bold">No encontramos propuestas</h2>
            <p className="mt-1 text-sm text-muted-foreground">Prueba con otros filtros o prepara nuevas alternativas.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border/80 bg-card/95 shadow-card">
      <div className="hidden grid-cols-[minmax(0,2fr)_120px_110px_72px_42px] gap-3 border-b bg-muted/45 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground lg:grid">
        <span>Propuesta</span><span>Estado</span><span>Duplicidad</span><span>Puntaje</span><span />
      </div>
      <div className="divide-y">
        {candidates.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => onSelect(candidate)}
            className="group grid w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-secondary/35 lg:grid-cols-[minmax(0,2fr)_120px_110px_72px_42px] lg:items-center"
          >
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2 lg:hidden">
                <TitleStatusBadge status={candidate.status} />
                <DuplicateBadge level={candidate.duplicate.level} score={candidate.duplicate.score} />
              </div>
              <p className="font-heading text-sm font-bold leading-5 text-foreground group-hover:text-primary sm:text-[15px]">{candidate.title}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><CalendarDays className="size-3" />{candidate.campaign}</span>
                <span className="inline-flex items-center gap-1"><UserRound className="size-3" />{candidate.owner}</span>
                <span>{candidate.intent}</span>
              </div>
            </div>
            <div className="hidden lg:block"><TitleStatusBadge status={candidate.status} /></div>
            <div className="hidden lg:block"><DuplicateBadge level={candidate.duplicate.level} score={candidate.duplicate.score} /></div>
            <div className="hidden lg:block">
              {candidate.evaluationStatus === "COMPLETED" || !candidate.persisted ? (
                <><span className="font-heading text-lg font-extrabold">{candidate.score}</span><span className="text-[10px] text-muted-foreground">/100</span></>
              ) : (
                <span className="text-[10px] font-semibold text-muted-foreground">Pendiente</span>
              )}
            </div>
            <div className="hidden justify-end lg:flex"><span className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors group-hover:bg-secondary group-hover:text-primary"><ArrowRight className="size-4" /></span></div>
          </button>
        ))}
      </div>
    </Card>
  );
}
