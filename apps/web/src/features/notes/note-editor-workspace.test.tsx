import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/features/auth/auth-provider";
import { NoteEditorWorkspace } from "./note-editor-workspace";
import type { ApiNoteDetail } from "./types";

const { apiFetchMock, authState, generationDialogMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  authState: { user: null as AuthUser | null },
  generationDialogMock: vi.fn(),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ apiFetch: apiFetchMock, user: authState.user }),
}));

vi.mock("./note-generation-dialog", () => ({
  NoteGenerationDialog: (props: object) => {
    generationDialogMock(props);
    return null;
  },
}));

vi.mock("@/features/client-review/review-link-dialog", () => ({
  ReviewLinkDialog: () => null,
}));

const fullClientPermissions = [
  "notes.edit",
  "notes.qa",
  "notes.review",
  "notes.approve",
  "review_links.manage",
  "ai.generate",
];

function user(clientPermissions = fullClientPermissions): AuthUser {
  return {
    id: "user-1",
    displayName: "Editora",
    email: "editora@mood.pe",
    permissions: fullClientPermissions,
    tenantPermissions: [],
    clientPermissions: { "client-a": clientPermissions },
    clientIds: ["client-a"],
  };
}

function note(status: ApiNoteDetail["status"] = "DRAFT"): ApiNoteDetail {
  return {
    id: "note-1",
    clientId: "client-a",
    titleProposalId: "title-1",
    status,
    currentVersion: 2,
    approvedAt: null,
    createdAt: "2026-08-15T10:00:00.000Z",
    updatedAt: "2026-08-16T12:00:00.000Z",
    client: { name: "Adecco Perú", slug: "adecco-peru" },
    briefSnapshot: {},
    titleProposal: {
      id: "title-1",
      title: "Título de propuesta",
      objective: "Orientar una decisión.",
      audience: "Recursos Humanos",
      searchIntent: "Aprender",
      focus: "Gestión del talento",
    },
    versions: [
      {
        id: "version-2",
        version: 2,
        title: "Título vigente corregido",
        metaTitle: "Meta title vigente",
        metaDescription: "Descripción vigente de la nota editorial.",
        slug: "titulo-vigente-corregido",
        excerpt: "Extracto vigente con la corrección editorial solicitada.",
        content: {
          schemaVersion: 1,
          blocks: [
            {
              id: "p-2",
              type: "paragraph",
              text: "Contenido vigente verificable.",
            },
            {
              id: "p-source",
              type: "paragraph",
              text: "Fuente: [norma oficial](https://example.com/normas?articulo=1&utm_source=openai).",
            },
          ],
        },
        wordCount: 180,
        contentHash: "hash-current",
        source: "HUMAN",
        correctionType: "STYLE",
        changeReason: "Corregir claridad.",
        authorName: "Especialista Adecco",
        authorRole: "Consultoría",
        ctaText: "Conversa con Adecco.",
        ctaUrl: "https://www.adecco.com/es-pe",
        internalLinks: ["https://www.adecco.com/es-pe/blog"],
        createdAt: "2026-08-16T12:00:00.000Z",
        sources: [],
      },
      {
        id: "version-1",
        version: 1,
        title: "Título histórico original",
        metaTitle: null,
        metaDescription: null,
        slug: "titulo-historico-original",
        excerpt: "Extracto histórico antes de recibir las correcciones.",
        content: {
          schemaVersion: 1,
          blocks: [
            {
              id: "p-1",
              type: "paragraph",
              text: "Contenido histórico verificable.",
            },
          ],
        },
        wordCount: 120,
        contentHash: "hash-history",
        source: "SYSTEM",
        correctionType: null,
        changeReason: "Crear expediente inicial.",
        authorName: null,
        authorRole: null,
        ctaText: null,
        ctaUrl: null,
        internalLinks: [],
        createdAt: "2026-08-15T10:00:00.000Z",
        sources: [],
      },
    ],
    qaEvaluations: [
      {
        id: "qa-1",
        version: 1,
        status: "COMPLETED",
        verdict: "REVIEW",
        overallScore: 65,
        summary: "La primera versión necesita ajustes.",
        criticalBlockers: [],
        createdAt: "2026-08-15T11:00:00.000Z",
        results: [
          {
            id: "result-1",
            dimension: "SEO_EDITORIAL",
            score: 8,
            maxScore: 15,
            verdict: "REVIEW",
            summary: "Faltan metadatos editoriales.",
            findings: ["Falta meta title", 10, { ignored: true }],
            evidence: {
              hasMetaTitle: false,
              internalLinkCount: 0,
              nested: { ignored: true },
            },
            ruleVersion: "note-qa-v1",
          },
        ],
      },
    ],
    decisions: [],
    exports: [],
  };
}

function blankInitialNote(
  status: ApiNoteDetail["status"] = "DRAFT",
): ApiNoteDetail {
  const initial = note(status);
  return {
    ...initial,
    currentVersion: 1,
    versions: [
      {
        ...initial.versions[1],
        id: "version-1",
        version: 1,
        title: initial.titleProposal.title,
        content: { schemaVersion: 1, blocks: [] },
        wordCount: 0,
        sources: [],
      },
    ],
    qaEvaluations: [],
  };
}

describe("NoteEditorWorkspace", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    generationDialogMock.mockReset();
    authState.user = user();
    apiFetchMock.mockResolvedValue(note());
  });

  it("abre la generación automática para una nota inicial vacía usando solo el brief", async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "ai/generations/notes/note-1") {
        return Promise.resolve({
          id: "run-1",
          status: "COMPLETED",
          model: "editorial-model",
          costMicros: 1_000,
          agentResults: [],
          noteVersions: [
            { id: "version-1", noteId: "note-1", version: 1, title: "Título" },
          ],
        });
      }
      return Promise.resolve(blankInitialNote());
    });

    render(<NoteEditorWorkspace noteId="note-1" />);

    await waitFor(() =>
      expect(generationDialogMock).toHaveBeenCalledWith(
        expect.objectContaining({ open: true, autoStart: true }),
      ),
    );
    const props = generationDialogMock.mock.calls.at(-1)?.[0] as {
      onGenerate: (onProgress: () => void) => Promise<unknown>;
    };
    await act(async () => {
      await props.onGenerate(vi.fn());
    });

    expect(apiFetchMock).toHaveBeenCalledWith("ai/generations/notes/note-1", {
      method: "POST",
      body: JSON.stringify({ expectedVersion: 1 }),
    });
  });

  it("muestra progreso al recargar una nota inicial que ya se está generando", async () => {
    apiFetchMock.mockResolvedValue(blankInitialNote("GENERATING"));

    render(<NoteEditorWorkspace noteId="note-1" />);

    expect(await screen.findByText("Borrador en preparación")).toBeVisible();
    expect(screen.getByText(/se actualizará automáticamente/i)).toBeVisible();
    expect(screen.queryByDisplayValue("Título de propuesta")).toBeNull();
  });

  it("selecciona una versión histórica, compara cambios y muestra su QA real", async () => {
    render(<NoteEditorWorkspace noteId="note-1" />);

    expect(
      await screen.findByDisplayValue("Título vigente corregido"),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Guardar versión" }),
    ).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Versión mostrada"), {
      target: { value: "1" },
    });

    expect(
      screen.getByDisplayValue("Título histórico original"),
    ).toBeDisabled();
    expect(
      screen.getByLabelText("Comparación de versiones"),
    ).toBeInTheDocument();
    expect(screen.getByText("Título vigente corregido")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Guardar versión" }),
    ).toBeNull();
    expect(screen.getByText("Falta meta title")).toBeInTheDocument();
    expect(screen.getAllByText("Meta title").length).toBeGreaterThan(0);
    expect(screen.getByText("No")).toBeInTheDocument();
    expect(screen.queryByText("[object Object]")).toBeNull();
  }, 15_000);

  it("permite revisar la nota como artículo y volver al editor antes de compartirla", async () => {
    render(<NoteEditorWorkspace noteId="note-1" />);

    expect(
      await screen.findByDisplayValue("Título vigente corregido"),
    ).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Vista previa" }));

    expect(screen.getByText("Vista previa interna")).toBeVisible();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Título vigente corregido",
      }),
    ).toBeVisible();
    expect(screen.getByText("Contenido vigente verificable.")).toBeVisible();
    expect(screen.getByRole("link", { name: "norma oficial" })).toHaveAttribute(
      "href",
      "https://example.com/normas?articulo=1",
    );
    expect(screen.queryByText(/utm_source=openai/)).toBeNull();
    expect(screen.queryByDisplayValue("Título vigente corregido")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByDisplayValue("Título vigente corregido")).toBeEnabled();
  });

  it("abre la evidencia de QA con retorno a la cola de calidad", async () => {
    apiFetchMock.mockResolvedValue(note("READY_FOR_REVIEW"));

    render(<NoteEditorWorkspace noteId="note-1" origin="quality" />);

    expect(
      await screen.findByRole("link", {
        name: "Volver a control de calidad",
      }),
    ).toHaveAttribute("href", "/automatizacion/calidad");
    const evidence = document.getElementById("qa-evidence");
    expect(evidence).toBeInTheDocument();
    expect(
      within(evidence!).getByText(/Control de calidad · v\d+/i),
    ).toBeVisible();
  });

  it("permite crear una versión corregida después del QA sin reutilizar esa evaluación", async () => {
    apiFetchMock.mockResolvedValue(note("READY_FOR_REVIEW"));

    render(<NoteEditorWorkspace noteId="note-1" />);

    expect(
      await screen.findByDisplayValue("Título vigente corregido"),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Guardar nueva versión" }),
    ).toBeEnabled();
    expect(
      screen.getByText("Puedes revisar y editar antes de compartir"),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Enviar a QA" })).toBeNull();
  });

  it("vuelve a borrador y habilita QA después de guardar la corrección revisable", async () => {
    apiFetchMock
      .mockResolvedValueOnce(note("READY_FOR_REVIEW"))
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(note("DRAFT"));

    render(<NoteEditorWorkspace noteId="note-1" />);

    fireEvent.change(
      await screen.findByLabelText("Motivo de esta nueva versión"),
      {
        target: {
          value: "Ajustar el contenido después de la revisión interna.",
        },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar nueva versión" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Enviar a QA" })).toBeEnabled(),
    );
    expect(apiFetchMock).toHaveBeenCalledWith(
      "notes/note-1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(
      screen.queryByRole("button", { name: "Compartir con cliente" }),
    ).toBeNull();
  });

  it("no usa permisos agregados de otro cliente para habilitar acciones", async () => {
    authState.user = {
      ...user([]),
      permissions: fullClientPermissions,
      clientPermissions: { "client-b": fullClientPermissions },
      clientIds: ["client-b"],
    };

    render(<NoteEditorWorkspace noteId="note-1" />);

    expect(
      await screen.findByDisplayValue("Título vigente corregido"),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Generar borrador" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Guardar versión" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enviar a QA" })).toBeDisabled();
  });

  it("separa permisos de revisión, aprobación y enlace de cliente", async () => {
    authState.user = user(["notes.approve", "review_links.manage"]);
    apiFetchMock.mockResolvedValue(note("READY_FOR_REVIEW"));

    render(<NoteEditorWorkspace noteId="note-1" />);

    await waitFor(() =>
      expect(screen.getByText("Título vigente corregido")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Compartir con cliente" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Aprobar" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Solicitar cambios" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull();
  });
});
