import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "./account-menu";

const { setTheme, apiFetch, refreshUser } = vi.hoisted(() => ({
  setTheme: vi.fn(),
  apiFetch: vi.fn().mockResolvedValue({ success: true }),
  refreshUser: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      displayName: "Alexander Arellano",
      email: "alexander@example.com",
      permissions: ["titles.read", "notes.read"],
      tenantPermissions: ["users.manage"],
      clientIds: ["client-a"],
    },
    apiFetch,
    refreshUser,
  }),
}));

vi.mock("@/components/theme/theme-provider", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/components/theme/theme-provider")
  >()),
  useAppTheme: () => ({
    theme: "professional",
    setTheme,
    toggleTheme: vi.fn(),
  }),
}));

describe("AccountMenu", () => {
  beforeEach(() => {
    apiFetch.mockClear();
    refreshUser.mockClear();
  });
  it("abre el perfil con la información de la cuenta", () => {
    render(<AccountMenu loggingOut={false} onLogout={vi.fn()} />);

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Abrir menú de usuario" }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Perfil" }));

    expect(screen.getByRole("heading", { name: "Tu perfil" })).toBeVisible();
    expect(screen.getByText("alexander@example.com")).toBeVisible();
    expect(screen.getByText("Permisos habilitados")).toBeVisible();
  });

  it("permite seleccionar el tema rosa desde Preferencias", () => {
    render(<AccountMenu loggingOut={false} onLogout={vi.fn()} />);

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Abrir menú de usuario" }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Preferencias" }));
    fireEvent.click(screen.getByRole("button", { name: /Rosa pastel/i }));

    expect(setTheme).toHaveBeenCalledWith("blush");
  });

  it("actualiza datos y credenciales desde Preferencias", async () => {
    render(<AccountMenu loggingOut={false} onLogout={vi.fn()} />);
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Abrir menú de usuario" }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Preferencias" }));

    fireEvent.change(screen.getByLabelText("Nombre completo"), {
      target: { value: "Alexander actualizado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar datos" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("auth/me/profile", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: "Alexander actualizado",
          email: "alexander@example.com",
        }),
      }),
    );
    expect(refreshUser).toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Contraseña nueva"), {
      target: { value: "nueva-clave" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña actual"), {
      target: { value: "actual" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Actualizar credenciales" }),
    );
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("auth/me/credentials", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: "actual",
          newPassword: "nueva-clave",
        }),
      }),
    );
  });
});
