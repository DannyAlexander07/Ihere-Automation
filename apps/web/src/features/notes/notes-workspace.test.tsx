import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotesWorkspace } from "./notes-workspace";

const { apiFetchMock, pushMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    apiFetch: apiFetchMock,
    user: {
      permissions: ["notes.create"],
      tenantPermissions: [],
      clientPermissions: { "client-a": ["notes.create"] },
      clientIds: ["client-a"],
    },
  }),
}));

const approvedTitle = {
  id: "title-approved",
  clientId: "client-a",
  title: "Cómo ordenar la cobertura operativa en Facility Management",
  objective: "Orientar una decisión con criterios verificables.",
  audience: "Gerencias de Recursos Humanos",
  searchIntent: "Resolver",
  focus: "Continuidad operativa",
  opportunity: null,
  risk: null,
  status: "APPROVED",
  duplicateScore: 0,
  duplicateResolution: "UNIQUE",
  currentVersion: 1,
  createdAt: "2026-08-19T10:00:00.000Z",
  updatedAt: "2026-08-19T10:00:00.000Z",
  client: { id: "client-a", name: "Adecco Perú", slug: "adecco-peru" },
  evaluations: [],
};

describe("NotesWorkspace", () => {
  beforeEach(() => {
    pushMock.mockReset();
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "clients") {
        return Promise.resolve([
          { id: "client-a", name: "Adecco Perú", slug: "adecco-peru", active: true },
        ]);
      }
      if (path.startsWith("notes?") && !options) return Promise.resolve([]);
      if (path.startsWith("titles?")) return Promise.resolve([approvedTitle]);
      if (path === "notes" && options?.method === "POST") {
        return Promise.resolve({ id: "note-created" });
      }
      return Promise.resolve([]);
    });
  });

  it("abre directamente el expediente creado para iniciar su borrador", async () => {
    render(<NotesWorkspace />);

    const createButton = await screen.findByRole("button", {
      name: "Crear desde título aprobado",
    });
    expect(createButton).toBeEnabled();
    fireEvent.click(createButton);
    fireEvent.click(
      screen.getByRole("button", {
        name: /Cómo ordenar la cobertura operativa en Facility Management/,
      }),
    );

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith("notes", {
        method: "POST",
        body: JSON.stringify({ titleProposalId: "title-approved" }),
      }),
    );
    expect(pushMock).toHaveBeenCalledWith(
      "/automatizacion/notas/note-created",
    );
  });
});
