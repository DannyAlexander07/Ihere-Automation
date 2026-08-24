import { describe, expect, it } from "vitest";
import {
  compareNoteVersions,
  parseQaEvidence,
  parseQaFindings,
  type NoteVersion,
} from "./note-history";

function version(overrides: Partial<NoteVersion> = {}): NoteVersion {
  return {
    id: "version-1",
    version: 1,
    title: "Título original",
    metaTitle: null,
    metaDescription: null,
    slug: "titulo-original",
    excerpt: "Extracto original suficientemente descriptivo.",
    content: {
      schemaVersion: 1,
      blocks: [{ id: "p-1", type: "paragraph", text: "Texto original" }],
    },
    wordCount: 100,
    contentHash: "hash-1",
    source: "HUMAN",
    correctionType: null,
    changeReason: null,
    authorName: null,
    authorRole: null,
    ctaText: null,
    ctaUrl: null,
    internalLinks: [],
    createdAt: "2026-08-15T10:00:00.000Z",
    sources: [],
    ...overrides,
  };
}

describe("note history utilities", () => {
  it("compara una versión histórica con la vigente sin marcar campos idénticos", () => {
    const differences = compareNoteVersions(
      version(),
      version({
        id: "version-2",
        version: 2,
        title: "Título corregido",
        wordCount: 130,
        contentHash: "hash-2",
      }),
    );

    expect(differences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "title",
          selectedValue: "Título original",
          currentValue: "Título corregido",
        }),
        expect.objectContaining({
          key: "content",
          selectedValue: "100 palabras · 1 bloque",
          currentValue: "130 palabras · 1 bloque",
        }),
      ]),
    );
    expect(differences.some((item) => item.key === "slug")).toBe(false);
  });

  it("extrae findings únicamente desde listas de texto y limita contenido", () => {
    expect(
      parseQaFindings([" Hallazgo útil ", 9, null, { text: "no" }]),
    ).toEqual(["Hallazgo útil"]);
    expect(parseQaFindings({ findings: ["no"] })).toEqual([]);
  });

  it("presenta evidencia primitiva sin renderizar objetos desconocidos", () => {
    expect(
      parseQaEvidence({
        wordCount: 850,
        hasPrimarySource: true,
        tags: ["SEO", "GEO"],
        nested: { unsafe: "no se muestra" },
      }),
    ).toEqual([
      { key: "wordCount", label: "Palabras", value: "850" },
      {
        key: "hasPrimarySource",
        label: "Fuente prioritaria",
        value: "Sí",
      },
      { key: "tags", label: "Tags", value: "SEO · GEO" },
    ]);
    expect(parseQaEvidence(["dato"])).toEqual([]);
  });
});
