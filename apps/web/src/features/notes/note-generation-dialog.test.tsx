import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoteGenerationDialog } from "./note-generation-dialog";

describe("NoteGenerationDialog", () => {
  it("inicia automáticamente una sola vez y no pide indicaciones repetidas", async () => {
    let resolveGeneration: (value: {
      proposalCount: number;
      costMicros: number;
    }) => void = () => undefined;
    const onGenerate = vi.fn(
      () =>
        new Promise<{ proposalCount: number; costMicros: number }>((resolve) => {
          resolveGeneration = resolve;
        }),
    );
    const { rerender } = render(
      <NoteGenerationDialog
        open
        autoStart
        onOpenChange={vi.fn()}
        onGenerate={onGenerate}
      />,
    );

    expect(screen.queryByText("Indicaciones adicionales")).toBeNull();
    await waitFor(() => expect(onGenerate).toHaveBeenCalledOnce());
    expect(screen.getByText("Preparando la ejecución segura")).toBeVisible();

    rerender(
      <NoteGenerationDialog
        open
        autoStart
        onOpenChange={vi.fn()}
        onGenerate={onGenerate}
      />,
    );
    expect(onGenerate).toHaveBeenCalledOnce();
    await act(async () => {
      resolveGeneration({ proposalCount: 1, costMicros: 1_000 });
    });
    expect(
      await screen.findByText("Borrador generado y enviado a QA"),
    ).toBeVisible();
  });

  it("permite iniciar manualmente usando el brief completo", async () => {
    const onGenerate = vi.fn().mockResolvedValue({
      proposalCount: 1,
      costMicros: 1_000,
    });
    render(
      <NoteGenerationDialog
        open
        onOpenChange={vi.fn()}
        onGenerate={onGenerate}
      />,
    );

    expect(screen.getByText("Brief completo y listo")).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Investigar y redactar" }));

    await waitFor(() => expect(onGenerate).toHaveBeenCalledOnce());
  });
});
