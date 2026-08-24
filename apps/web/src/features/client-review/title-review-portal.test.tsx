import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TitleReviewPortal,
  type PublicTitleReview,
} from "./title-review-portal";

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/api/api-client", () => ({
  apiRequest: apiRequestMock,
  ApiError: class ApiError extends Error {},
}));

const review: PublicTitleReview = {
  client: { name: "Adecco Perú", slug: "adecco-peru" },
  proposalId: "proposal-1",
  version: 1,
  expiresAt: "2026-08-24T20:00:00.000Z",
  recipientName: "Angie Rojas",
  recipientEmailHint: "a***@cliente.pe",
  content: {
    title: "Mapeo de puestos críticos para la continuidad del negocio",
    objective: "Orientar una decisión de gestión del talento.",
    audience: "Líderes de Recursos Humanos",
    searchIntent: "Aprender a identificar puestos críticos",
    focus: "Continuidad operativa",
    opportunity: "Aportar una guía práctica de Adecco Perú",
    risk: "Evitar promesas sin evidencia",
  },
};

describe("TitleReviewPortal", () => {
  beforeEach(() => {
    apiRequestMock.mockClear();
    apiRequestMock.mockResolvedValue(undefined);
    window.sessionStorage.clear();
  });

  it("muestra al cliente el título y el contexto que debe aprobar", () => {
    render(
      <TitleReviewPortal
        token="token-titulo"
        initialData={review}
        unavailable={false}
      />,
    );

    expect(
      screen.getByRole("heading", { name: review.content.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(review.content.searchIntent)).toBeInTheDocument();
    expect(screen.getByText("Título · v1")).toBeInTheDocument();
  });

  it("registra la aprobación con el correo corporativo y el token", async () => {
    render(
      <TitleReviewPortal
        token="token-titulo"
        initialData={review}
        unavailable={false}
      />,
    );

    fireEvent.change(screen.getByLabelText("Correo corporativo"), {
      target: { value: "angie@cliente.pe" },
    });
    fireEvent.change(screen.getByLabelText("Observación"), {
      target: { value: "Título aprobado para iniciar la redacción." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Registrar decisión" }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        "public/title-reviews/current/decision",
        {
          method: "POST",
          headers: { "x-review-token": "token-titulo" },
          body: JSON.stringify({
            type: "APPROVE",
            reviewerEmail: "angie@cliente.pe",
            reason: "Título aprobado para iniciar la redacción.",
          }),
        },
      );
    });
    expect(await screen.findByText("Decisión registrada")).toBeInTheDocument();
  });

  it("no ofrece decisiones cuando el enlace venció o fue reemplazado", () => {
    render(
      <TitleReviewPortal token="token-titulo" initialData={null} unavailable />,
    );

    expect(
      screen.getByRole("heading", { name: "Enlace no disponible" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Registrar decisión" }),
    ).not.toBeInTheDocument();
  });
});
