import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { initialTitleCandidates } from "./fixtures";
import { TitleDetailSheet } from "./title-detail-sheet";

describe("TitleDetailSheet", () => {
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
        permissions={{
          canEditAndEvaluate: true,
          canReview: true,
          canShare: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByLabelText("Objetivo editorial")).toHaveValue(
      candidate.objective,
    );
    expect(screen.getByLabelText("Público")).toHaveValue(candidate.audience);
    expect(screen.getByLabelText("Intención")).toHaveValue(candidate.intent);
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
    fireEvent.change(screen.getByLabelText("Motivo"), {
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
