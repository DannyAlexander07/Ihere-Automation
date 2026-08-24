import { describe, expect, it } from "vitest";
import type { AuthUser } from "./auth-provider";
import { hasClientPermission } from "./permissions";

const user: AuthUser = {
  id: "user-1",
  displayName: "Usuaria",
  email: null,
  permissions: ["titles.read", "titles.edit"],
  tenantPermissions: ["titles.read"],
  clientPermissions: { "client-a": ["titles.edit"] },
  clientIds: ["client-a"],
};

describe("hasClientPermission", () => {
  it("reconoce permisos globales del tenant", () => {
    expect(hasClientPermission(user, "titles.read", "client-b")).toBe(true);
  });

  it("limita los permisos asignados a un cliente", () => {
    expect(hasClientPermission(user, "titles.edit", "client-a")).toBe(true);
    expect(hasClientPermission(user, "titles.edit", "client-b")).toBe(false);
  });

  it("rechaza sesiones o clientes ausentes", () => {
    expect(hasClientPermission(null, "titles.read", "client-a")).toBe(false);
    expect(hasClientPermission(user, "titles.read", "")).toBe(false);
  });
});
