import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { initialTitleCandidates } from "./fixtures";
import { TitleDetailSheet } from "./title-detail-sheet";

describe("TitleDetailSheet", () => {
  it.each([
    [
      "Título",
      "Guía práctica para tomar mejores decisiones sobre talento en empresas peruanas",
    ],
    [
      "Objetivo editorial",
      "Nuevo objetivo editorial verificable para la nota.",
    ],
    ["Público", "Gerencias y equipos de Recursos Humanos"],
    [
      "Enfoque",
      "Criterios prácticos y verificables para la toma de decisiones",
    ],
    ["Oportunidad", "Aportar una herramienta útil y diferenciada."],
    [
      "Riesgo a evitar",
      "No presentar afirmaciones sin respaldo institucional.",
    ],
  ])(
    "habilita el guardado al modificar el bloque %s sin exigir un motivo manual",
    (label, value) => {
      const candidate = initialTitleCandidates.find(
        (item) => item.status === "proposed",
      )!;
      const onEdit = vi.fn();
      render(
        <TitleDetailSheet
          candidate={candidate}
          open
          onOpenChange={vi.fn()}
          onDecision={vi.fn()}
          onEdit={onEdit}
          onResolveDuplicate={vi.fn()}
          onShare={vi.fn()}
          onDelete={vi.fn()}
          permissions={{
            canEditAndEvaluate: true,
            canReview: true,
            canShare: true,
            canDelete: true,
          }}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Editar" }));
      const saveButton = screen.getByRole("button", {
        name: "Guardar y reevaluar",
      });
      expect(saveButton).toBeDisabled();

      fireEvent.change(screen.getByLabelText(label), {
        target: { value },
      });

      expect(saveButton).toBeEnabled();
      fireEvent.click(saveButton);
      expect(onEdit).toHaveBeenCalledWith(
        candidate.id,
        expect.objectContaining({
          [{
            Título: "title",
            "Objetivo editorial": "objective",
            Público: "audience",
            Enfoque: "focus",
            Oportunidad: "opportunity",
            "Riesgo a evitar": "risk",
          }[label]!]: value,
        }),
        "one_off",
        "Corrección editorial realizada durante la revisión interna.",
        false,
      );
    },
  );

  it("permite corregir todos los datos editoriales de la propuesta", () => {
    const candidate = initialTitleCandidates.find(
      (item) => item.status === "proposed",
    )!;
    const onEdit = vi.fn();
    render(
      <TitleDetailSheet
        candidate={candidate}
        open
        onOpenChange={vi.fn()}
        onDecision={vi.fn()}
        onEdit={onEdit}
        onResolveDuplicate={vi.fn()}
        onShare={vi.fn()}
        onDelete={vi.fn()}
        permissions={{
          canEditAndEvaluate: true,
          canReview: true,
          canShare: true,
          canDelete: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByLabelText("Objetivo editorial")).toHaveValue(
      candidate.objective,
    );
    expect(screen.getByLabelText("Público")).toHaveValue(candidate.audience);
    expect(screen.queryByLabelText("Intención")).not.toBeInTheDocument();
    expect(screen.getByText("Solo lectura")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Se conserva la intención definida al preparar el título.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Enfoque")).toHaveValue(candidate.focus);
    expect(screen.getByLabelText("Oportunidad")).toHaveValue(
      candidate.opportunity,
    );
    expect(screen.getByLabelText("Riesgo a evitar")).toHaveValue(
      candidate.risk,
    );

    fireEvent.change(screen.getByLabelText("Objetivo editorial"), {
      target: { value: "Nuevo objetivo editorial verificable para la nota." },
    });
    fireEvent.change(screen.getByLabelText("Motivo (opcional)"), {
      target: { value: "Ajuste solicitado durante la revisión interna." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar y reevaluar" }),
    );

    expect(onEdit).toHaveBeenCalledWith(
      candidate.id,
      expect.objectContaining({
        title: candidate.title,
        objective: "Nuevo objetivo editorial verificable para la nota.",
        audience: candidate.audience,
        searchIntent: candidate.intent,
        focus: candidate.focus,
        opportunity: candidate.opportunity,
        risk: candidate.risk,
      }),
      "one_off",
      "Ajuste solicitado durante la revisión interna.",
      false,
    );
  });
});
