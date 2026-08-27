"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError } from "@/lib/api/api-client";
import { NoteStatusBadge } from "./note-status-badge";
import type { ApiNoteSummary } from "./types";

export function ReviewQueueWorkspace() {
  const { apiFetch } = useAuth();
  const [notes, setNotes] = useState<ApiNoteSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await apiFetch<ApiNoteSummary[]>("notes");
        if (!cancelled) setNotes(result);
      } catch (reason) {
        if (!cancelled) setError(messageFrom(reason));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  const visible = useMemo(() => {
    const allowed = new Set(["READY_FOR_REVIEW"]);
    const normalized = search.trim().toLocaleLowerCase("es");
    return notes.filter(
      (note) =>
        allowed.has(note.status) &&
        (!normalized ||
          [note.versions[0]?.title ?? "", note.client.name].some((value) =>
            value.toLocaleLowerCase("es").includes(normalized),
          )),
    );
  }, [notes, search]);

  const pendingLabel = `${visible.length} ${visible.length === 1 ? "pendiente" : "pendientes"}`;

  return (
    <div className="space-y-4">
      <section className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-4 shadow-card sm:flex-row sm:items-center">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-primary">
            <ShieldCheck className="size-3.5" />
            Automatización de notas
          </div>
          <h1 className="text-xl font-semibold sm:text-2xl">Aprobaciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Versiones que superaron QA y requieren una decisión humana.
          </p>
        </div>
        <Badge variant="outline" className="bg-card">
          {pendingLabel}
        </Badge>
      </section>
      {error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>No pudimos cargar la cola</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <section className="rounded-xl border bg-card p-3 shadow-card">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
            placeholder="Buscar por nota o cliente…"
            aria-label="Buscar en la cola"
          />
        </div>
      </section>
      {loading ? (
        <Card>
          <CardContent className="grid min-h-64 place-items-center">
            <LoaderCircle className="size-7 animate-spin text-primary" />
          </CardContent>
        </Card>
      ) : visible.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((note) => {
            const version = note.versions[0];
            const qa = note.qaEvaluations[0];
            const blockers = Array.isArray(qa?.criticalBlockers)
              ? qa.criticalBlockers.length
              : 0;
            const destination = `/automatizacion/notas/${note.id}?from=approval`;
            return (
              <Card key={note.id} className="shadow-card">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <NoteStatusBadge status={note.status} />
                    <Badge variant="outline">v{note.currentVersion}</Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {note.client.name}
                    </span>
                  </div>
                  <h2 className="mt-3 line-clamp-2 text-sm font-semibold">
                    {version?.title ?? "Nota sin título"}
                  </h2>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-muted/60 p-2">
                      <p className="text-lg font-semibold">
                        {qa?.overallScore ?? "—"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">QA</p>
                    </div>
                    <div className="rounded-lg bg-muted/60 p-2">
                      <p className="text-lg font-semibold">{blockers}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Bloqueos
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/60 p-2">
                      <p className="text-lg font-semibold">
                        {version?.wordCount ?? 0}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Palabras
                      </p>
                    </div>
                  </div>
                  <Progress className="mt-3" value={qa?.overallScore ?? 0} />
                  <Button asChild className="mt-4 w-full">
                    <Link href={destination}>
                      <CheckCircle2 />
                      Revisar y decidir
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="grid min-h-56 place-items-center p-6 text-center">
            <div>
              <CheckCircle2 className="mx-auto size-7 text-emerald-600" />
              <p className="mt-3 text-sm font-semibold">La cola está al día</p>
              <p className="mt-1 text-xs text-muted-foreground">
                No hay versiones pendientes con estos criterios.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function messageFrom(error: unknown) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado.";
}
