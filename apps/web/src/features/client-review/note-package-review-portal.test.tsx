import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotePackageReviewPortal, type PublicNotePackageReview } from "./note-package-review-portal";

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn().mockResolvedValue({ accepted: true }) }));
vi.mock("@/lib/api/api-client", () => ({ apiRequest: apiRequestMock, ApiError: class ApiError extends Error {} }));

const content = (position: number) => ({
  title: `Nota editorial ${position}`,
  metaTitle: `Nota editorial ${position} | Adecco`,
  metaDescription: `Descripción de la nota ${position}.`,
  slug: `nota-editorial-${position}`,
  excerpt: `Extracto de la nota ${position}.`,
  content: { schemaVersion: 1 as const, blocks: [{ id: `p-${position}`, type: "paragraph" as const, text: `Contenido principal ${position}.` }] },
  authorName: "Especialista Adecco",
  authorRole: "Talento",
  ctaText: "Contacta a un especialista de Adecco.",
  ctaUrl: "https://www.adecco.com/es-pe/contactanos",
  internalLinks: [],
  sources: [{ type: "PRIMARY", title: "Fuente oficial", entity: "Entidad", url: "https://example.com/fuente" }],
  image: { concept: `Concepto visual ${position}`, prompt: `Instrucciones visuales completas para la nota ${position}.`, altText: `Escena laboral ${position}`, caption: null, referenceUrl: null, status: "PROPOSED" },
});

const review: PublicNotePackageReview = {
  client: { name: "Adecco Perú", slug: "adecco-peru" },
  generationRunId: "run-1",
  topic: "Paquete mensual",
  createdAt: "2026-08-20T12:00:00.000Z",
  expiresAt: "2026-08-27T12:00:00.000Z",
  recipientName: "Angie Rojas",
  recipientEmailHint: "a***@adecco.com",
  notes: [
    { noteId: "note-1", version: 1, content: content(1) },
    { noteId: "note-2", version: 2, content: content(2) },
  ],
};

describe("NotePackageReviewPortal", () => {
  beforeEach(() => { apiRequestMock.mockClear(); window.sessionStorage.clear(); });

  it("muestra una nota a la vez con su propuesta visual", () => {
    render(<NotePackageReviewPortal token="token" initialData={review} unavailable={false} />);
    expect(screen.getByText("Nota editorial 1")).toBeInTheDocument();
    expect(screen.getByText("Concepto visual 1")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Contacta a un especialista/ }),
    ).toHaveAttribute("href", "https://www.adecco.com/es-pe/contactanos");
    expect(screen.queryByText("Nota editorial 2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Nota 2/ }));
    expect(screen.getByText("Nota editorial 2")).toBeInTheDocument();
    expect(screen.queryByText("Nota editorial 1")).not.toBeInTheDocument();
  });

  it("exige y envía una decisión por cada nota", async () => {
    render(<NotePackageReviewPortal token="token-paquete" initialData={review} unavailable={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    fireEvent.click(screen.getByRole("tab", { name: /Nota 2/ }));
    fireEvent.click(screen.getByRole("button", { name: "Observar" }));
    fireEvent.change(screen.getByLabelText("Cambios solicitados"), { target: { value: "Ajustar el ejemplo al contexto peruano." } });
    fireEvent.change(screen.getByLabelText("Confirma tu correo corporativo"), { target: { value: "angie@adecco.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar revisión completa" }));
    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(apiRequestMock.mock.calls[0][1].body as string);
    expect(body.decisions).toEqual([
      expect.objectContaining({ noteId: "note-1", version: 1, type: "APPROVE" }),
      expect.objectContaining({ noteId: "note-2", version: 2, type: "REQUEST_CHANGES" }),
    ]);
    expect(await screen.findByText("Revisión registrada")).toBeInTheDocument();
  });
});
