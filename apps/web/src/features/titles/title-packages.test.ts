import { describe, expect, it } from "vitest";
import { groupTitleCandidates, groupTitleFolders } from "./title-packages";
import type { TitleCandidate } from "./types";

function candidate(
  id: string,
  packageId?: string,
  createdAt = "2026-08-17T10:00:00.000Z",
): TitleCandidate {
  return {
    id,
    package: packageId
      ? {
          id: packageId,
          topic: "Gestión del talento",
          year: 2026,
          month: 8,
          folderKey: `adecco-peru/2026/08/${packageId}`,
          createdAt,
          requestedBy: "Alexander",
        }
      : undefined,
    title: `Título ${id}`,
    service: "Training & Consulting",
    client: "Adecco Perú",
    campaign: "agosto de 2026",
    objective: "Objetivo",
    audience: "Audiencia",
    intent: "Resolver",
    focus: "Enfoque",
    opportunity: "Oportunidad",
    risk: "Riesgo",
    status: "proposed",
    score: 90,
    owner: "Alexander",
    createdAtIso: createdAt,
    updatedAt: createdAt,
    tags: [],
    duplicate: {
      score: 0,
      level: "low",
      relatedTitle: "",
      relatedDate: "",
      recommendation: "Crear",
      resolved: true,
    },
    agents: [],
    history: [],
  };
}

describe("groupTitleCandidates", () => {
  it("mantiene juntos los títulos de la misma sesión", () => {
    const groups = groupTitleCandidates([
      candidate("a", "run-1"),
      candidate("b", "run-1"),
      candidate("c", "run-2", "2026-08-16T10:00:00.000Z"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].id).toBe("run-1");
    expect(groups[0].candidates.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("no mezcla propuestas manuales", () => {
    const groups = groupTitleCandidates([candidate("a"), candidate("b")]);
    expect(groups.map((group) => group.id)).toEqual(["manual:a", "manual:b"]);
  });

  it("no reutiliza una fecha visible localizada como fecha técnica", () => {
    const manual = candidate("a");
    manual.createdAtIso = undefined;
    manual.updatedAt = "16 ago. 2026, 3:08 a. m.";

    const [group] = groupTitleCandidates([manual]);

    expect(group.createdAt).toBeNull();
  });

  it("reúne varias sesiones dentro del mismo directorio editorial", () => {
    const firstRun = candidate("a", "run-1");
    const secondRun = candidate("b", "run-2");
    firstRun.package!.folderKey = "adecco-peru/2026/08/gestion-del-talento";
    secondRun.package!.folderKey = "adecco-peru/2026/08/gestion-del-talento";

    const folders = groupTitleFolders([firstRun, secondRun]);

    expect(folders).toHaveLength(1);
    expect(folders[0]).toMatchObject({
      client: "Adecco Perú",
      year: 2026,
      month: 8,
      topic: "Gestión del talento",
    });
    expect(folders[0].packages.map((item) => item.id)).toEqual([
      "run-1",
      "run-2",
    ]);
    expect(folders[0].candidates.map((item) => item.id)).toEqual(["a", "b"]);
  });
});
