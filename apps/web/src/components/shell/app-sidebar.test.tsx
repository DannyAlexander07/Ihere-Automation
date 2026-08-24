import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppSidebar } from "./app-sidebar";

const { navigationState } = vi.hoisted(() => ({
  navigationState: { pathname: "/automatizacion/titulos" },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    user: {
      permissions: [
        "titles.read",
        "notes.read",
        "learning.read",
        "analytics.read",
        "users.manage",
        "roles.manage",
        "audit.read",
      ],
      tenantPermissions: ["users.manage", "roles.manage", "audit.read"],
    },
  }),
}));

describe("AppSidebar", () => {
  beforeEach(() => {
    navigationState.pathname = "/automatizacion/titulos";
  });

  it("abre el grupo activo y mantiene los demás grupos contraídos", () => {
    render(<AppSidebar compact={false} mobile />);

    expect(
      screen.getByRole("button", { name: "Automatización de notas" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("link", { name: "Propuestas de títulos" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Administración" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("link", { name: "Resumen ejecutivo" }),
    ).toBeVisible();
  });

  it("despliega y contrae submódulos desde su encabezado", () => {
    render(<AppSidebar compact={false} mobile />);

    const administrationButton = screen.getByRole("button", {
      name: "Administración",
    });
    fireEvent.click(administrationButton);
    expect(administrationButton).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("link", { name: "Usuarios y accesos" }),
    ).toBeVisible();

    fireEvent.click(administrationButton);
    expect(administrationButton).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("link", { name: "Usuarios y accesos" }),
    ).not.toBeInTheDocument();
  });

  it("muestra los submódulos con una jerarquía visual anidada", () => {
    render(<AppSidebar compact={false} mobile />);

    const link = screen.getByRole("link", { name: "Propuestas de títulos" });
    expect(link.parentElement).toHaveClass("border-l", "pl-2");
    expect(link).toHaveClass("min-h-8", "text-[12px]");
  });
});
