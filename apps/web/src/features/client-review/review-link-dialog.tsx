"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Clipboard,
  ExternalLink,
  Link2,
  LoaderCircle,
  Mail,
  RefreshCw,
  Send,
  ShieldX,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError } from "@/lib/api/api-client";

type ReviewLink = {
  id: string;
  reviewUrl?: string | null;
  version?: number;
  titleCount?: number;
  noteCount?: number;
  status: "ACTIVE" | "COMPLETED" | "REVOKED" | "EXPIRED";
  recipientName: string | null;
  recipientEmail: string | null;
  expiresAt: string;
  viewCount: number;
  maxViews: number;
  lastViewedAt: string | null;
  sentByEmail: string | null;
  emailSubject: string | null;
  externalMessageId: string | null;
  sentAt: string | null;
  createdAt: string;
  decision: {
    type: string;
    reason: string;
    reviewerName: string;
    reviewerEmail: string;
    createdAt: string;
  } | null;
  decisions?: Array<{
    proposalId?: string;
    noteId?: string;
    version: number;
    type: string;
    reason: string;
    reviewerName: string;
    reviewerEmail: string;
    createdAt: string;
  }>;
};

type Props = {
  kind: "note" | "title" | "title-package" | "note-package";
  entityId: string;
  entityTitle: string;
  entityCount?: number;
  proposalIds?: string[];
  noteIds?: string[];
  onClose: () => void;
};

export function ReviewLinkDialog({
  kind,
  entityId,
  entityTitle,
  entityCount,
  proposalIds,
  noteIds,
  onClose,
}: Props) {
  const { apiFetch, user } = useAuth();
  const [links, setLinks] = useState<ReviewLink[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(7);
  const [created, setCreated] = useState<{
    id: string;
    url: string;
    recipientName?: string | null;
    recipientEmail?: string | null;
  } | null>(null);
  const [senderEmail, setSenderEmail] = useState(user?.email ?? "");
  const [subject, setSubject] = useState(
    kind === "note-package"
      ? `Revisión de paquete de ${entityCount ?? "varias"} notas para ${entityTitle}`
      : kind === "title-package"
      ? `Revisión de paquete de ${entityCount ?? "varios"} títulos para ${entityTitle}`
      : kind === "title"
        ? `Revisión de título para ${entityTitle}`
        : `Revisión de nota para ${entityTitle}`,
  );
  const [externalMessageId, setExternalMessageId] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const basePath =
    kind === "note-package"
      ? `review-links/note-packages/${entityId}`
      : kind === "title-package"
      ? `review-links/title-packages/${entityId}`
      : kind === "title"
        ? `review-links/titles/${entityId}`
        : `review-links/notes/${entityId}`;

  const load = useCallback(async () => {
    try {
      const nextLinks = await apiFetch<ReviewLink[]>(basePath);
      setLinks(nextLinks);
      const active = nextLinks.find(
        (link) => link.status === "ACTIVE" && link.reviewUrl,
      );
      if (active?.reviewUrl) {
        setCreated((current) =>
          current?.id === active.id
            ? current
            : {
                id: active.id,
                url: active.reviewUrl!,
                recipientName: active.recipientName,
                recipientEmail: active.recipientEmail,
              },
        );
        setName((current) => current || active.recipientName || "");
        setEmail((current) => current || active.recipientEmail || "");
      }
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, basePath]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const mailBody = useMemo(() => {
    if (!created) return "";
    const item =
      kind === "note-package"
        ? `paquete de ${entityCount ?? "varias"} notas preparadas`
        : kind === "title-package"
        ? `paquete de ${entityCount ?? "varios"} títulos propuestos`
        : kind === "title"
          ? "título propuesto"
          : "nota preparada";
    return [
      `Hola ${name.trim() || ""},`,
      "",
      `Te compartimos el ${item} “${entityTitle}” para su revisión.`,
      "En el enlace podrás aprobarlo o indicar los cambios necesarios.",
      "",
      created.url,
      "",
      "Gracias.",
    ].join("\n");
  }, [created, entityCount, entityTitle, kind, name]);

  const mailto = useMemo(() => {
    if (!created || !email.includes("@")) return "#";
    return `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(subject.trim())}&body=${encodeURIComponent(mailBody)}`;
  }, [created, email, mailBody, subject]);

  const create = async () => {
    if (name.trim().length < 2 || !email.includes("@")) {
      setError("Registra el nombre y correo corporativo del destinatario.");
      return;
    }
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const result = await apiFetch<{ id: string; reviewUrl: string }>(
        basePath,
        {
          method: "POST",
          body: JSON.stringify({
            expiresInDays: days,
            recipientName: name.trim(),
            recipientEmail: email.trim(),
            ...(kind === "title-package" && proposalIds?.length
              ? { proposalIds }
              : {}),
            ...(kind === "note-package" && noteIds?.length ? { noteIds } : {}),
          }),
        },
      );
      setCreated({
        id: result.id,
        url: result.reviewUrl,
        recipientName: name.trim(),
        recipientEmail: email.trim(),
      });
      await load();
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (id: string, url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 2_000);
  };

  const recover = async (link: ReviewLink) => {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ id: string; reviewUrl: string }>(
        `review-links/${kind === "note-package" ? "note-packages" : kind === "title-package" ? "title-packages" : kind === "title" ? "titles" : "notes"}/${link.id}/access`,
        { method: "PATCH" },
      );
      setCreated({
        id: result.id,
        url: result.reviewUrl,
        recipientName: link.recipientName,
        recipientEmail: link.recipientEmail,
      });
      setName(link.recipientName || "");
      setEmail(link.recipientEmail || "");
      await load();
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  };

  const confirmDispatch = async () => {
    if (!created || !senderEmail.includes("@") || subject.trim().length < 5) {
      setError("Indica el correo corporativo remitente y el asunto utilizado.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch(
        `review-links/${kind === "note-package" ? "note-packages" : kind === "title-package" ? "title-packages" : kind === "title" ? "titles" : "notes"}/${created.id}/dispatch`,
        {
          method: "PATCH",
          body: JSON.stringify({
            senderEmail: senderEmail.trim(),
            subject: subject.trim(),
            externalMessageId: externalMessageId.trim() || undefined,
            confirmedSent: true,
          }),
        },
      );
      await load();
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const path =
        kind === "note-package"
          ? `review-links/note-packages/${id}/revoke`
          : kind === "title-package"
          ? `review-links/title-packages/${id}/revoke`
          : kind === "title"
            ? `review-links/titles/${id}/revoke`
            : `review-links/${id}/revoke`;
      await apiFetch(path, { method: "PATCH" });
      await load();
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="pr-10">
          <DialogTitle className="text-xl font-bold leading-tight">
            {kind === "note-package"
              ? "Revisión del paquete de notas con el cliente"
              : kind === "title-package"
              ? "Revisión del paquete de títulos con el cliente"
              : kind === "title"
                ? "Revisión del título con el cliente"
                : "Revisión de la nota con el cliente"}
          </DialogTitle>
          <DialogDescription className="max-w-2xl text-sm leading-6">
            El enlace registra la decisión por versión. El correo se abre en tu
            aplicación corporativa; después confirma el envío para conservar la
            constancia.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>No se completó la operación</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-5 rounded-2xl border bg-secondary/20 p-4 sm:grid-cols-2 sm:p-5">
          <div className="space-y-2">
            <Label htmlFor="review-recipient">Nombre del destinatario</Label>
            <Input
              id="review-recipient"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={160}
              placeholder="Nombre y apellido"
              autoComplete="off"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="review-email">Correo corporativo del cliente</Label>
            <Input
              id="review-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              placeholder="nombre@cliente.com"
              autoComplete="off"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="review-days">Vigencia</Label>
            <select
              id="review-days"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
            >
              {[1, 3, 7, 14, 30].map((value) => (
                <option key={value} value={value}>
                  {value} {value === 1 ? "día" : "días"}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              onClick={() => void create()}
              disabled={busy || name.trim().length < 2 || !email.includes("@")}
            >
              {busy ? <LoaderCircle className="animate-spin" /> : <Link2 />}
              Crear enlace nuevo
            </Button>
          </div>
        </div>

        {created ? (
          <section className="space-y-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 sm:p-6">
            <div>
              <p className="flex items-center gap-2 text-base font-bold">
                <Check className="size-4" /> Enlace listo
              </p>
              <p className="mt-2 break-all rounded-lg bg-white/70 p-3 text-xs leading-5">
                {created.url}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void copy(created.id, created.url)}
                >
                  {copiedId === created.id ? <Check /> : <Clipboard />}
                  {copiedId === created.id ? "Copiado" : "Copiar enlace"}
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={created.url} target="_blank" rel="noreferrer">
                    <ExternalLink /> Vista previa
                  </a>
                </Button>
              </div>
            </div>
            <div className="grid gap-3 border-t border-emerald-200 pt-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sender-email">Tu correo corporativo</Label>
                <Input
                  id="sender-email"
                  type="email"
                  value={senderEmail}
                  onChange={(event) => setSenderEmail(event.target.value)}
                  placeholder="nombre@mood.pe"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-subject">Asunto</Label>
                <Input
                  id="email-subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  maxLength={300}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="external-message-id">
                  ID del correo o referencia (opcional)
                </Label>
                <Input
                  id="external-message-id"
                  value={externalMessageId}
                  onChange={(event) => setExternalMessageId(event.target.value)}
                  placeholder="Message-ID, ticket o referencia del correo"
                  maxLength={500}
                  autoComplete="off"
                />
              </div>
              <Button variant="outline" asChild>
                <a href={mailto}>
                  <Mail /> Abrir correo corporativo
                </a>
              </Button>
              <Button
                onClick={() => void confirmDispatch()}
                disabled={
                  busy ||
                  !senderEmail.includes("@") ||
                  subject.trim().length < 5
                }
              >
                <Send /> Confirmar correo enviado
              </Button>
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold">Historial de invitaciones</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Abre o copia una invitación activa sin crear otra.
              </p>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => void load()}
              aria-label="Actualizar enlaces"
            >
              <RefreshCw />
            </Button>
          </div>
          {loading ? (
            <div className="grid min-h-24 place-items-center">
              <LoaderCircle className="animate-spin" />
            </div>
          ) : links.length ? (
            <div className="space-y-3">
              {links.map((link) => (
                <article
                  key={link.id}
                  className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-bold">
                        {link.recipientName || "Destinatario sin nombre"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {link.recipientEmail || "Sin correo registrado"}
                        {link.version ? ` · v${link.version}` : ""}
                        {link.titleCount ? ` · ${link.titleCount} títulos` : ""}
                        {link.noteCount ? ` · ${link.noteCount} notas` : ""}
                      </p>
                    </div>
                    <Badge
                      variant={link.status === "ACTIVE" ? "default" : "outline"}
                    >
                      {statusLabel(link.status)}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>
                      {link.viewCount}/{link.maxViews} vistas · vence{" "}
                      {new Date(link.expiresAt).toLocaleDateString("es-PE")}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {link.status === "ACTIVE" && link.reviewUrl ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void copy(link.id, link.reviewUrl!)}
                          >
                            {copiedId === link.id ? <Check /> : <Clipboard />}
                            {copiedId === link.id ? "Copiado" : "Copiar enlace"}
                          </Button>
                          <Button size="sm" variant="outline" asChild>
                            <a
                              href={link.reviewUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink /> Abrir
                            </a>
                          </Button>
                        </>
                      ) : link.status === "ACTIVE" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void recover(link)}
                          disabled={busy}
                        >
                          <Link2 /> Recuperar enlace
                        </Button>
                      ) : null}
                      {link.status === "ACTIVE" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void revoke(link.id)}
                          disabled={busy}
                        >
                          <ShieldX /> Revocar
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {link.sentAt ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
                      <Mail className="size-3.5" /> Enviado desde{" "}
                      {link.sentByEmail} el{" "}
                      {new Date(link.sentAt).toLocaleString("es-PE")}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-amber-700">
                      Falta registrar el correo de envío.
                    </p>
                  )}
                  {link.status === "ACTIVE" && !link.reviewUrl ? (
                    <p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs leading-5 text-amber-800">
                      Esta invitación fue creada antes de habilitar la
                      recuperación. Al recuperarla conservarás el mismo
                      registro, pero la dirección anterior dejará de funcionar.
                    </p>
                  ) : null}
                  {link.decision ? (
                    <div className="mt-3 rounded-lg bg-secondary/40 p-2.5">
                      <p className="text-xs font-semibold">
                        {link.decision.type} · {link.decision.reviewerName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {link.decision.reason}
                      </p>
                    </div>
                  ) : null}
                  {link.decisions?.length ? (
                    <div className="mt-3 rounded-lg bg-secondary/40 p-2.5">
                      <p className="text-xs font-semibold">
                        Paquete respondido · {link.decisions.length} decisiones
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {
                          link.decisions.filter(
                            (item) => item.type === "APPROVE",
                          ).length
                        }{" "}
                        aprobados ·{" "}
                        {
                          link.decisions.filter(
                            (item) => item.type === "REQUEST_CHANGES",
                          ).length
                        }{" "}
                        con cambios ·{" "}
                        {
                          link.decisions.filter(
                            (item) => item.type === "REJECT",
                          ).length
                        }{" "}
                        rechazados
                      </p>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
              Todavía no hay invitaciones.
            </p>
          )}
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function messageFrom(error: unknown) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado.";
}

function statusLabel(status: ReviewLink["status"]) {
  return {
    ACTIVE: "Activo",
    COMPLETED: "Respondido",
    REVOKED: "Revocado",
    EXPIRED: "Vencido",
  }[status];
}
