import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportsWorkspace } from "./exports-workspace";
import type { ApiNoteSummary } from "./types";

const { apiFetch, apiFetchResponse, authState } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  apiFetchResponse: vi.fn(),
  authState: {
    tenantPermissions: [] as string[],
  },
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    apiFetch,
    apiFetchResponse,
    user: {
      id: "user-1",
      displayName: "Usuario de prueba",
      email: "prueba@mood.pe",
      permissions: [],
      tenantPermissions: authState.tenantPermissions,
      clientPermissions: {},
      clientIds: [],
    },
  }),
}));

const approvedNote: ApiNoteSummary = {
  id: "note-1",
  clientId: "client-1",
  titleProposalId: "title-1",
  status: "APPROVED",
  currentVersion: 1,
  clientApprovedCurrentVersion: true,
  approvedAt: "2026-08-26T12:00:00.000Z",
  createdAt: "2026-08-26T10:00:00.000Z",
  updatedAt: "2026-08-26T12:00:00.000Z",
  client: { name: "Adecco Perú", slug: "adecco-peru" },
  titleProposal: { generationRun: null },
  versions: [
    {
      title: "Nota aprobada para exportación",
      metaDescription: null,
      wordCount: 1_400,
      contentHash: "a".repeat(64),
      authorName: "Equipo editorial",
      _count: { sources: 3 },
    },
  ],
  qaEvaluations: [],
};

describe("ExportsWorkspace", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetchResponse.mockReset();
    authState.tenantPermissions = ["notes.export"];
    apiFetch.mockImplementation((path: string) =>
      Promise.resolve(path === "notes" ? [approvedNote] : []),
    );
  });

  it("oculta HTML a un usuario de demo aunque pueda exportar Word y PDF", async () => {
    render(<ExportsWorkspace />);

    expect(
      await screen.findByText("Nota aprobada para exportación"),
    ).toBeVisible();
    expect(screen.getByText("Word")).toBeVisible();
    expect(screen.getByText("PDF")).toBeVisible();
    expect(screen.queryByText("HTML")).not.toBeInTheDocument();
  });

  it("muestra HTML únicamente cuando la cuenta tiene el permiso administrativo", async () => {
    authState.tenantPermissions = ["notes.export", "notes.export_html"];
    render(<ExportsWorkspace />);

    expect(await screen.findByText("HTML")).toBeVisible();
    expect(screen.getByText("Word")).toBeVisible();
    expect(screen.getByText("PDF")).toBeVisible();
  });
});
