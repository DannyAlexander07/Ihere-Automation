import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TitlePackageList } from "./title-package-list";
import type { TitleCandidate } from "./types";

function candidate(index: number): TitleCandidate {
  return {
    id: `title-${index}`,
    title: `Título del expediente ${index}`,
    client: "Adecco Perú",
    campaign: "Agosto de 2026",
    objective: "Orientar una decisión concreta.",
    audience: "Gerencias de Recursos Humanos",
    intent: "Resolver",
    focus: "Aplicación práctica",
    opportunity: "Aportar claridad.",
    risk: "Evitar afirmaciones sin respaldo.",
    status: "proposed",
    score: 90,
    owner: "Administrador local",
    updatedAt: "18 ago. 2026",
    tags: [],
    duplicate: {
      score: 5,
      level: "low",
      relatedTitle: "",
      relatedDate: "",
      recommendation: "Crear",
      resolved: true,
    },
    agents: [],
    history: [],
    package: {
      id: `package-${index}`,
      topic: `Expediente editorial ${index}`,
      year: 2026,
      month: index,
      folderKey: `adecco:2026:${index}`,
      createdAt: `2026-${String(index).padStart(2, "0")}-01T12:00:00.000Z`,
      requestedBy: "Administrador local",
    },
  };
}

describe("TitlePackageList", () => {
  it("pagina los expedientes en grupos de seis", () => {
    render(
      <TitlePackageList
        candidates={Array.from({ length: 7 }, (_, index) =>
          candidate(index + 1),
        )}
        canShare
        canRevise
        revisingPackageId={null}
        onSelect={vi.fn()}
        onSharePackage={vi.fn()}
        onRevisePackage={vi.fn()}
      />,
    );

    expect(screen.getByText("Página 1 de 2 · 7 expedientes")).toBeVisible();
    expect(
      screen.queryByText("Expediente editorial 1"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Expediente editorial 7")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));

    expect(screen.getByText("Página 2 de 2 · 7 expedientes")).toBeVisible();
    expect(screen.getByText("Expediente editorial 1")).toBeVisible();
    expect(
      screen.queryByText("Expediente editorial 7"),
    ).not.toBeInTheDocument();
  });

  it("abre una vista previa interna y permite enviar la propuesta al editor", () => {
    const onSelect = vi.fn();
    render(
      <TitlePackageList
        candidates={[candidate(1)]}
        canShare
        canRevise
        revisingPackageId={null}
        onSelect={onSelect}
        onSharePackage={vi.fn()}
        onRevisePackage={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Expediente editorial 1/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Vista previa interna" }),
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeVisible();
    expect(
      within(dialog).getByRole("heading", {
        level: 2,
        name: "Título del expediente 1",
      }),
    ).toBeVisible();
    expect(
      within(dialog).getByText("Orientar una decisión concreta."),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Editar esta propuesta" }),
    );
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "title-1" }),
    );
  });
});
