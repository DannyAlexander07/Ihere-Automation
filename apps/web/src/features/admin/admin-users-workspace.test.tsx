import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminUsersWorkspace } from "./admin-users-workspace";
import type { AdminUser, Paginated } from "./admin-types";

const { apiFetchMock, authState } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  authState: {
    user: null as null | { id: string; tenantPermissions: string[] },
  },
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ apiFetch: apiFetchMock, user: authState.user }),
}));

const managedUser: AdminUser = {
  id: "user-2",
  displayName: "Sam Redacción",
  email: "sam@mood.pe",
  status: "ACTIVE",
  mfaRequired: false,
  lastLoginAt: null,
  createdAt: "2026-08-16T20:00:00.000Z",
  updatedAt: "2026-08-16T20:00:00.000Z",
  activeSessionCount: 2,
  roles: [],
};

const page: Paginated<AdminUser> = {
  items: [managedUser],
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};

describe("AdminUsersWorkspace", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    authState.user = { id: "admin-1", tenantPermissions: ["users.manage"] };
    apiFetchMock.mockImplementation((path: string) => {
      if (path.startsWith("admin/users?")) return Promise.resolve(page);
      if (path === "admin/users")
        return Promise.resolve({
          ...managedUser,
          id: "user-3",
          displayName: "Nueva Editora",
          email: "editora@example.invalid",
        });
      if (path === "admin/users/user-2")
        return Promise.resolve({ ...managedUser, activeSessionCount: 0 });
      return Promise.resolve({ success: true, revokedSessions: 2 });
    });
  });

  it("muestra 403 y no consulta el API sin users.manage tenant-wide", () => {
    authState.user = { id: "viewer", tenantPermissions: [] };
    render(<AdminUsersWorkspace />);
    expect(
      screen.getByRole("heading", { name: "Acceso restringido" }),
    ).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("carga usuarios reales y oculta asignaciones de roles sin roles.manage", async () => {
    render(<AdminUsersWorkspace />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Gestionar a Sam Redacción" }),
    );
    expect(screen.getAllByText(/Necesitas el permiso de roles/)).toHaveLength(
      2,
    );
    expect(
      screen.queryByRole("button", { name: "Asignar rol" }),
    ).not.toBeInTheDocument();
  });

  it("revoca sesiones y confirma el resultado de manera accesible", async () => {
    render(<AdminUsersWorkspace />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Gestionar a Sam Redacción" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Revocar sesiones" }));
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        "admin/users/user-2/sessions/revoke",
        { method: "POST", body: "{}" },
      ),
    );
    expect(
      (await screen.findAllByText("Se revocaron todas las sesiones activas."))
        .length,
    ).toBeGreaterThan(0);
  });

  it("crea una cuenta con los datos explícitos del formulario", async () => {
    render(<AdminUsersWorkspace />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Crear usuario" }),
    );
    fireEvent.change(screen.getByLabelText("Nombre completo"), {
      target: { value: "Nueva Editora" },
    });
    fireEvent.change(screen.getByLabelText("Correo de acceso"), {
      target: { value: "editora@example.invalid" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña temporal"), {
      target: { value: "ClaveTemporal2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith("admin/users", {
        method: "POST",
        body: JSON.stringify({
          displayName: "Nueva Editora",
          email: "editora@example.invalid",
          password: "ClaveTemporal2026",
        }),
      }),
    );
    expect(
      (
        await screen.findAllByText(
          "La cuenta fue creada. Completa ahora su matriz de accesos.",
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it("habilita la asignación solo con ambos permisos organizacionales", async () => {
    authState.user = {
      id: "admin-1",
      tenantPermissions: ["users.manage", "roles.manage"],
    };
    apiFetchMock.mockImplementation((path: string) => {
      if (path.startsWith("admin/users?")) return Promise.resolve(page);
      if (path === "admin/roles")
        return Promise.resolve([
          {
            id: "role-1",
            code: "editor",
            name: "Editor",
            description: null,
            isSystem: true,
            permissions: [],
            assignmentCount: 0,
            clientAssignable: true,
          },
        ]);
      if (path === "admin/clients") return Promise.resolve([]);
      return Promise.resolve(managedUser);
    });
    render(<AdminUsersWorkspace />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Gestionar a Sam Redacción" }),
    );
    expect(
      screen.getByRole("button", { name: "Asignar rol" }),
    ).toBeInTheDocument();
  });

  it("habilita un submódulo para un cliente desde la matriz visible", async () => {
    authState.user = {
      id: "admin-1",
      tenantPermissions: ["users.manage", "roles.manage"],
    };
    apiFetchMock.mockImplementation((path: string) => {
      if (path.startsWith("admin/users?")) return Promise.resolve(page);
      if (path === "admin/users/user-2") return Promise.resolve(managedUser);
      if (path === "admin/roles")
        return Promise.resolve(
          [
            "automation.clients",
            "automation.titles",
            "automation.notes",
            "automation.approvals",
            "automation.exports",
            "automation.learning",
            "automation.summary",
          ].flatMap((code) =>
            [code, `${code}.reader`].map((roleCode) => ({
              id: `role-${roleCode}`,
              code: roleCode,
              name: roleCode,
              description: "Acceso de prueba.",
              isSystem: true,
              permissions: [],
              assignmentCount: 0,
              clientAssignable: true,
            })),
          ),
        );
      if (path === "admin/clients")
        return Promise.resolve([
          {
            id: "client-1",
            name: "Adecco Perú",
            slug: "adecco-peru",
            active: true,
          },
        ]);
      return Promise.resolve({ success: true });
    });
    render(<AdminUsersWorkspace />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Gestionar a Sam Redacción" }),
    );
    const titleLevel = document.getElementById(
      "access-level-automation.titles",
    );
    expect(titleLevel).not.toBeNull();
    fireEvent.change(titleLevel!, { target: { value: "EDIT" } });
    fireEvent.click(
      await screen.findByRole("button", { name: "Guardar matriz de accesos" }),
    );
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        "admin/users/user-2/access",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const accessCall = apiFetchMock.mock.calls.find(
      ([path]) => path === "admin/users/user-2/access",
    );
    const payload = JSON.parse(accessCall?.[1]?.body as string);
    expect(payload.accesses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          submoduleCode: "automation.titles",
          level: "EDIT",
          allClients: true,
        }),
      ]),
    );
  });

  it("pide confirmación antes de retirar un rol", async () => {
    authState.user = {
      id: "admin-1",
      tenantPermissions: ["users.manage", "roles.manage"],
    };
    const userWithRole: AdminUser = {
      ...managedUser,
      roles: [
        {
          id: "assignment-1",
          grantedAt: "2026-08-16T20:00:00.000Z",
          grantedBy: { id: "admin-1", displayName: "Administrador" },
          client: { id: "client-1", name: "Adecco Perú", active: true },
          role: {
            id: "role-1",
            code: "editor",
            name: "Editor",
            description: null,
            isSystem: true,
            permissions: [],
          },
        },
      ],
    };
    apiFetchMock.mockImplementation((path: string) => {
      if (path.startsWith("admin/users?"))
        return Promise.resolve({ ...page, items: [userWithRole] });
      if (path === "admin/users/user-2") return Promise.resolve(userWithRole);
      if (path === "admin/roles") return Promise.resolve([]);
      if (path === "admin/clients") return Promise.resolve([]);
      return Promise.resolve({ success: true, revokedSessions: 0 });
    });
    render(<AdminUsersWorkspace />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Gestionar a Sam Redacción" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Quitar rol Editor" }));
    expect(
      screen.getByRole("heading", { name: "Quitar asignación" }),
    ).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalledWith(
      "admin/users/user-2/roles/assignment-1",
      expect.anything(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Quitar rol" }));
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        "admin/users/user-2/roles/assignment-1",
        { method: "DELETE" },
      ),
    );
  });
});
