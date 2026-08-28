"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleX,
  Clock3,
  LoaderCircle,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, ApiError } from "@/lib/api/api-client";

export type PublicTitleReview = {
  client: { name: string; slug: string };
  proposalId: string;
  version: number;
  expiresAt: string;
  recipientName: string;
  recipientEmailHint: string | null;
  content: {
    service: string;
    title: string;
    objective: string;
    audience: string;
    searchIntent: string;
    focus: string;
    opportunity: string | null;
    risk: string | null;
  };
};

type Decision = "APPROVE" | "REQUEST_CHANGES" | "REJECT";

const options: Array<{
  value: Decision;
  label: string;
  description: string;
  icon: typeof CheckCircle2;
}> = [
  {
    value: "APPROVE",
    label: "Aprobar título",
    description: "El equipo podrá comenzar la redacción de la nota.",
    icon: CheckCircle2,
  },
  {
    value: "REQUEST_CHANGES",
    label: "Solicitar cambios",
    description: "Explica el ajuste esperado para recibir una nueva versión.",
    icon: MessageSquareText,
  },
  {
    value: "REJECT",
    label: "Rechazar",
    description: "El título quedará descartado con el motivo registrado.",
    icon: CircleX,
  },
];

export function TitleReviewPortal({
  token,
  initialData,
  unavailable,
}: {
  token: string;
  initialData: PublicTitleReview | null;
  unavailable: boolean;
}) {
  const [decision, setDecision] = useState<Decision>("APPROVE");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Decision | null>(null);

  if (unavailable || !initialData) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 p-5">
        <Card className="w-full max-w-lg text-center shadow-soft">
          <CardContent className="p-8">
            <AlertTriangle className="mx-auto size-9 text-amber-600" />
            <h1 className="mt-4 text-xl font-semibold">Enlace no disponible</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              El enlace venció, ya fue respondido o corresponde a una versión
              anterior. Solicita una invitación nueva al equipo de Mood.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const submit = async () => {
    if (!reviewerEmail.includes("@") || reason.trim().length < 5) {
      setError("Completa el correo corporativo y una observación clara.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiRequest("public/title-reviews/current/decision", {
        method: "POST",
        headers: { "x-review-token": token },
        body: JSON.stringify({
          type: decision,
          reviewerEmail: reviewerEmail.trim(),
          reason: reason.trim(),
        }),
      });
      setCompleted(decision);
      window.sessionStorage.removeItem("ihere:title-review-token");
    } catch (cause) {
      setError(
        cause instanceof ApiError || cause instanceof Error
          ? cause.message
          : "No pudimos registrar la decisión.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (completed) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 p-5">
        <Card className="w-full max-w-lg text-center shadow-soft">
          <CardContent className="p-8">
            <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
            <h1 className="mt-4 text-xl font-semibold">Decisión registrada</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {completed === "APPROVE"
                ? "El título quedó aprobado y el equipo ya puede iniciar la nota."
                : "Tu observación quedó registrada para preparar una nueva versión."}
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const content = initialData.content;
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex flex-col justify-between gap-3 rounded-2xl border bg-card p-5 shadow-card sm:flex-row sm:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{initialData.client.name}</Badge>
              <Badge variant="outline">Título · v{initialData.version}</Badge>
            </div>
            <h1 className="mt-3 text-2xl font-semibold">
              Revisión de propuesta editorial
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Hola, {initialData.recipientName}. Revisa el título y deja una
              decisión por esta versión.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock3 className="size-4" /> Vence{" "}
            {new Date(initialData.expiresAt).toLocaleDateString("es-PE")}
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle
                role="heading"
                aria-level={2}
                className="text-xl leading-7"
              >
                {content.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {[
                ["Objetivo", content.objective],
                ["Público", content.audience],
                ["Intención de búsqueda", content.searchIntent],
                ["Enfoque", content.focus],
                ["Servicio de Adecco", content.service],
                ["Oportunidad", content.opportunity],
                ["Riesgo a evitar", content.risk],
              ].map(([label, value]) => (
                <section key={label} className="rounded-xl border p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-2 text-sm leading-6">
                    {value || "Sin observación adicional."}
                  </p>
                </section>
              ))}
            </CardContent>
          </Card>

          <Card className="h-fit shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4 text-primary" /> Tu decisión
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {options.map(({ value, label, description, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDecision(value)}
                    className={`w-full rounded-xl border p-3 text-left transition ${decision === value ? "border-primary bg-secondary/45 ring-1 ring-primary/20" : "hover:bg-muted/50"}`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <Icon className="size-4" />
                      {label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {description}
                    </span>
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="title-review-email">Correo corporativo</Label>
                <Input
                  id="title-review-email"
                  type="email"
                  value={reviewerEmail}
                  onChange={(event) => setReviewerEmail(event.target.value)}
                  placeholder={
                    initialData.recipientEmailHint || "nombre@empresa.com"
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="title-review-reason">Observación</Label>
                <Textarea
                  id="title-review-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={
                    decision === "APPROVE"
                      ? "Confirma por qué el título está conforme."
                      : "Indica exactamente qué debe ajustarse."
                  }
                  className="min-h-28"
                />
              </div>
              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>No se pudo registrar</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Button
                className="w-full"
                onClick={() => void submit()}
                disabled={
                  busy ||
                  !reviewerEmail.includes("@") ||
                  reason.trim().length < 5
                }
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <CheckCircle2 />
                )}
                Registrar decisión
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
