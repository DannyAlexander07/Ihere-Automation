import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportDispatchDialog } from "./export-dispatch-dialog";
import type { ExportArtifactSummary } from "./types";

const apiFetchMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    apiFetch: apiFetchMock,
    user: { email: "tecnologia@mood.pe" },
  }),
}));

const artifact: ExportArtifactSummary = {
  id: "artifact-1",
  noteId: "note-1",
  version: 2,
  format: "HTML",
  status: "READY",
  fileName: "nota.html",
  mimeType: "text/html",
  sizeBytes: 2000,
  contentHash: "a".repeat(64),
  errorMessage: null,
  verifiedAt: "2026-08-16T20:00:00.000Z",
  sentToEmail: null,
  sentByEmail: null,
  emailSubject: null,
  externalMessageId: null,
  sentAt: null,
  createdAt: "2026-08-16T20:00:00.000Z",
  updatedAt: "2026-08-16T20:00:00.000Z",
  note: {
    status: "EXPORTED",
    client: { name: "Adecco Perú", slug: "adecco-peru" },
    versions: [{ title: "Mapeo de puestos críticos" }],
  },
};

describe("ExportDispatchDialog", () => {
  beforeEach(() => apiFetchMock.mockClear());

  it("registra remitente, destinatario y evidencia del correo", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <ExportDispatchDialog
        artifact={artifact}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByLabelText("Correo del cliente"), {
      target: { value: "angie@cliente.pe" },
    });
    fireEvent.change(
      screen.getByLabelText("ID o referencia del correo (opcional)"),
      { target: { value: "mail-123" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar correo enviado" }),
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("exports/artifact-1/dispatch", {
        method: "POST",
        body: JSON.stringify({
          recipientEmail: "angie@cliente.pe",
          senderEmail: "tecnologia@mood.pe",
          subject:
            "Adecco Perú | Entrega HTML aprobada: Mapeo de puestos críticos",
          externalMessageId: "mail-123",
          confirmedSent: true,
        }),
      });
    });
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
