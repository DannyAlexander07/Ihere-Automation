import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminConfigurationWorkspace } from "./admin-configuration-workspace";

const { apiFetchMock, authState } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  authState: { user: null as null | { tenantPermissions: string[] } },
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ apiFetch: apiFetchMock, user: authState.user }),
}));

describe("AdminConfigurationWorkspace", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    authState.user = { tenantPermissions: [] };
  });

  it("muestra 403 sin permisos administrativos", () => {
    render(<AdminConfigurationWorkspace />);
    expect(screen.getByRole("heading", { name: "Acceso restringido" })).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("muestra la bitácora a quien tiene audit.read sin exponer catálogos", async () => {
    authState.user = { tenantPermissions: ["audit.read"] };
    apiFetchMock.mockResolvedValue({
      items: [{ id: "audit-1", actorType: "USER", action: "admin.user.updated", entityType: "User", entityId: "user-2", requestId: null, ipAddress: null, userAgent: null, before: { displayName: "Antes" }, after: { displayName: "Después" }, metadata: null, createdAt: "2026-08-16T20:00:00.000Z", user: { id: "admin-1", displayName: "Administrador", email: null }, client: null }],
      page: 1, pageSize: 25, total: 1, totalPages: 1,
    });
    render(<AdminConfigurationWorkspace />);
    expect(await screen.findByText("admin.user.updated")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Catálogos" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Ver cambios registrados"));
    expect(screen.getAllByText(/Después/).length).toBeGreaterThan(0);
  });

  it("carga roles y clientes solo con users.manage y roles.manage", async () => {
    authState.user = { tenantPermissions: ["users.manage", "roles.manage"] };
    apiFetchMock.mockImplementation((path: string) => path === "admin/roles"
      ? Promise.resolve([{ id: "role-1", code: "tenant-admin", name: "Administrador", description: "Control organizacional", isSystem: true, permissions: [{ code: "users.manage", description: "Usuarios" }], assignmentCount: 1, clientAssignable: false }])
      : Promise.resolve([{ id: "client-1", slug: "adecco-peru", name: "Adecco Perú", active: true }]));
    render(<AdminConfigurationWorkspace />);
    expect(await screen.findByText("tenant-admin")).toBeInTheDocument();
    expect(screen.getByText("Adecco Perú")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Bitácora" })).not.toBeInTheDocument();
  });
});
