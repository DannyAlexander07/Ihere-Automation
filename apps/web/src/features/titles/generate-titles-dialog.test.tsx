import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TitleBriefSuggestion } from "./ai-generation-api";
import { GenerateTitlesDialog } from "./generate-titles-dialog";

describe("GenerateTitlesDialog", () => {
  const suggestion: TitleBriefSuggestion = {
    service: "Outsourcing de Gestión Humana",
    topic: "Planificación de dotación para campañas estacionales",
    objective:
      "Ayudar a decidir cómo anticipar la dotación sin perder agilidad operativa.",
    audience: "Gerencias de Recursos Humanos y Operaciones",
    searchIntent: "Decidir",
    additionalContext:
      "Priorizar criterios verificables y evitar promesas absolutas.",
    differentiation:
      "Contrastar planificación, oportunidad y riesgos de ejecución.",
    summary: "Encargo diferenciado frente al historial del cliente.",
  };

  it("abre con un encargo nuevo, completo y editable", async () => {
    const onSuggest = vi.fn().mockResolvedValue(suggestion);
    render(
      <GenerateTitlesDialog
        open
        clientName="Adecco Perú"
        onOpenChange={vi.fn()}
        onSuggest={onSuggest}
        onGenerate={vi.fn()}
      />,
    );

    expect(onSuggest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Decidir/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Preparar sugerencia" }),
    );
    await screen.findByDisplayValue(suggestion.topic);
    expect(onSuggest).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      "Decidir",
    );
    expect(screen.getByLabelText("Tema principal")).toHaveValue(
      suggestion.topic,
    );
    expect(screen.getByLabelText("Objetivo editorial")).toHaveValue(
      suggestion.objective,
    );
    expect(screen.getByLabelText("Público")).toHaveValue(suggestion.audience);
    expect(
      screen.getByRole("button", { name: "Generar 5 propuestas" }),
    ).toBeEnabled();
  });

  it("envía exactamente el encargo editado por la persona", async () => {
    const onGenerate = vi.fn().mockResolvedValue({
      proposalCount: 5,
      costMicros: 1000,
    });
    render(
      <GenerateTitlesDialog
        open
        clientName="Adecco Perú"
        onOpenChange={vi.fn()}
        onSuggest={vi.fn().mockResolvedValue(suggestion)}
        onGenerate={onGenerate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Decidir/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Preparar sugerencia" }),
    );
    await screen.findByDisplayValue(suggestion.topic);
    fireEvent.change(screen.getByLabelText("Tema principal"), {
      target: { value: "Contratación temporal" },
    });
    fireEvent.change(screen.getByLabelText("Objetivo editorial"), {
      target: {
        value: "Explicar cómo planificar una campaña estacional con agilidad.",
      },
    });
    fireEvent.change(screen.getByLabelText("Público"), {
      target: { value: "Gerencias de Recursos Humanos" },
    });
    fireEvent.change(screen.getByLabelText("Contexto y límites editoriales"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Diferenciación requerida"), {
      target: { value: "" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Generar 5 propuestas" }),
    );

    await waitFor(() => expect(onGenerate).toHaveBeenCalledOnce());
    expect(onGenerate.mock.calls[0][0]).toEqual({
      topic: "Contratación temporal",
      service: "Outsourcing de Gestión Humana",
      objective:
        "Explicar cómo planificar una campaña estacional con agilidad.",
      audience: "Gerencias de Recursos Humanos",
      searchIntent: "Decidir",
      campaignYear: expect.any(Number),
      campaignMonth: expect.any(Number),
      count: 5,
      additionalContext: undefined,
    });
    expect(
      await screen.findByText("5 propuestas listas para revisar"),
    ).toBeInTheDocument();
  });

  it("muestra un progreso claro mientras prepara la sugerencia", async () => {
    let resolveSuggestion: (value: typeof suggestion) => void = () => undefined;
    const onSuggest = vi.fn(
      () =>
        new Promise<typeof suggestion>((resolve) => {
          resolveSuggestion = resolve;
        }),
    );
    render(
      <GenerateTitlesDialog
        open
        clientName="Adecco Perú"
        onOpenChange={vi.fn()}
        onSuggest={onSuggest}
        onGenerate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Comparar/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Preparar sugerencia" }),
    );

    expect(
      screen.getByRole("status", {
        name: "Preparando sugerencia editorial",
      }),
    ).toHaveTextContent("Estamos preparando tu sugerencia");
    expect(screen.getByText("Intención: Comparar")).toBeInTheDocument();

    resolveSuggestion({ ...suggestion, searchIntent: "Comparar" });
    await screen.findByDisplayValue(suggestion.topic);
  });
});
