import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActionPlan } from "./action-plan";
import type { AnalyticsActionPlanItem } from "./types";

const item: AnalyticsActionPlanItem = {
  id: "technical",
  front: "URLs, canónicos, redirecciones y plantilla",
  priority: "ALTA",
  status: "PENDING",
  moodOwner: "Mood · SEO Técnico",
  moodAction: "Auditar las URLs afectadas.",
  clientOwner: "Tecnología/Web del cliente",
  clientAction: "Aplicar los cambios en el CMS.",
  dependency: "Confirmación de la URL definitiva.",
  dueDate: "2026-09-15",
  evidence: "2 señales sustentadas en GSC.",
  validation: "Revisar canonical e indexación.",
  recommendationCount: 2,
  repeatedCount: 1,
};

describe("ActionPlan", () => {
  it("separa las acciones de Mood y del cliente con seguimiento concreto", () => {
    render(<ActionPlan items={[item]} clientName="Adecco Perú" />);

    expect(
      screen.getByRole("heading", { name: "Plan de acción" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Mood · SEO Técnico")).toBeInTheDocument();
    expect(screen.getByText("Tecnología/Web de Adecco Perú")).toBeInTheDocument();
    expect(screen.getByText(/15 (?:set|sept)\.? 2026/)).toBeInTheDocument();
    expect(screen.getByText("Revisar canonical e indexación.")).toBeInTheDocument();
  });

  it("explica el estado vacío sin inventar actividades", () => {
    render(<ActionPlan items={[]} clientName="Adecco Perú" />);

    expect(
      screen.getByText(/No hay acciones pendientes sustentadas/i),
    ).toBeInTheDocument();
  });
});
