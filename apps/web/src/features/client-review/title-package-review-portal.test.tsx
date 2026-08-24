import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TitlePackageReviewPortal,
  type PublicTitlePackageReview,
} from "./title-package-review-portal";

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn().mockResolvedValue({ notSelectedCount: 0 }),
}));

vi.mock("@/lib/api/api-client", () => ({
  apiRequest: apiRequestMock,
  ApiError: class ApiError extends Error {},
}));

const review: PublicTitlePackageReview = {
  client: { name: "Adecco Perú", slug: "adecco-peru" },
  generationRunId: "run-1",
  topic: "Gestión estratégica del talento",
  createdAt: "2026-08-17T12:00:00.000Z",
  expiresAt: "2026-08-24T12:00:00.000Z",
  recipientName: "Angie Rojas",
  recipientEmailHint: "a***@adecco.com",
  approvalTarget: 2,
  titles: [
    {
      proposalId: "proposal-1",
      version: 1,
      content: {
        title: "Cómo fortalecer la empleabilidad en un mercado cambiante",
        objective: "Orientar una decisión informada.",
        audience: "Gerencias de Recursos Humanos",
        searchIntent: "Resolver",
        focus: "Empleabilidad sostenible",
        opportunity: "Aportar conocimiento práctico.",
        risk: "Evitar afirmaciones sin respaldo.",
      },
    },
    {
      proposalId: "proposal-2",
      version: 2,
      content: {
        title: "Gestión del talento: decisiones para sostener el negocio",
        objective: "Explicar criterios de priorización.",
        audience: "Líderes empresariales",
        searchIntent: "Aprender",
        focus: "Continuidad del negocio",
        opportunity: "Vincular experiencia de Adecco.",
        risk: "Evitar generalidades.",
      },
    },
  ],
};

describe("TitlePackageReviewPortal", () => {
  beforeEach(() => {
    apiRequestMock.mockClear();
    apiRequestMock.mockResolvedValue({ notSelectedCount: 0 });
    window.sessionStorage.clear();
  });

  it("muestra un título a la vez y permite cambiarlo desde el selector", () => {
    render(
      <TitlePackageReviewPortal
        token="token-paquete"
        initialData={review}
        unavailable={false}
      />,
    );
    expect(
      screen.getByText(review.titles[0].content.title),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(review.titles[1].content.title),
    ).not.toBeInTheDocument();
    expect(screen.getByText("2 títulos")).toBeInTheDocument();
    expect(screen.getByText("0 de 2 títulos aprobados")).toBeInTheDocument();
    expect(screen.getByText("Título 1 de 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Título 2/ }));
    expect(
      screen.queryByText(review.titles[0].content.title),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(review.titles[1].content.title),
    ).toBeInTheDocument();
    expect(screen.getByText("Título 2 de 2")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enviar revisión completa" }),
    ).toBeDisabled();
  });

  it("envía una decisión por cada título como un solo paquete", async () => {
    render(
      <TitlePackageReviewPortal
        token="token-paquete"
        initialData={review}
        unavailable={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    fireEvent.click(screen.getByRole("tab", { name: /Título 2/ }));
    fireEvent.click(screen.getByRole("button", { name: "Observar" }));
    fireEvent.change(screen.getByLabelText("Confirma tu correo corporativo"), {
      target: { value: "angie@adecco.com" },
    });
    expect(
      screen.queryByLabelText("Observación para título 1"),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Observación para título 2"), {
      target: { value: "Ajustar el enfoque al mercado peruano." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Enviar revisión completa" }),
    );

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        "public/title-package-reviews/current/decision",
        expect.objectContaining({
          method: "POST",
          headers: { "x-review-token": "token-paquete" },
        }),
      );
    });
    const body = JSON.parse(apiRequestMock.mock.calls[0][1].body as string);
    expect(body.decisions).toEqual([
      expect.objectContaining({
        proposalId: "proposal-1",
        type: "APPROVE",
        reason: "Aprobado por el cliente.",
      }),
      expect.objectContaining({
        proposalId: "proposal-2",
        type: "REQUEST_CHANGES",
      }),
    ]);
    expect(
      await screen.findByText("Revisión del paquete registrada"),
    ).toBeInTheDocument();
  });

  it("solo solicita una explicación al observar o rechazar", () => {
    render(
      <TitlePackageReviewPortal
        token="token-paquete"
        initialData={review}
        unavailable={false}
      />,
    );

    expect(
      screen.queryByLabelText("Observación para título 1"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(screen.getByText("Aprobado sin observaciones.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    expect(
      screen.getByLabelText("Observación para título 1"),
    ).toBeInTheDocument();
  });

  it("desmarca una decisión al volver a presionar el mismo botón", () => {
    render(
      <TitlePackageReviewPortal
        token="token-paquete"
        initialData={review}
        unavailable={false}
      />,
    );

    const approve = screen.getByRole("button", { name: "Aprobar" });
    fireEvent.click(approve);
    expect(approve).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 de 2 títulos aprobados")).toBeInTheDocument();

    fireEvent.click(approve);
    expect(approve).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("0 de 2 títulos aprobados")).toBeInTheDocument();
    expect(
      screen.getByText(/Selecciona aprobar, observar o rechazar/),
    ).toBeInTheDocument();
  });

  it("permite cerrar un paquete de cinco al aprobar cuatro y archiva la alternativa sobrante", async () => {
    const fiveTitleReview: PublicTitlePackageReview = {
      ...review,
      approvalTarget: 4,
      titles: Array.from({ length: 5 }, (_, index) => ({
        ...review.titles[index % review.titles.length],
        proposalId: `proposal-${index + 1}`,
        content: {
          ...review.titles[index % review.titles.length].content,
          title: `Propuesta editorial ${index + 1}`,
        },
      })),
    };
    apiRequestMock.mockResolvedValue({ notSelectedCount: 1 });

    render(
      <TitlePackageReviewPortal
        token="token-paquete"
        initialData={fiveTitleReview}
        unavailable={false}
      />,
    );

    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(
        screen.getByRole("tab", { name: new RegExp(`Título ${index + 1}`) }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    }
    expect(screen.getByText("4 de 4 títulos aprobados")).toBeInTheDocument();
    expect(
      screen.getByText(
        /La alternativa restante quedará como no seleccionada|Las 1 alternativas restantes quedarán como no seleccionadas/,
      ),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Confirma tu correo corporativo"), {
      target: { value: "angie@adecco.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Enviar revisión completa" }),
    );

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(apiRequestMock.mock.calls[0][1].body as string);
    expect(body.decisions).toHaveLength(4);
    expect(
      body.decisions.every((item: { type: string }) => item.type === "APPROVE"),
    ).toBe(true);
    expect(await screen.findByText(/1 no seleccionados/)).toBeInTheDocument();
  });
});
