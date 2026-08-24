import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LearningWorkspace } from "./learning-workspace";

const { apiFetchMock, authState } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  authState: {
    user: null as null | {
      permissions: string[];
      tenantPermissions: string[];
    },
  },
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ apiFetch: apiFetchMock, user: authState.user }),
}));

const client = {
  id: "client-1",
  name: "Adecco Perú",
  slug: "adecco-peru",
  active: true,
};
const retiredRule = {
  id: "rule-retired",
  clientId: client.id,
  code: "adecco-image-context-v1",
  title: "Proponer imágenes coherentes con el contexto de cada nota",
  description:
    "La imagen debe corresponder al servicio y al escenario descrito.",
  status: "RETIRED",
  evidenceCount: 4,
  approvedAt: null,
  client: { name: client.name },
  approvedBy: null,
  correctionSignals: [],
};

describe("LearningWorkspace", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    authState.user = {
      permissions: ["learning.read", "learning.approve"],
      tenantPermissions: [],
    };
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "clients") return Promise.resolve([client]);
      if (path.startsWith("learning/signals?")) return Promise.resolve([]);
      if (path.startsWith("learning/rules?"))
        return Promise.resolve([retiredRule]);
      return Promise.resolve({});
    });
  });

  it("oculta la recuperación cuando el permiso no es administrativo", async () => {
    render(<LearningWorkspace />);
    expect(await screen.findByText(retiredRule.title)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Recuperar" }),
    ).not.toBeInTheDocument();
  });

  it("exige confirmación Sí/No y usa el endpoint administrativo", async () => {
    authState.user = {
      permissions: ["learning.read", "learning.approve", "learning.restore"],
      tenantPermissions: ["learning.restore"],
    };
    render(<LearningWorkspace />);

    fireEvent.click(await screen.findByRole("button", { name: "Recuperar" }));
    expect(
      screen.getByRole("heading", { name: "Recuperar regla" }),
    ).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalledWith(
      "learning/rules/rule-retired/restore",
      expect.anything(),
    );

    fireEvent.click(screen.getByRole("button", { name: "No, cancelar" }));
    expect(
      screen.queryByRole("heading", { name: "Recuperar regla" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Recuperar" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, recuperar" }));
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        "learning/rules/rule-retired/restore",
        { method: "POST", body: "{}" },
      ),
    );
  });
});
