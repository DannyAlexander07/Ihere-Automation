import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewPortal, type PublicReview } from "./review-portal";

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/api/api-client", () => ({
  apiRequest: apiRequestMock,
  ApiError: class ApiError extends Error {},
}));

const review: PublicReview = {
  client: { name: "Adecco Perú", slug: "adecco-peru" },
  noteId: "note-1",
  version: 2,
  expiresAt: "2026-08-17T20:00:00.000Z",
  recipientName: "Angie Rojas",
  recipientEmailHint: "a***@cliente.pe",
  content: {
    title: "Retención de talento en contextos de cambio",
    metaTitle: null,
    metaDescription: null,
    slug: "retencion-de-talento",
    excerpt: "Una guía práctica para equipos de Recursos Humanos.",
    content: {
      schemaVersion: 1,
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          text: "Contenido verificable en la [fuente oficial](https://example.com/fuente?utm_source=openai).",
        },
      ],
    },
    authorName: "Adecco Perú",
    authorRole: "Equipo editorial",
    ctaText: "Conversa con un especialista.",
    ctaUrl: "https://www.adecco.com/es-pe/contactanos",
    internalLinks: ["https://www.adecco.com/es-pe/blog"],
    sources: [
      {
        type: "PRIMARY",
        title: "Fuente oficial",
        entity: "Organismo público",
        url: "https://example.com/fuente",
        publishedAt: null,
        accessedAt: "2026-08-16T20:00:00.000Z",
      },
    ],
  },
};

describe("ReviewPortal", () => {
  beforeEach(() => {
    apiRequestMock.mockClear();
    apiRequestMock.mockResolvedValue(undefined);
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("muestra la versión, el contenido y las fuentes autorizadas", () => {
    render(
      <ReviewPortal
        token="token-temporal"
        initialData={review}
        unavailable={false}
      />,
    );

    expect(
      screen.getByRole("heading", { name: review.content.title }),
    ).toBeInTheDocument();
    expect(screen.getByText("Versión 2")).toBeInTheDocument();
    expect(screen.getByText("retencion-de-talento")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Contacta a un especialista/ }),
    ).toHaveAttribute("href", "https://www.adecco.com/es-pe/contactanos");
    expect(
      screen.getByRole("link", { name: /Fuente oficial/ }),
    ).toHaveAttribute("href", "https://example.com/fuente");
    expect(
      screen.getByRole("link", { name: "fuente oficial" }),
    ).toHaveAttribute("href", "https://example.com/fuente");
    expect(screen.queryByText(/utm_source=openai/)).not.toBeInTheDocument();
  });

  it("ofrece un acceso rápido a la decisión sin registrarla", () => {
    render(
      <ReviewPortal
        token="token-temporal"
        initialData={review}
        unavailable={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Revisar y decidir" }));

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledOnce();
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("bloquea decisiones incompletas antes de llamar al API", async () => {
    render(
      <ReviewPortal
        token="token-temporal"
        initialData={review}
        unavailable={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Enviar decisión" }));

    expect(
      await screen.findByText(
        /Selecciona aprobar, solicitar cambios o rechazar/,
      ),
    ).toBeInTheDocument();
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("registra una decisión vinculada al token y confirma el resultado", async () => {
    render(
      <ReviewPortal
        token="token-temporal"
        initialData={review}
        unavailable={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Aprobar versión" }));
    fireEvent.change(screen.getByLabelText("Correo corporativo"), {
      target: { value: "angie@cliente.pe" },
    });
    expect(
      screen.queryByLabelText("Observación de la nota"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enviar decisión" }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        "public/reviews/current/decision",
        {
          method: "POST",
          headers: { "x-review-token": "token-temporal" },
          body: JSON.stringify({
            type: "APPROVE",
            reviewerEmail: "angie@cliente.pe",
            reason: "Aprobado por el cliente.",
          }),
        },
      );
    });
    expect(await screen.findByText("Respuesta registrada")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Revisar y decidir" }),
    ).not.toBeInTheDocument();
  });

  it("muestra el campo de observación solo cuando corresponde", () => {
    render(
      <ReviewPortal
        token="token-temporal"
        initialData={review}
        unavailable={false}
      />,
    );

    expect(screen.getByText("Nota 1 de 1")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Observación de la nota"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Solicitar cambios" }));
    expect(screen.getByLabelText("Observación de la nota")).toBeInTheDocument();
  });

  it("muestra un estado neutro cuando el enlace no está disponible", () => {
    render(
      <ReviewPortal token="token-temporal" initialData={null} unavailable />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Este enlace ya no está disponible",
      }),
    ).toBeInTheDocument();
  });
});
