import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CommandSearch } from "./command-search";

const push = vi.fn();

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    user: {
      permissions: ["notes.read", "analytics.read"],
      tenantPermissions: [],
    },
  }),
}));

describe("CommandSearch", () => {
  it("agrupa y filtra los submódulos según los accesos", () => {
    render(<CommandSearch />);

    fireEvent.click(screen.getByRole("button", { name: "Buscar en I HERE" }));

    expect(screen.getByText("Automatización de notas")).toBeVisible();
    expect(screen.queryByText("Portal del cliente")).not.toBeInTheDocument();
    expect(screen.getByText("Notas")).toBeVisible();
    expect(screen.getByText("Resumen ejecutivo")).toBeVisible();
    expect(screen.queryByText("Propuestas de títulos")).not.toBeInTheDocument();
    expect(screen.queryByText("Administración")).not.toBeInTheDocument();
  });
});
