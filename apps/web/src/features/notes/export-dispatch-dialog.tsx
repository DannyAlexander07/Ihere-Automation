"use client";

import { useMemo, useState } from "react";
import { ExternalLink, LoaderCircle, MailCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import type { ExportArtifactSummary } from "./types";

type Props = {
  artifact: ExportArtifactSummary;
  onClose: () => void;
  onSaved: () => void;
};

export function ExportDispatchDialog({ artifact, onClose, onSaved }: Props) {
  const { apiFetch, user } = useAuth();
  const [recipientEmail, setRecipientEmail] = useState(
    artifact.sentToEmail ?? "",
  );
  const [senderEmail, setSenderEmail] = useState(
    artifact.sentByEmail ?? user?.email ?? "",
  );
  const [subject, setSubject] = useState(
    artifact.emailSubject ??
      `Adecco Perú | Entrega ${artifact.format} aprobada: ${artifact.note.versions[0]?.title ?? "nota"}`,
  );
  const [externalMessageId, setExternalMessageId] = useState(
    artifact.externalMessageId ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mailto = useMemo(() => {
    const body = [
      "Hola,",
      "",
      `Compartimos el entregable ${artifact.format} correspondiente a la nota aprobada “${artifact.note.versions[0]?.title ?? artifact.fileName ?? "Nota"}”.`,
      `Versión: ${artifact.version}.`,
      "Adjunta el archivo verificado que descargaste desde I HERE.",
      "",
      "Gracias.",
    ].join("\n");
    return `mailto:${encodeURIComponent(recipientEmail.trim())}?subject=${encodeURIComponent(subject.trim())}&body=${encodeURIComponent(body)}`;
  }, [artifact, recipientEmail, subject]);

  const save = async () => {
    if (
      !recipientEmail.includes("@") ||
      !senderEmail.includes("@") ||
      subject.trim().length < 3
    ) {
      setError(
        "Completa destinatario, remitente corporativo y asunto del correo enviado.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`exports/${artifact.id}/dispatch`, {
        method: "POST",
        body: JSON.stringify({
          recipientEmail: recipientEmail.trim(),
          senderEmail: senderEmail.trim(),
          subject: subject.trim(),
          externalMessageId: externalMessageId.trim() || undefined,
          confirmedSent: true,
        }),
      });
      onSaved();
      onClose();
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Registrar entrega al cliente</DialogTitle>
          <DialogDescription>
            Abre el correo corporativo, adjunta el archivo descargado y confirma
            el envío para conservar la evidencia.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>No se registró la entrega</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="export-recipient">Correo del cliente</Label>
            <Input
              id="export-recipient"
              type="email"
              value={recipientEmail}
              onChange={(event) => setRecipientEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="export-sender">Correo corporativo remitente</Label>
            <Input
              id="export-sender"
              type="email"
              value={senderEmail}
              onChange={(event) => setSenderEmail(event.target.value)}
              placeholder="tecnologia@mood.pe"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="export-subject">Asunto</Label>
            <Input
              id="export-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={300}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="export-message-id">
              ID o referencia del correo (opcional)
            </Label>
            <Input
              id="export-message-id"
              value={externalMessageId}
              onChange={(event) => setExternalMessageId(event.target.value)}
              maxLength={300}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            asChild
            variant="outline"
            disabled={!recipientEmail.includes("@") || !subject.trim()}
          >
            <a href={mailto}>
              <ExternalLink /> Abrir correo
            </a>
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" /> : <MailCheck />}
            Confirmar correo enviado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function messageFrom(error: unknown): string {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado.";
}
