import { describe, expect, it } from "vitest";
import {
  allNavigationItems,
  canAccessNavigationItem,
  visibleNavigationGroups,
} from "./navigation";

const access = (
  permissions: string[] = [],
  tenantPermissions: string[] = [],
) => ({
  permissions,
  tenantPermissions,
});

describe("navigation", () => {
  it("mantiene rutas únicas y absolutas", () => {
    const routes = allNavigationItems.map((item) => item.href);
    expect(new Set(routes).size).toBe(routes.length);
    expect(routes.every((route) => route.startsWith("/"))).toBe(true);
  });

  it("oculta rutas administrativas sin permisos tenant-wide", () => {
    const users = allNavigationItems.find(
      (item) => item.href === "/administracion/usuarios",
    )!;
    const configuration = allNavigationItems.find(
      (item) => item.href === "/administracion/configuracion",
    )!;

    expect(canAccessNavigationItem(users, access())).toBe(false);
    expect(canAccessNavigationItem(users, access([], ["users.manage"]))).toBe(
      true,
    );
    expect(
      canAccessNavigationItem(configuration, access([], ["audit.read"])),
    ).toBe(true);
    expect(
      canAccessNavigationItem(
        configuration,
        access([], ["users.manage", "roles.manage"]),
      ),
    ).toBe(true);
    expect(
      canAccessNavigationItem(configuration, access([], ["roles.manage"])),
    ).toBe(false);
  });

  it("muestra únicamente los módulos habilitados para el trabajador", () => {
    const groups = visibleNavigationGroups(access(["titles.read"]));

    expect(groups.map((group) => group.label)).toEqual([
      "Automatización de notas",
    ]);
    expect(groups[0].items.map((item) => item.label)).toEqual([
      "Propuestas de títulos",
    ]);
  });

  it("acepta permisos asignados por cliente y conserva los encabezados", () => {
    const groups = visibleNavigationGroups(
      access(["notes.read", "analytics.read"]),
    );

    expect(groups.map((group) => group.label)).toEqual([
      "Automatización de notas",
    ]);
    expect(groups[0].items.map((item) => item.label)).toEqual([
      "Notas",
      "Exportaciones",
      "Resumen ejecutivo",
    ]);
  });

  it("ubica clientes y resumen dentro de Automatización de notas", () => {
    const groups = visibleNavigationGroups(
      access(["clients.read", "analytics.read"]),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Automatización de notas");
    expect(groups[0].items.map((item) => item.href)).toEqual([
      "/automatizacion/clientes",
      "/automatizacion/resumen",
    ]);
  });
});
