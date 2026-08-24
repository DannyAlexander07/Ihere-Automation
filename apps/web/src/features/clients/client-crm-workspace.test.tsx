import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientCrmWorkspace } from "./client-crm-workspace";

const { apiFetchMock, authState } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  authState: {
    tenantPermissions: ["clients.manage", "clients.delete"] as string[],
  },
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    apiFetch: apiFetchMock,
    user: { tenantPermissions: authState.tenantPermissions },
  }),
}));

const adecco = {
  id: "client-1",
  name: "Adecco Perú",
  slug: "adecco-peru",
  active: true,
  createdAt: "2026-08-18T10:00:00.000Z",
  updatedAt: "2026-08-18T10:00:00.000Z",
};

describe("ClientCrmWorkspace", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    authState.tenantPermissions = ["clients.manage", "clients.delete"];
    apiFetchMock.mockImplementation((path: string) =>
      path === "clients" ? Promise.resolve([adecco]) : Promise.resolve(adecco),
    );
  });

  it("muestra los clientes del módulo y permite crear uno", async () => {
    render(<ClientCrmWorkspace />);
    expect(
      await screen.findByRole("heading", { name: "Adecco Perú" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Crear cliente" }));
    fireEvent.change(screen.getByLabelText("Nombre del cliente"), {
      target: { value: "Cliente Nuevo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear cliente" }));
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith("clients", {
        method: "POST",
        body: JSON.stringify({ name: "Cliente Nuevo", slug: undefined }),
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Crear cliente editorial" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("oculta las acciones de escritura sin clients.manage", async () => {
    authState.tenantPermissions = [];
    render(<ClientCrmWorkspace />);
    expect(
      await screen.findByRole("heading", { name: "Adecco Perú" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Crear cliente" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Editar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Eliminar a Adecco Perú" }),
    ).not.toBeInTheDocument();
  });

  it("solo permite al administrador confirmar la eliminación", async () => {
    render(<ClientCrmWorkspace />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Eliminar a Adecco Perú" }),
    );
    expect(
      screen.getByRole("heading", { name: "¿Eliminar este cliente?" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith("clients/client-1", {
        method: "DELETE",
      }),
    );
  });

  it("no muestra la papelera a quien solo administra datos", async () => {
    authState.tenantPermissions = ["clients.manage"];
    render(<ClientCrmWorkspace />);
    expect(
      await screen.findByRole("heading", { name: "Adecco Perú" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Eliminar a Adecco Perú" }),
    ).not.toBeInTheDocument();
  });
});
