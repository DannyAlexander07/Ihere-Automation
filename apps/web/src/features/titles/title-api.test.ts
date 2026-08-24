import { describe, expect, it } from "vitest";
import { getTitleBlockingReasons } from "./rules";
import { mapApiTitle, type ApiTitle } from "./title-api";

const persistedTitle: ApiTitle = {
  id: "title-1",
  clientId: "client-1",
  title: "Cómo fortalecer la empleabilidad con decisiones informadas",
  objective: "Orientar una decisión concreta de empleabilidad.",
  audience: "Profesionales y líderes de recursos humanos",
  searchIntent: "Resolver",
  focus: "Acciones aplicables",
  opportunity: "Aportar conocimiento propio.",
  risk: "Verificar todas las fuentes.",
  status: "EVALUATING",
  duplicateScore: 20,
  duplicateResolution: "PENDING",
  currentVersion: 1,
  createdAt: "2026-08-15T20:00:00.000Z",
  updatedAt: "2026-08-15T20:00:00.000Z",
  client: { name: "Adecco Perú", slug: "adecco-peru" },
  evaluations: [
    {
      status: "QUEUED",
      verdict: null,
      overallScore: null,
      createdAt: "2026-08-15T20:01:00.000Z",
    },
  ],
};

describe("mapApiTitle", () => {
  it("no inventa agentes ni puntajes mientras la evaluación está pendiente", () => {
    const candidate = mapApiTitle(persistedTitle, "Alexander");
    expect(candidate.agents).toEqual([]);
    expect(candidate.score).toBe(0);
    expect(candidate.evaluationStatus).toBe("QUEUED");
    expect(getTitleBlockingReasons(candidate)).toContain(
      "La evaluación especializada todavía no ha finalizado.",
    );
  });

  it("considera resuelta una duplicidad baja sin exigir una decisión adicional", () => {
    const candidate = mapApiTitle(persistedTitle, "Alexander");
    expect(candidate.duplicate.level).toBe("low");
    expect(candidate.duplicate.resolved).toBe(true);
  });
});
