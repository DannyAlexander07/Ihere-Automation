"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleX, Clock3, ExternalLink, ImageIcon, LoaderCircle, MessageSquareText, PackageCheck, Send } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { NoteBlock } from "@/features/notes/types";
import { editorialCtaActionLabel } from "@/features/notes/editorial-cta";
import { apiRequest, ApiError } from "@/lib/api/api-client";

type Decision = "APPROVE" | "REQUEST_CHANGES" | "REJECT";
type ItemDecision = { type: Decision | null; reason: string };
type ImageProposal = { concept: string; prompt: string; altText: string; caption: string | null; referenceUrl: string | null; status: string };
type PackageNote = {
  noteId: string;
  version: number;
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
    sources: Array<{ type: string; title: string; entity: string; url: string }>;
    image: ImageProposal | null;
  };
};

export type PublicNotePackageReview = {
  client: { name: string; slug: string };
  generationRunId: string;
  topic: string;
  createdAt: string;
  expiresAt: string;
  recipientName: string;
  recipientEmailHint: string | null;
  notes: PackageNote[];
};

const options = [
  { value: "APPROVE" as const, label: "Aprobar", icon: CheckCircle2, tone: "data-[active=true]:border-emerald-500 data-[active=true]:bg-emerald-50 data-[active=true]:text-emerald-800" },
  { value: "REQUEST_CHANGES" as const, label: "Observar", icon: MessageSquareText, tone: "data-[active=true]:border-amber-500 data-[active=true]:bg-amber-50 data-[active=true]:text-amber-900" },
  { value: "REJECT" as const, label: "Rechazar", icon: CircleX, tone: "data-[active=true]:border-rose-500 data-[active=true]:bg-rose-50 data-[active=true]:text-rose-800" },
];

const labels: Record<Decision, string> = { APPROVE: "Aprobada", REQUEST_CHANGES: "Observada", REJECT: "Rechazada" };

export function NotePackageReviewPortal({ token, initialData, unavailable }: { token: string; initialData: PublicNotePackageReview | null; unavailable: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [decisions, setDecisions] = useState<Record<string, ItemDecision>>(() => Object.fromEntries((initialData?.notes ?? []).map((note) => [note.noteId, { type: null, reason: "" }])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const reviewed = useMemo(() => Object.values(decisions).filter((item) => item.type).length, [decisions]);

  if (unavailable || !initialData) return <Unavailable />;
  const active = initialData.notes[activeIndex];
  const activeDecision = decisions[active.noteId];

  const toggle = (type: Decision) => {
    setDecisions((current) => ({ ...current, [active.noteId]: { type: current[active.noteId].type === type ? null : type, reason: type === "APPROVE" ? "" : current[active.noteId].reason } }));
    setError(null);
  };

  const submit = async () => {
    const invalid = initialData.notes.some((note) => {
      const item = decisions[note.noteId];
      return !item.type || (item.type !== "APPROVE" && item.reason.trim().length < 5);
    });
    if (invalid || !reviewerEmail.includes("@")) {
      setError("Revisa todas las notas, confirma el correo autorizado y explica cada observación o rechazo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiRequest("public/note-package-reviews/current/decision", {
        method: "POST",
        headers: { "x-review-token": token },
        body: JSON.stringify({
          reviewerEmail: reviewerEmail.trim(),
          decisions: initialData.notes.map((note) => ({ noteId: note.noteId, version: note.version, type: decisions[note.noteId].type, reason: decisions[note.noteId].type === "APPROVE" ? "Aprobado por el cliente." : decisions[note.noteId].reason.trim() })),
        }),
      });
      window.sessionStorage.removeItem("ihere:note-package-review-token");
      setCompleted(true);
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : "No pudimos registrar la revisión.");
    } finally { setBusy(false); }
  };

  if (completed) return <main className="grid min-h-screen place-items-center bg-muted/30 p-5"><Card className="w-full max-w-xl text-center"><CardContent className="p-8"><CheckCircle2 className="mx-auto size-10 text-emerald-600" /><h1 className="mt-4 text-xl font-semibold">Revisión registrada</h1><p className="mt-2 text-sm text-muted-foreground">El equipo recibió la decisión individual de cada nota y conservará el historial por versión.</p></CardContent></Card></main>;

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-6 sm:px-6 sm:py-9">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-2xl border bg-card p-5 shadow-card sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row"><div><div className="flex flex-wrap gap-2"><Badge>{initialData.client.name}</Badge><Badge variant="outline"><PackageCheck className="size-3" /> {initialData.notes.length} notas</Badge></div><h1 className="mt-3 text-2xl font-semibold">Revisión del paquete de notas</h1><p className="mt-1 text-sm text-muted-foreground">Hola, {initialData.recipientName}. Revisa cada nota del expediente “{initialData.topic}”.</p></div><span className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-4" />Vence {new Date(initialData.expiresAt).toLocaleDateString("es-PE")}</span></div>
        </header>
        <nav className="rounded-2xl border bg-card p-4 shadow-card" aria-label="Notas del paquete">
          <div className="flex items-center justify-between gap-3"><strong className="text-sm">{reviewed} de {initialData.notes.length} notas revisadas</strong><span className="text-xs text-muted-foreground">Selecciona una nota para leerla</span></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${reviewed / initialData.notes.length * 100}%` }} /></div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist">{initialData.notes.map((note, index) => { const decision = decisions[note.noteId].type; return <button key={note.noteId} type="button" role="tab" aria-selected={activeIndex === index} onClick={() => setActiveIndex(index)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold ${activeIndex === index ? "border-primary ring-2 ring-primary/15" : "bg-muted/30"}`}>Nota {index + 1} · {decision ? labels[decision] : "Pendiente"}</button>; })}</div>
        </nav>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <article className="min-w-0 rounded-2xl border bg-card p-5 shadow-card sm:p-7 lg:p-9">
            <div className="flex flex-wrap gap-2"><Badge variant="secondary">Nota {activeIndex + 1} de {initialData.notes.length}</Badge><Badge variant="outline">Versión {active.version}</Badge></div>
            <h2 className="mt-4 break-words text-2xl font-bold leading-tight sm:text-3xl">{active.content.title}</h2>
            {active.content.excerpt ? <p className="mt-3 text-base leading-7 text-muted-foreground">{active.content.excerpt}</p> : null}
            <section className="mt-5 grid gap-3 rounded-xl border bg-muted/20 p-4 text-sm sm:grid-cols-2"><Info label="Título SEO" value={active.content.metaTitle} /><Info label="Slug" value={active.content.slug} /><div className="sm:col-span-2"><Info label="Metadescripción" value={active.content.metaDescription} /></div></section>
            <div className="mt-7 space-y-4">{active.content.content.blocks.map((block) => <ContentBlock key={block.id} block={block} />)}</div>
            {active.content.ctaText ? <section className="mt-8 rounded-2xl border border-primary/15 bg-secondary/45 p-5"><h3 className="font-semibold">Siguiente paso</h3><p className="mt-1 text-sm leading-6">{active.content.ctaText}</p>{safeUrl(active.content.ctaUrl) ? <a href={safeUrl(active.content.ctaUrl)!} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline">{editorialCtaActionLabel(active.content.ctaUrl)} <ExternalLink className="size-3.5" /></a> : null}</section> : null}
            {active.content.image ? <ImageProposalCard image={active.content.image} /> : null}
            {active.content.sources.length ? <section className="mt-8 border-t pt-6"><h3 className="font-semibold">Fuentes consultadas</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{active.content.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="rounded-xl border p-3 text-sm hover:border-primary/30"><strong className="block break-words">{source.title}</strong><span className="mt-1 block break-all text-xs text-muted-foreground">{source.entity}</span></a>)}</div></section> : null}
          </article>
          <aside className="h-fit rounded-2xl border bg-card p-5 shadow-card lg:sticky lg:top-5">
            <h2 className="font-semibold">Decisión de la Nota {activeIndex + 1}</h2>
            <div className="mt-4 grid gap-2">{options.map(({ value, label, icon: Icon, tone }) => <Button key={value} variant="outline" data-active={activeDecision.type === value} className={tone} onClick={() => toggle(value)}><Icon />{label}</Button>)}</div>
            {activeDecision.type && activeDecision.type !== "APPROVE" ? <div className="mt-4 space-y-2"><Label htmlFor="note-reason">{activeDecision.type === "REJECT" ? "Motivo del rechazo" : "Cambios solicitados"}</Label><Textarea id="note-reason" value={activeDecision.reason} onChange={(event) => setDecisions((current) => ({ ...current, [active.noteId]: { ...current[active.noteId], reason: event.target.value } }))} placeholder="Describe con precisión qué debe ajustarse." autoComplete="off" className="min-h-28" /></div> : null}
            <div className="mt-6 space-y-2 border-t pt-5"><Label htmlFor="package-reviewer-email">Confirma tu correo corporativo</Label><Input id="package-reviewer-email" type="email" inputMode="email" autoComplete="off" value={reviewerEmail} onChange={(event) => setReviewerEmail(event.target.value)} placeholder={initialData.recipientEmailHint ?? "nombre@empresa.com"} /></div>
            {error ? <Alert variant="destructive" className="mt-4"><AlertTriangle /><AlertTitle>Revisión incompleta</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
            <Button className="mt-4 w-full" disabled={busy || reviewed !== initialData.notes.length} onClick={() => void submit()}>{busy ? <LoaderCircle className="animate-spin" /> : <Send />}Enviar revisión completa</Button>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string | null }) { return <div><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 break-words [overflow-wrap:anywhere]">{value || "No definido"}</p></div>; }

function ImageProposalCard({ image }: { image: ImageProposal }) {
  return <section className="mt-8 rounded-2xl border border-sky-200 bg-sky-50/60 p-5"><div className="flex items-center gap-2"><ImageIcon className="size-5 text-sky-700" /><h3 className="font-semibold">Propuesta visual</h3></div><p className="mt-3 text-sm font-medium">{image.concept}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{image.prompt}</p><div className="mt-3 rounded-xl bg-white/80 p-3 text-sm"><strong>Texto alternativo:</strong> {image.altText}</div>{image.caption ? <p className="mt-2 text-xs text-muted-foreground">Pie sugerido: {image.caption}</p> : null}{safeUrl(image.referenceUrl) ? <a href={safeUrl(image.referenceUrl)!} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">Abrir referencia visual <ExternalLink className="size-3.5" /></a> : null}</section>;
}

function ContentBlock({ block }: { block: NoteBlock }) {
  if (block.type === "heading") { const Tag = block.level === 3 ? "h3" : block.level === 4 ? "h4" : "h2"; return <Tag className="mt-7 break-words text-xl font-semibold [overflow-wrap:anywhere]">{renderLinks(block.text)}</Tag>; }
  if (block.type === "bullet_list" || block.type === "ordered_list") { const Tag = block.type === "ordered_list" ? "ol" : "ul"; return <Tag className={`space-y-2 pl-5 text-[15px] leading-7 ${block.type === "ordered_list" ? "list-decimal" : "list-disc"}`}>{block.items?.map((item, index) => <li key={`${block.id}-${index}`} className="break-words [overflow-wrap:anywhere]">{renderLinks(item)}</li>)}</Tag>; }
  if (block.type === "quote") return <blockquote className="break-words border-l-4 border-primary/35 pl-4 italic leading-7 text-muted-foreground [overflow-wrap:anywhere]">{renderLinks(block.text)}</blockquote>;
  if (block.type === "callout") return <div className="break-words rounded-xl border bg-secondary/35 p-4 text-[15px] leading-7 [overflow-wrap:anywhere]">{renderLinks(block.text)}</div>;
  return <p className="break-words text-[15px] leading-7 [overflow-wrap:anywhere]">{renderLinks(block.text)}</p>;
}

function renderLinks(text?: string) {
  if (!text) return null;
  const pattern = /\[([^\]]+)]\(\s*(https?:\/\/\S+?)\s*\)/gi;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) { const index = match.index; if (index > cursor) nodes.push(text.slice(cursor, index)); const href = safeUrl(match[2]); nodes.push(href ? <a key={`${index}-${href}`} href={href} target="_blank" rel="noreferrer" className="font-medium text-primary underline [overflow-wrap:anywhere]">{match[1]}</a> : match[0]); cursor = index + match[0].length; }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes.length ? nodes : text;
}

function safeUrl(value: string | null | undefined) { if (!value) return null; try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null; } catch { return null; } }

function Unavailable() { return <main className="grid min-h-screen place-items-center bg-muted/30 p-5"><Card className="max-w-md text-center"><CardContent className="p-8"><AlertTriangle className="mx-auto size-10 text-amber-600" /><h1 className="mt-4 text-xl font-semibold">Enlace no disponible</h1><p className="mt-2 text-sm text-muted-foreground">El enlace venció, ya fue respondido o alguna nota cambió. Solicita una nueva invitación al equipo de Mood.</p></CardContent></Card></main>; }
