import {
  BookOpenCheck,
  BrainCircuit,
  Building2,
  FileDown,
  FileText,
  Gauge,
  LayoutDashboard,
  Lightbulb,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  permissionGroups?: string[][];
  tenantPermissionGroups?: string[][];
};

export type NavigationGroup = {
  label: string;
  icon: LucideIcon;
  items: NavigationItem[];
};

export type NavigationAccess = {
  permissions: string[];
  tenantPermissions: string[];
};

export const primaryNavigation: NavigationItem[] = [
  { label: "Inicio", href: "/inicio", icon: LayoutDashboard },
];

export const navigationGroups: NavigationGroup[] = [
  {
    label: "Automatización de notas",
    icon: BookOpenCheck,
    items: [
      {
        label: "Clientes",
        href: "/automatizacion/clientes",
        icon: Building2,
        permissionGroups: [["clients.read"]],
      },
      {
        label: "Propuestas de títulos",
        href: "/automatizacion/titulos",
        icon: Lightbulb,
        permissionGroups: [["titles.read"]],
      },
      {
        label: "Notas",
        href: "/automatizacion/notas",
        icon: FileText,
        permissionGroups: [["notes.read"]],
      },
      {
        label: "Exportaciones",
        href: "/automatizacion/exportaciones",
        icon: FileDown,
        permissionGroups: [["notes.read"]],
      },
      {
        label: "Aprendizaje editorial",
        href: "/automatizacion/aprendizaje",
        icon: BrainCircuit,
        permissionGroups: [["learning.read"]],
      },
      {
        label: "Resumen ejecutivo",
        href: "/automatizacion/resumen",
        icon: Gauge,
        permissionGroups: [["analytics.read"]],
      },
    ],
  },
  {
    label: "Administración",
    icon: Settings,
    items: [
      {
        label: "Usuarios y accesos",
        href: "/administracion/usuarios",
        icon: Users,
        tenantPermissionGroups: [["users.manage"]],
      },
      {
        label: "Configuración",
        href: "/administracion/configuracion",
        icon: Settings,
        tenantPermissionGroups: [
          ["audit.read"],
          ["users.manage", "roles.manage"],
        ],
      },
    ],
  },
];

export const allNavigationItems = [
  ...primaryNavigation,
  ...navigationGroups.flatMap((group) => group.items),
];

export function canAccessNavigationItem(
  item: NavigationItem,
  access: NavigationAccess,
) {
  const hasScopedAccess =
    !item.permissionGroups?.length ||
    item.permissionGroups.some((group) =>
      group.every((permission) => access.permissions.includes(permission)),
    );
  const hasTenantAccess =
    !item.tenantPermissionGroups?.length ||
    item.tenantPermissionGroups.some((group) =>
      group.every((permission) =>
        access.tenantPermissions.includes(permission),
      ),
    );
  return hasScopedAccess && hasTenantAccess;
}

export function visibleNavigationGroups(access: NavigationAccess) {
  return navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        canAccessNavigationItem(item, access),
      ),
    }))
    .filter((group) => group.items.length > 0);
}
