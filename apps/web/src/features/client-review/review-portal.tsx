"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  LoaderCircle,
  MessageSquareText,
  Send,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, ApiError } from "@/lib/api/api-client";
import type { NoteBlock } from "@/features/notes/types";

export type PublicReview = {
  client: { name: string; slug: string };
  noteId: string;
  version: number;
  expiresAt: string;
  recipientName: string | null;
  recipientEmailHint: string | null;
  content: {
    title: string;
    metaTitle: string | null;
    metaDescription: string | null;
    slug: string | null;
    excerpt: string | null;
    content: { schemaVersion: 1; blocks: NoteBlock[] };
    authorName: string | null;
    authorRole: string | null;
    ctaText: string | null;
    ctaUrl: string | null;
    internalLinks: string[];
    sources: Array<{
      type: string;
      title: string;
      entity: string;
      url: string;
      publishedAt: string | null;
      accessedAt: string;
    }>;
    image?: {
      concept: string;
      prompt: string;
      altText: string;
      caption: string | null;
      referenceUrl: string | null;
      status: string;
    } | null;
  };
};

type Decision = "APPROVE" | "REQUEST_CHANGES" | "REJECT";

const approvalReason = "Aprobado por el cliente.";

export function ReviewPortal({
  token,
  initialData,
  unavailable,
}: {
  token: string;
  initialData: PublicReview | null;
  unavailable: boolean;
}) {
  const decisionSectionRef = useRef<HTMLElement>(null);
  const pendingDecisionFocusRef = useRef(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Decision | null>(null);
  const [decisionVisible, setDecisionVisible] = useState(false);

  useEffect(() => {
    const section = decisionSectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setDecisionVisible(entry.isIntersecting),
      { threshold: 0.1 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [initialData]);

  useEffect(() => {
    if (!decisionVisible || !pendingDecisionFocusRef.current) return;
    pendingDecisionFocusRef.current = false;
    decisionSectionRef.current?.focus({ preventScroll: true });
  }, [decisionVisible]);

  const goToDecision = () => {
    const section = decisionSectionRef.current;
    if (!section) return;
    pendingDecisionFocusRef.current = true;
    section.scrollIntoView({
      behavior: "auto",
      block: "start",
    });
    section.focus({ preventScroll: true });
  };

  if (unavailable || !initialData) return <Unavailable />;
  const submit = async () => {
    if (!decision) {
      setError("Selecciona aprobar, solicitar cambios o rechazar la nota.");
      return;
    }
    if (
      !reviewerEmail.includes("@") ||
      (decision !== "APPROVE" && reason.trim().length < 5)
    ) {
      setError(
        "Completa el correo autorizado y, si solicitas cambios o rechazas, explica el motivo con al menos 5 caracteres.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiRequest("public/reviews/current/decision", {
        method: "POST",
        headers: { "x-review-token": token },
        body: JSON.stringify({
          type: decision,
          reviewerEmail: reviewerEmail.trim(),
          reason: decision === "APPROVE" ? approvalReason : reason.trim(),
        }),
      });
      setCompleted(decision);
    } catch (value) {
      setError(
        value instanceof ApiError || value instanceof Error
          ? value.message
          : "No pudimos registrar la decisión.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,var(--brand-pink-soft),transparent_35%),linear-gradient(180deg,#fff,#f7f9fc)] px-4 pb-24 pt-5 sm:px-6 lg:py-8 xl:pb-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white/90 px-4 py-3 shadow-card backdrop-blur sm:px-5">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
              I·H
            </span>
            <div>
              <p className="font-heading text-sm font-semibold tracking-[0.2em]">
                I HERE
              </p>
              <p className="text-[10px] text-muted-foreground">
                Portal seguro de revisión
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{initialData.client.name}</Badge>
            <Badge variant="secondary">Nota 1 de 1</Badge>
            <Badge variant="secondary">Versión {initialData.version}</Badge>
            <Badge
              variant="outline"
              className={
                decision === "APPROVE"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : decision === "REQUEST_CHANGES"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : decision === "REJECT"
                      ? "border-rose-200 bg-rose-50 text-rose-800"
                      : ""
              }
            >
              {decision === "APPROVE"
                ? "Aprobada"
                : decision === "REQUEST_CHANGES"
                  ? "Observada"
                  : decision === "REJECT"
                    ? "Rechazada"
                    : "Pendiente"}
            </Badge>
          </div>
        </header>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <article className="min-w-0 rounded-2xl border bg-white p-5 shadow-card sm:p-7 lg:p-9">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <FileCheck2 className="size-4 text-primary" />
              <span>Contenido preparado para revisión</span>
              <span>·</span>
              <Clock3 className="size-3.5" />
              <span>
                Disponible hasta{" "}
                {new Date(initialData.expiresAt).toLocaleDateString("es-PE")}
              </span>
            </div>
            <h1 className="mt-5 text-balance font-heading text-2xl font-semibold leading-tight sm:text-3xl lg:text-4xl">
              {initialData.content.title}
            </h1>
            {initialData.content.excerpt ? (
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                {initialData.content.excerpt}
              </p>
            ) : null}
            {initialData.content.authorName ? (
              <p className="mt-4 text-sm">
                <span className="font-semibold">
                  {initialData.content.authorName}
                </span>
                {initialData.content.authorRole ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {initialData.content.authorRole}
                  </span>
                ) : null}
              </p>
            ) : null}
            <section className="mt-6 grid gap-3 rounded-2xl border bg-muted/25 p-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Meta título
                </p>
                <p className="mt-1">
                  {initialData.content.metaTitle || "No definido"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Slug
                </p>
                <p className="mt-1 break-all">
                  {initialData.content.slug || "No definido"}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Meta descripción
                </p>
                <p className="mt-1 leading-6">
                  {initialData.content.metaDescription || "No definida"}
                </p>
              </div>
            </section>
            {initialData.content.image ? (
              <section className="mt-6 rounded-2xl border border-sky-200 bg-sky-50/60 p-5">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  Propuesta visual
                </h2>
                <p className="mt-3 text-sm font-medium">
                  {initialData.content.image.concept}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {initialData.content.image.prompt}
                </p>
                <p className="mt-3 rounded-xl bg-white/80 p-3 text-sm">
                  <strong>Texto alternativo:</strong>{" "}
                  {initialData.content.image.altText}
                </p>
                {cleanReviewUrl(initialData.content.image.referenceUrl ?? undefined) ? (
                  <a
                    href={cleanReviewUrl(initialData.content.image.referenceUrl ?? undefined)!}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  >
                    Abrir referencia visual <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
              </section>
            ) : null}
            <div className="mt-7 space-y-4">
              {initialData.content.content.blocks.map((block) => (
                <ContentBlock key={block.id} block={block} />
              ))}
            </div>
            {initialData.content.ctaText ? (
              <div className="mt-8 rounded-2xl border border-primary/15 bg-secondary/45 p-5">
                <p className="font-semibold">Siguiente paso</p>
                <p className="mt-1 text-sm leading-6">
                  {initialData.content.ctaText}
                </p>
                {initialData.content.ctaUrl ? (
                  <a
                    href={initialData.content.ctaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    Abrir destino del CTA <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
              </div>
            ) : null}
            {initialData.content.internalLinks.length ? (
              <section className="mt-6 rounded-2xl border p-4">
                <h2 className="text-sm font-semibold">Enlaces internos</h2>
                <ul className="mt-2 space-y-2 text-sm">
                  {initialData.content.internalLinks.map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all text-primary underline-offset-4 hover:underline"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section className="mt-8 border-t pt-6">
              <h2 className="text-base font-semibold">Fuentes consultadas</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {initialData.content.sources.map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group rounded-xl border p-3 text-sm hover:border-primary/30 hover:bg-secondary/30"
                  >
                    <span className="flex items-start justify-between gap-2 font-semibold">
                      <span>{source.title}</span>
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {source.entity}
                    </span>
                  </a>
                ))}
              </div>
            </section>
          </article>

          <aside
            ref={decisionSectionRef}
            id="review-decision"
            aria-label="Sección de decisión"
            tabIndex={-1}
            className="scroll-mt-4 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 xl:sticky xl:top-5 xl:self-start"
          >
            <Card className="rounded-2xl shadow-card">
              <CardHeader>
                <CardTitle className="text-lg">Tu decisión</CardTitle>
                <CardDescription>
                  Quedará vinculada a esta versión, fecha y correo de revisión.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {completed ? (
                  <div className="py-4 text-center">
                    <span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                      <CheckCircle2 />
                    </span>
                    <h2 className="mt-4 font-semibold">Respuesta registrada</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {completed === "APPROVE"
                        ? "Aprobaste esta versión."
                        : completed === "REQUEST_CHANGES"
                          ? "Solicitaste cambios para esta versión."
                          : "Rechazaste esta versión."}
                    </p>
                    <p className="mt-4 text-xs text-muted-foreground">
                      Ya puedes cerrar esta ventana.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-2">
                      {(
                        ["APPROVE", "REQUEST_CHANGES", "REJECT"] as Decision[]
                      ).map((value) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={decision === value}
                          onClick={() => {
                            setDecision(value);
                            if (value === "APPROVE") setReason("");
                            setError(null);
                          }}
                          className={`flex items-center gap-3 rounded-xl border p-3 text-left text-sm ${decision === value ? "border-primary bg-secondary/45 ring-1 ring-primary/20" : "hover:bg-muted/50"}`}
                        >
                          {value === "APPROVE" ? (
                            <CheckCircle2 className="size-4 text-emerald-600" />
                          ) : value === "REQUEST_CHANGES" ? (
                            <MessageSquareText className="size-4 text-amber-600" />
                          ) : (
                            <XCircle className="size-4 text-red-600" />
                          )}
                          <span className="font-semibold">
                            {value === "APPROVE"
                              ? "Aprobar versión"
                              : value === "REQUEST_CHANGES"
                                ? "Solicitar cambios"
                                : "Rechazar versión"}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="rounded-xl border bg-muted/25 p-3 text-sm">
                      <p className="font-semibold">
                        {initialData.recipientName || "Destinatario autorizado"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Confirma el correo asociado al enlace
                        {initialData.recipientEmailHint
                          ? ` (${initialData.recipientEmailHint})`
                          : ""}
                        .
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reviewer-email">Correo corporativo</Label>
                      <Input
                        id="reviewer-email"
                        type="email"
                        inputMode="email"
                        value={reviewerEmail}
                        onChange={(event) =>
                          setReviewerEmail(event.target.value)
                        }
                        maxLength={254}
                        className="min-h-11"
                      />
                    </div>
                    {decision === "APPROVE" ? (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
                        <CheckCircle2 className="size-4" /> Aprobada sin
                        observaciones.
                      </div>
                    ) : decision ? (
                      <div className="space-y-2">
                        <Label htmlFor="review-reason">
                          {decision === "REJECT"
                            ? "Motivo del rechazo"
                            : "Detalle de los cambios solicitados"}
                        </Label>
                        <Textarea
                          id="review-reason"
                          aria-label="Observación de la nota"
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          maxLength={2000}
                          className="min-h-28"
                          placeholder="Describe con precisión qué debe corregirse y por qué."
                        />
                      </div>
                    ) : (
                      <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                        La nota seguirá pendiente hasta que elijas una decisión.
                      </p>
                    )}
                    {error ? (
                      <Alert variant="destructive" aria-live="assertive">
                        <AlertTriangle />
                        <AlertTitle>No se registró la respuesta</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    ) : null}
                    <Button
                      className="min-h-11 w-full"
                      onClick={() => void submit()}
                      disabled={busy}
                    >
                      {busy ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Send />
                      )}
                      Enviar decisión
                    </Button>
                    <p className="text-center text-[10px] leading-4 text-muted-foreground">
                      El enlace es personal y temporal. No lo reenvíes.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
      {!completed && !decisionVisible ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur xl:hidden">
          <Button
            type="button"
            className="mx-auto flex min-h-11 w-full max-w-xl"
            aria-controls="review-decision"
            onClick={goToDecision}
          >
            Revisar y decidir
          </Button>
        </div>
      ) : null}
    </main>
  );
}

function ContentBlock({ block }: { block: NoteBlock }) {
  if (block.type === "heading") {
    const Tag = block.level === 3 ? "h3" : block.level === 4 ? "h4" : "h2";
    return (
      <Tag className="mt-7 break-words font-heading text-xl font-semibold [overflow-wrap:anywhere]">
        {renderInlineLinks(block.text)}
      </Tag>
    );
  }
  if (block.type === "bullet_list" || block.type === "ordered_list") {
    const Tag = block.type === "ordered_list" ? "ol" : "ul";
    return (
      <Tag
        className={`min-w-0 space-y-2 pl-5 text-[15px] leading-7 [overflow-wrap:anywhere] ${block.type === "ordered_list" ? "list-decimal" : "list-disc"}`}
      >
        {block.items?.map((item, index) => (
          <li key={`${block.id}-${index}`}>{renderInlineLinks(item)}</li>
        ))}
      </Tag>
    );
  }
  if (block.type === "quote")
    return (
      <blockquote className="break-words border-l-4 border-primary/35 pl-4 italic leading-7 text-muted-foreground [overflow-wrap:anywhere]">
        {renderInlineLinks(block.text)}
      </blockquote>
    );
  if (block.type === "callout")
    return (
      <div className="break-words rounded-xl border bg-secondary/35 p-4 text-[15px] leading-7 [overflow-wrap:anywhere]">
        {renderInlineLinks(block.text)}
      </div>
    );
  return (
    <p className="min-w-0 break-words text-[15px] leading-7 text-foreground/90 [overflow-wrap:anywhere]">
      {renderInlineLinks(block.text)}
    </p>
  );
}

function renderInlineLinks(text: string | undefined) {
  if (!text) return null;
  const pattern = /\[([^\]]+)]\(\s*(https?:\/\/\S+?)\s*\)/gi;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    if (index > cursor) nodes.push(text.slice(cursor, index));
    const href = cleanReviewUrl(match[2]);
    nodes.push(
      href ? (
        <a
          className="break-words font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary [overflow-wrap:anywhere]"
          href={href}
          key={`${index}-${href}`}
          rel="noreferrer noopener"
          target="_blank"
        >
          {match[1]}
        </a>
      ) : (
        match[0]
      ),
    );
    cursor = index + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes.length ? nodes : text;
}

function cleanReviewUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    for (const key of [...url.searchParams.keys()]) {
      const normalized = key.toLowerCase();
      if (
        normalized.startsWith("utm_") ||
        ["_ga", "dclid", "fbclid", "gclid", "gbraid", "mc_cid", "mc_eid", "msclkid", "srsltid", "wbraid"].includes(normalized)
      ) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

function Unavailable() {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 p-5">
      <Card className="max-w-md rounded-2xl text-center">
        <CardContent className="p-8">
          <AlertTriangle className="mx-auto size-10 text-amber-600" />
          <h1 className="mt-4 text-xl font-semibold">
            Este enlace ya no está disponible
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Puede haber vencido, sido respondido o reemplazado. Solicita un
            nuevo enlace al equipo responsable.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
