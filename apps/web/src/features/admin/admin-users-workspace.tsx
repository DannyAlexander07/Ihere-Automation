"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Ban,
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserRoundCog,
  Users,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/features/auth/auth-provider";
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
  ForbiddenAdminState,
  errorMessage,
} from "./admin-states";
import type {
  AdminClient,
  AdminRole,
  AdminUser,
  Paginated,
  RoleAssignment,
  UserStatus,
} from "./admin-types";

const statusMeta: Record<UserStatus, { label: string; className: string }> = {
  ACTIVE: {
    label: "Activo",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  SUSPENDED: {
    label: "Suspendido",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  DISABLED: {
    label: "Deshabilitado",
    className: "border-slate-200 bg-slate-100 text-slate-700",
  },
};

const preferredAccessProfileOrder = [
  "automation.clients",
  "automation.titles",
  "automation.notes",
  "automation.exports",
  "automation.learning",
  "automation.summary",
] as const;

const accessProfileLabels: Record<string, string> = {
  "automation.clients": "Clientes",
  "automation.titles": "Propuestas de títulos",
  "automation.notes": "Notas",
  "automation.exports": "Exportaciones",
  "automation.learning": "Aprendizaje editorial",
  "automation.summary": "Resumen ejecutivo",
};

type AccessLevel = "NONE" | "READ" | "EDIT";
type AccessProfile = {
  submoduleCode: string;
  moduleCode: string;
  moduleLabel: string;
  label: string;
  editorRole: AdminRole;
  readerRole: AdminRole;
};
type ModuleAccessDraft = {
  submoduleCode: string;
  level: AccessLevel;
  allClients: boolean;
  clientIds: string[];
};

const permissionLabels: Record<string, string> = {
  "clients.read": "Ver clientes",
  "clients.manage": "Crear y editar clientes",
  "titles.read": "Ver títulos",
  "titles.create": "Crear títulos",
  "titles.edit": "Editar títulos",
  "titles.evaluate": "Evaluar títulos",
  "titles.review": "Observar títulos",
  "titles.approve": "Aprobar títulos",
  "titles.publish": "Publicar títulos",
  "notes.read": "Ver notas",
  "notes.create": "Crear notas",
  "notes.edit": "Editar notas",
  "notes.qa": "Ejecutar calidad",
  "notes.review": "Observar notas",
  "notes.approve": "Aprobar notas",
  "notes.export": "Exportar entregables",
  "ai.read": "Ver ejecuciones",
  "ai.generate": "Generar contenido",
  "learning.read": "Ver aprendizaje",
  "learning.manage": "Gestionar aprendizaje",
  "learning.approve": "Activar reglas",
  "review_links.manage": "Gestionar enlaces",
  "analytics.read": "Ver resultados",
  "analytics.manage": "Conectar analítica",
  "results_links.manage": "Gestionar portal",
};

export function AdminUsersWorkspace() {
  const { apiFetch, user: principal } = useAuth();
  const canManageUsers =
    principal?.tenantPermissions.includes("users.manage") ?? false;
  const canManageRoles =
    canManageUsers &&
    (principal?.tenantPermissions.includes("roles.manage") ?? false);
  const [result, setResult] = useState<Paginated<AdminUser> | null>(null);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<UserStatus | "">("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    if (!canManageUsers) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
      });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      const requests: [
        Promise<Paginated<AdminUser>>,
        Promise<AdminRole[]>?,
        Promise<AdminClient[]>?,
      ] = [apiFetch<Paginated<AdminUser>>(`admin/users?${params}`)];
      if (canManageRoles) {
        requests.push(
          apiFetch<AdminRole[]>("admin/roles"),
          apiFetch<AdminClient[]>("admin/clients"),
        );
      }
      const [users, roleCatalog = [], clientCatalog = []] =
        await Promise.all(requests);
      setResult(users);
      setRoles(roleCatalog);
      setClients(clientCatalog);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, canManageRoles, canManageUsers, page, search, status]);

  useEffect(() => {
    if (!canManageUsers) return;
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    const requests: Promise<
      Paginated<AdminUser> | AdminRole[] | AdminClient[]
    >[] = [apiFetch<Paginated<AdminUser>>(`admin/users?${params}`)];
    if (canManageRoles)
      requests.push(
        apiFetch<AdminRole[]>("admin/roles"),
        apiFetch<AdminClient[]>("admin/clients"),
      );
    void Promise.all(requests)
      .then(([users, roleCatalog = [], clientCatalog = []]) => {
        if (cancelled) return;
        setResult(users as Paginated<AdminUser>);
        setRoles(roleCatalog as AdminRole[]);
        setClients(clientCatalog as AdminClient[]);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiFetch, canManageRoles, canManageUsers, page, search, status]);

  const refreshSelected = useCallback(
    async (id: string) => {
      const refreshed = await apiFetch<AdminUser>(`admin/users/${id}`);
      setSelected(refreshed);
      setResult((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === id ? refreshed : item,
              ),
            }
          : current,
      );
    },
    [apiFetch],
  );

  if (!canManageUsers) return <ForbiddenAdminState />;

  return (
    <div className="min-w-0 space-y-4 min-[1920px]:space-y-6">
      <section className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-4 shadow-card sm:flex-row sm:items-center">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-primary">
            <Users className="size-3.5" />
            Administración
          </div>
          <h1 className="text-xl font-semibold sm:text-2xl">
            Usuarios y accesos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestiona cuentas, estados, sesiones y asignaciones autorizadas.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          Crear usuario
        </Button>
      </section>

      <div className="sr-only" role="status" aria-live="polite">
        {notice}
      </div>
      {notice ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
          <CheckCircle2 />
          <AlertTitle>Operación completada</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <AdminError message={error} onRetry={() => void load()} />
      ) : null}

      <section
        className="rounded-xl border bg-card p-3 shadow-card"
        aria-label="Filtros de usuarios"
      >
        <form
          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSearch(searchDraft.trim());
          }}
        >
          <Label className="sr-only" htmlFor="user-search">
            Buscar usuario
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="user-search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Buscar por nombre o correo"
              className="pl-9"
            />
          </div>
          <Label className="sr-only" htmlFor="user-status">
            Estado
          </Label>
          <select
            id="user-status"
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as UserStatus | "");
            }}
            className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Todos los estados</option>
            <option value="ACTIVE">Activos</option>
            <option value="SUSPENDED">Suspendidos</option>
            <option value="DISABLED">Deshabilitados</option>
          </select>
          <Button type="submit" variant="outline">
            Buscar
          </Button>
        </form>
      </section>

      {loading ? (
        <AdminLoading label="Cargando usuarios" />
      ) : result?.items.length ? (
        <UserList users={result.items} onSelect={setSelected} />
      ) : (
        <AdminEmpty
          title="No hay usuarios para mostrar"
          description="Cambia los filtros o crea la primera cuenta de la organización."
        />
      )}

      {result && result.totalPages > 1 ? (
        <nav
          className="flex items-center justify-between rounded-xl border bg-card px-3 py-2 text-sm"
          aria-label="Paginación de usuarios"
        >
          <span className="text-muted-foreground">
            Página {result.page} de {result.totalPages} · {result.total}{" "}
            usuarios
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => value - 1)}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= result.totalPages || loading}
              onClick={() => setPage((value) => value + 1)}
            >
              Siguiente
            </Button>
          </div>
        </nav>
      ) : null}

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        apiFetch={apiFetch}
        roles={roles}
        clients={clients}
        canManageRoles={canManageRoles}
        onCreated={async (created) => {
          setNotice(
            "La cuenta fue creada. Completa ahora su matriz de accesos.",
          );
          await load();
          if (!canManageRoles) {
            setCreateOpen(false);
            setSelected(created);
          }
        }}
        onFinished={async () => {
          setCreateOpen(false);
          setNotice("La cuenta y sus accesos quedaron configurados.");
          await load();
        }}
      />
      <UserDetailSheet
        key={selected?.id ?? "closed-user-detail"}
        user={selected}
        roles={roles}
        clients={clients}
        canManageRoles={canManageRoles}
        principalId={principal?.id ?? ""}
        apiFetch={apiFetch}
        onClose={() => setSelected(null)}
        onChanged={async (message) => {
          if (!selected) return;
          setNotice(message);
          await refreshSelected(selected.id);
        }}
      />
    </div>
  );
}

function UserList({
  users,
  onSelect,
}: {
  users: AdminUser[];
  onSelect: (user: AdminUser) => void;
}) {
  return (
    <section
      className="min-w-0 max-w-full overflow-hidden rounded-xl border bg-card shadow-card"
      aria-label="Listado de usuarios"
    >
      <div className="divide-y lg:hidden">
        {users.map((user) => (
          <UserCard key={user.id} user={user} onSelect={onSelect} />
        ))}
      </div>
      <div className="hidden min-w-0 max-w-full overflow-x-auto lg:block">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Accesos</th>
              <th className="px-4 py-3 font-medium">Sesiones</th>
              <th className="w-16 px-4 py-3">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-muted/20">
                <td className="px-4 py-3">
                  <p className="font-medium">{user.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {user.email ?? "Sin correo"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={user.status} />
                </td>
                <td className="px-4 py-3">
                  <p>
                    {user.roles.length} asignación
                    {user.roles.length === 1 ? "" : "es"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {roleSummary(user)}
                  </p>
                </td>
                <td className="px-4 py-3">{user.activeSessionCount}</td>
                <td className="px-4 py-3">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => onSelect(user)}
                    aria-label={`Gestionar a ${user.displayName}`}
                  >
                    <MoreHorizontal />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UserCard({
  user,
  onSelect,
}: {
  user: AdminUser;
  onSelect: (user: AdminUser) => void;
}) {
  return (
    <article className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{user.displayName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {user.email ?? "Sin correo"}
          </p>
        </div>
        <StatusBadge status={user.status} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {user.roles.length}{" "}
        {user.roles.length === 1 ? "asignación" : "asignaciones"} ·{" "}
        {user.activeSessionCount}{" "}
        {user.activeSessionCount === 1 ? "sesión activa" : "sesiones activas"}
      </p>
      <Button
        className="mt-3 w-full"
        size="sm"
        variant="outline"
        onClick={() => onSelect(user)}
        aria-label={`Gestionar acceso de ${user.displayName}`}
      >
        <UserRoundCog />
        Gestionar acceso
      </Button>
    </article>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  apiFetch,
  roles,
  clients,
  canManageRoles,
  onCreated,
  onFinished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  roles: AdminRole[];
  clients: AdminClient[];
  canManageRoles: boolean;
  onCreated: (created: AdminUser) => Promise<void>;
  onFinished: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<AdminUser | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const created = await apiFetch<AdminUser>("admin/users", {
        method: "POST",
        body: JSON.stringify({
          displayName: data.get("displayName"),
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      form.reset();
      setCreated(created);
      await onCreated(created);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setCreated(null);
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {created ? "Configurar accesos" : "Crear usuario"}
          </DialogTitle>
          <DialogDescription>
            {created
              ? `Define qué puede hacer ${created.displayName} y con qué clientes.`
              : "Paso 1 de 2: registra la cuenta. Después configurarás módulos, acciones y clientes antes de terminar."}
          </DialogDescription>
        </DialogHeader>
        {created && error ? (
          <Alert variant="destructive">
            <Ban />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {created && canManageRoles ? (
          <AccessMatrixEditor
            key={accessMatrixKey(created, roles)}
            user={created}
            roles={roles}
            clients={clients}
            busy={submitting}
            submitLabel="Guardar accesos y finalizar"
            onSave={async (accesses) => {
              setSubmitting(true);
              setError(null);
              try {
                await apiFetch(`admin/users/${created.id}/access`, {
                  method: "PUT",
                  body: JSON.stringify({ accesses }),
                });
                setCreated(null);
                await onFinished();
              } catch (reason) {
                setError(errorMessage(reason));
              } finally {
                setSubmitting(false);
              }
            }}
          />
        ) : (
          <form className="space-y-3" autoComplete="off" onSubmit={submit}>
            {error ? (
              <Alert variant="destructive">
                <Ban />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                id="new-name"
                name="displayName"
                label="Nombre completo"
                minLength={2}
                required
              />
              <Field
                id="new-email"
                name="email"
                label="Correo de acceso"
                type="email"
                required
              />
            </div>
            <Field
              id="new-password"
              name="password"
              label="Contraseña temporal"
              type="password"
              minLength={5}
              required
              description="Mínimo 5 caracteres; recomendamos 12 o más para mayor seguridad."
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creando…" : "Crear cuenta"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UserDetailSheet({
  user,
  roles,
  clients,
  canManageRoles,
  principalId,
  apiFetch,
  onClose,
  onChanged,
}: {
  user: AdminUser | null;
  roles: AdminRole[];
  clients: AdminClient[];
  canManageRoles: boolean;
  principalId: string;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  onClose: () => void;
  onChanged: (message: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleId, setRoleId] = useState("");
  const [clientId, setClientId] = useState("");
  const [assignmentToRemove, setAssignmentToRemove] =
    useState<RoleAssignment | null>(null);
  const selectedRole = useMemo(
    () => roles.find((role) => role.id === roleId),
    [roleId, roles],
  );
  const managedRoleCodes = useMemo(
    () =>
      new Set(
        accessProfilesFromRoles(roles).flatMap((profile) => [
          profile.editorRole.code,
          profile.readerRole.code,
        ]),
      ),
    [roles],
  );
  if (!user) return null;
  const activeUser = user;
  const advancedAssignments = user.roles.filter(
    (assignment) => !managedRoleCodes.has(assignment.role.code),
  );

  async function mutate(path: string, init: RequestInit, success: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(path, init);
      await onChanged(success);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await mutate(
      `admin/users/${activeUser.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          displayName: data.get("displayName"),
          email: data.get("email"),
        }),
      },
      "Los datos del usuario fueron actualizados.",
    );
  }
  async function assignRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate(
      `admin/users/${activeUser.id}/roles`,
      {
        method: "POST",
        body: JSON.stringify({
          roleId,
          clientId:
            selectedRole?.clientAssignable && clientId ? clientId : null,
        }),
      },
      "El rol fue asignado y las sesiones anteriores quedaron revocadas.",
    );
    setRoleId("");
    setClientId("");
  }
  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("passwordConfirmation") ?? "");
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    await mutate(
      `admin/users/${activeUser.id}/password`,
      { method: "PATCH", body: JSON.stringify({ password }) },
      "La contraseña fue restablecida y las sesiones anteriores quedaron cerradas.",
    );
    form.reset();
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        showCloseButton={false}
        className="data-[side=right]:w-[calc(100%-1rem)] overflow-y-auto sm:data-[side=right]:w-full sm:max-w-xl"
      >
        <SheetClose asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute right-3 top-3"
            aria-label="Cerrar panel"
          >
            <X />
          </Button>
        </SheetClose>
        <SheetHeader className="border-b">
          <SheetTitle>{user.displayName}</SheetTitle>
          <SheetDescription>
            Cuenta, sesiones y permisos efectivos de la organización.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          {error ? (
            <Alert variant="destructive">
              <Ban />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={user.status} />
            <Badge variant="outline">
              {user.activeSessionCount}{" "}
              {user.activeSessionCount === 1
                ? "sesión activa"
                : "sesiones activas"}
            </Badge>
            {user.mfaRequired ? (
              <Badge variant="outline">MFA requerido</Badge>
            ) : null}
          </div>

          <form
            className="space-y-3 rounded-xl border p-3"
            autoComplete="off"
            onSubmit={saveProfile}
          >
            <h2 className="text-sm font-semibold">Datos de la cuenta</h2>
            <Field
              id="edit-name"
              name="displayName"
              label="Nombre completo"
              defaultValue={user.displayName}
              minLength={2}
              required
            />
            <Field
              id="edit-email"
              name="email"
              label="Correo"
              type="email"
              defaultValue={user.email ?? ""}
              required
            />
            <Button size="sm" type="submit" disabled={busy}>
              Guardar cambios
            </Button>
          </form>

          <section
            className="space-y-3 rounded-xl border p-3"
            aria-labelledby="account-control-title"
          >
            <h2 id="account-control-title" className="text-sm font-semibold">
              Estado y sesiones
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {user.status !== "ACTIVE" ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      `admin/users/${user.id}/status`,
                      {
                        method: "PATCH",
                        body: JSON.stringify({ status: "ACTIVE" }),
                      },
                      "La cuenta quedó activa y deberá iniciar sesión nuevamente.",
                    )
                  }
                >
                  Activar cuenta
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled={busy || user.id === principalId}
                  onClick={() =>
                    void mutate(
                      `admin/users/${user.id}/status`,
                      {
                        method: "PATCH",
                        body: JSON.stringify({ status: "SUSPENDED" }),
                      },
                      "La cuenta fue suspendida y sus sesiones revocadas.",
                    )
                  }
                >
                  Suspender cuenta
                </Button>
              )}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void mutate(
                    `admin/users/${user.id}/sessions/revoke`,
                    { method: "POST", body: "{}" },
                    "Se revocaron todas las sesiones activas.",
                  )
                }
              >
                <KeyRound />
                Revocar sesiones
              </Button>
            </div>
            {user.id === principalId ? (
              <p className="text-xs text-muted-foreground">
                No puedes suspender tu propia cuenta. Cambia tu contraseña desde
                Preferencias.
              </p>
            ) : null}
            {user.id !== principalId ? (
              <form
                className="space-y-3 border-t pt-3"
                autoComplete="off"
                onSubmit={resetPassword}
              >
                <div className="flex items-start gap-2">
                  <LockKeyhole className="mt-0.5 size-4 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold">
                      Restablecer contraseña
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      La persona deberá usar la nueva clave en su próximo
                      acceso.
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    id="admin-new-password"
                    name="password"
                    label="Nueva contraseña"
                    type="password"
                    minLength={5}
                    required
                  />
                  <Field
                    id="admin-new-password-confirmation"
                    name="passwordConfirmation"
                    label="Confirmar contraseña"
                    type="password"
                    minLength={5}
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Mínimo 5 caracteres; recomendamos 12 o más.
                </p>
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                >
                  <KeyRound /> Cambiar contraseña
                </Button>
              </form>
            ) : null}
          </section>

          <section
            className="space-y-3 rounded-xl border p-3"
            aria-labelledby="modules-title"
          >
            <div className="flex items-start gap-2">
              <SlidersHorizontal className="mt-0.5 size-4 text-primary" />
              <div>
                <h2 id="modules-title" className="text-sm font-semibold">
                  Módulos y submódulos habilitados
                </h2>
                <p className="text-xs text-muted-foreground">
                  Configura qué partes de I HERE verá esta persona y para qué
                  cliente.
                </p>
              </div>
            </div>
            {canManageRoles ? (
              <AccessMatrixEditor
                key={accessMatrixKey(user, roles)}
                user={user}
                roles={roles}
                clients={clients}
                busy={busy}
                submitLabel="Guardar matriz de accesos"
                onSave={async (accesses) => {
                  await mutate(
                    `admin/users/${activeUser.id}/access`,
                    { method: "PUT", body: JSON.stringify({ accesses }) },
                    "La matriz de accesos fue actualizada y las sesiones anteriores quedaron revocadas.",
                  );
                }}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Necesitas el permiso de roles para cambiar los módulos
                habilitados.
              </p>
            )}
          </section>

          <section
            className="space-y-3 rounded-xl border p-3"
            aria-labelledby="roles-title"
          >
            <div>
              <h2 id="roles-title" className="text-sm font-semibold">
                Roles avanzados
              </h2>
              <p className="text-xs text-muted-foreground">
                Úsalos solo para administración u otros perfiles especiales.
              </p>
            </div>
            {advancedAssignments.length ? (
              <div className="space-y-2">
                {advancedAssignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="flex items-start justify-between gap-3 rounded-lg bg-muted/40 p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{assignment.role.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {assignment.client?.name ?? "Toda la organización"}
                      </p>
                    </div>
                    {canManageRoles ? (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        disabled={
                          busy ||
                          (user.id === principalId &&
                            assignment.client === null)
                        }
                        onClick={() => setAssignmentToRemove(assignment)}
                        aria-label={`Quitar rol ${assignment.role.name}`}
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Sin roles avanzados asignados.
              </p>
            )}

            {canManageRoles ? (
              <form
                className="space-y-2 border-t pt-3"
                autoComplete="off"
                onSubmit={assignRole}
              >
                <Label htmlFor="assign-role">Nuevo rol</Label>
                <select
                  id="assign-role"
                  value={roleId}
                  onChange={(event) => {
                    setRoleId(event.target.value);
                    setClientId("");
                  }}
                  required
                  className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                >
                  <option value="">Selecciona un rol</option>
                  {roles
                    .filter((role) => !role.code.startsWith("automation."))
                    .map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                </select>
                {selectedRole?.clientAssignable ? (
                  <>
                    <Label htmlFor="assign-client">Alcance</Label>
                    <select
                      id="assign-client"
                      value={clientId}
                      onChange={(event) => setClientId(event.target.value)}
                      className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                    >
                      <option value="">Toda la organización</option>
                      {clients
                        .filter((client) => client.active)
                        .map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name}
                          </option>
                        ))}
                    </select>
                  </>
                ) : selectedRole ? (
                  <p className="text-xs text-muted-foreground">
                    Este rol solo puede asignarse a toda la organización.
                  </p>
                ) : null}
                <Button size="sm" type="submit" disabled={busy || !roleId}>
                  <ShieldCheck />
                  Asignar rol
                </Button>
              </form>
            ) : (
              <p className="text-xs text-muted-foreground">
                Necesitas el permiso de roles para cambiar estas asignaciones.
              </p>
            )}
          </section>
        </div>
        <Dialog
          open={Boolean(assignmentToRemove)}
          onOpenChange={(open) => {
            if (!open) setAssignmentToRemove(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Quitar asignación</DialogTitle>
              <DialogDescription>
                Se retirará el rol {assignmentToRemove?.role.name} de{" "}
                {activeUser.displayName} y se revocarán sus sesiones actuales.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancelar</Button>
              </DialogClose>
              <Button
                variant="destructive"
                disabled={busy || !assignmentToRemove}
                onClick={() => {
                  if (!assignmentToRemove) return;
                  const assignmentId = assignmentToRemove.id;
                  setAssignmentToRemove(null);
                  void mutate(
                    `admin/users/${activeUser.id}/roles/${assignmentId}`,
                    { method: "DELETE" },
                    "El rol fue retirado y las sesiones anteriores quedaron revocadas.",
                  );
                }}
              >
                <Trash2 />
                Quitar rol
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

function AccessMatrixEditor({
  user,
  roles,
  clients,
  busy,
  submitLabel,
  onSave,
}: {
  user: AdminUser;
  roles: AdminRole[];
  clients: AdminClient[];
  busy: boolean;
  submitLabel: string;
  onSave: (accesses: ModuleAccessDraft[]) => Promise<void>;
}) {
  const profiles = useMemo(() => accessProfilesFromRoles(roles), [roles]);
  const [draft, setDraft] = useState<ModuleAccessDraft[]>(() =>
    accessDraftFrom(user, profiles),
  );
  const isAdministrator = user.roles.some(
    (assignment) =>
      assignment.role.code === "administrator" && assignment.client === null,
  );
  if (isAdministrator) {
    return (
      <Alert className="border-primary/20 bg-primary/5">
        <ShieldCheck />
        <AlertDescription>
          Este usuario es administrador y ya tiene acceso completo a todos los
          módulos.
        </AlertDescription>
      </Alert>
    );
  }
  const activeClients = clients.filter((client) => client.active);
  const catalogReady = profiles.length > 0;
  return (
    <form
      className="space-y-3"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(draft);
      }}
    >
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
        Elige por submódulo si la persona no tendrá acceso, solo podrá ver o
        podrá editar y operar. Luego limita ese acceso a todos o a clientes
        específicos.
      </div>
      <div className="overflow-hidden rounded-xl border">
        <div className="divide-y">
          {draft.map((access, index) => {
            const profile = profiles.find(
              (candidate) => candidate.submoduleCode === access.submoduleCode,
            );
            const roleCode =
              access.level === "READ"
                ? `${access.submoduleCode}.reader`
                : access.submoduleCode;
            const role = roles.find((candidate) => candidate.code === roleCode);
            const tenantOnlyEditor =
              access.level === "EDIT" && role?.clientAssignable === false;
            const previousProfile = index > 0 ? profiles[index - 1] : null;
            const startsModule =
              !previousProfile ||
              previousProfile.moduleCode !== profile?.moduleCode;
            return (
              <div key={access.submoduleCode}>
                {startsModule ? (
                  <div className="border-y bg-muted/40 px-3 py-2 first:border-t-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Módulo · {profile?.moduleLabel ?? "Otro módulo"}
                    </p>
                  </div>
                ) : null}
                <div className="space-y-3 px-3 py-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-start">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {profile?.label ??
                          accessProfileLabels[access.submoduleCode] ??
                          humanizeCode(access.submoduleCode)}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {role?.description ??
                          "Configura el acceso a este submódulo."}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`access-level-${access.submoduleCode}`}>
                        Nivel de acceso
                      </Label>
                      <select
                        id={`access-level-${access.submoduleCode}`}
                        value={access.level}
                        onChange={(event) =>
                          setDraft((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    level: event.target.value as AccessLevel,
                                    allClients:
                                      event.target.value === "EDIT" &&
                                      profile?.editorRole.clientAssignable ===
                                        false
                                        ? true
                                        : item.allClients,
                                  }
                                : item,
                            ),
                          )
                        }
                        className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                      >
                        <option value="NONE">Sin acceso</option>
                        <option value="READ">Solo ver</option>
                        <option value="EDIT">Editar y operar</option>
                      </select>
                    </div>
                  </div>
                  {access.level !== "NONE" ? (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {(role?.permissions ?? []).map((permission) => (
                          <Badge key={permission.code} variant="secondary">
                            {permissionLabels[permission.code] ??
                              permission.description ??
                              permission.code}
                          </Badge>
                        ))}
                      </div>
                      {tenantOnlyEditor ? (
                        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          Este nivel contiene acciones organizacionales y por
                          eso aplica a todos los clientes. Las eliminaciones
                          sensibles continúan reservadas al administrador.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <Label
                            htmlFor={`access-scope-${access.submoduleCode}`}
                          >
                            Clientes autorizados
                          </Label>
                          <select
                            id={`access-scope-${access.submoduleCode}`}
                            value={access.allClients ? "ALL" : "SELECTED"}
                            onChange={(event) =>
                              setDraft((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        allClients:
                                          event.target.value === "ALL",
                                      }
                                    : item,
                                ),
                              )
                            }
                            className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                          >
                            <option value="ALL">Todos los clientes</option>
                            <option value="SELECTED">
                              Solo clientes seleccionados
                            </option>
                          </select>
                          {!access.allClients ? (
                            <div className="grid gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-2">
                              {activeClients.length ? (
                                activeClients.map((client) => (
                                  <label
                                    key={client.id}
                                    className="flex min-h-9 items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={access.clientIds.includes(
                                        client.id,
                                      )}
                                      onChange={(event) =>
                                        setDraft((current) =>
                                          current.map((item, itemIndex) =>
                                            itemIndex === index
                                              ? {
                                                  ...item,
                                                  clientIds: event.target
                                                    .checked
                                                    ? [
                                                        ...item.clientIds,
                                                        client.id,
                                                      ]
                                                    : item.clientIds.filter(
                                                        (id) =>
                                                          id !== client.id,
                                                      ),
                                                }
                                              : item,
                                          ),
                                        )
                                      }
                                    />
                                    {client.name}
                                  </label>
                                ))
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  No hay clientes activos disponibles.
                                </p>
                              )}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {!catalogReady ? (
        <Alert variant="destructive">
          <Ban />
          <AlertDescription>
            No hay módulos con perfiles de “Solo ver” y “Editar y operar”
            disponibles.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || !catalogReady}>
          <ShieldCheck /> {busy ? "Guardando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function accessDraftFrom(
  user: AdminUser,
  profiles: AccessProfile[],
): ModuleAccessDraft[] {
  return profiles.map(({ submoduleCode }) => {
    const editorAssignments = user.roles.filter(
      (assignment) => assignment.role.code === submoduleCode,
    );
    const readerAssignments = user.roles.filter(
      (assignment) => assignment.role.code === `${submoduleCode}.reader`,
    );
    const assignments = editorAssignments.length
      ? editorAssignments
      : readerAssignments;
    return {
      submoduleCode,
      level: editorAssignments.length
        ? "EDIT"
        : readerAssignments.length
          ? "READ"
          : "NONE",
      allClients:
        assignments.length === 0 ||
        assignments.some((assignment) => assignment.client === null),
      clientIds: assignments.flatMap((assignment) =>
        assignment.client ? [assignment.client.id] : [],
      ),
    };
  });
}

function accessMatrixKey(user: AdminUser, roles: AdminRole[]) {
  const assignments = user.roles
    .map(
      (assignment) =>
        `${assignment.role.code}:${assignment.client?.id ?? "tenant"}`,
    )
    .sort()
    .join("|");
  const catalog = roles
    .map((role) => `${role.id}:${role.code}`)
    .sort()
    .join("|");
  return `${user.id}:${assignments}:${catalog}`;
}

function accessProfilesFromRoles(roles: AdminRole[]): AccessProfile[] {
  const roleByCode = new Map(roles.map((role) => [role.code, role]));
  return roles
    .filter(
      (role) =>
        !["automation.quality", "automation.approvals"].includes(role.code) &&
        !role.code.endsWith(".reader") &&
        role.code.split(".").length === 2 &&
        roleByCode.has(`${role.code}.reader`),
    )
    .map((editorRole) => {
      const readerRole = roleByCode.get(`${editorRole.code}.reader`)!;
      const moduleCode = editorRole.code.split(".")[0];
      return {
        submoduleCode: editorRole.code,
        moduleCode,
        moduleLabel: moduleLabelFor(moduleCode),
        label:
          accessProfileLabels[editorRole.code] ??
          editorRole.name.replace(/ · Solo (lectura|ver)$/i, ""),
        editorRole,
        readerRole,
      };
    })
    .sort((left, right) => {
      const leftKnown = preferredAccessProfileOrder.indexOf(
        left.submoduleCode as (typeof preferredAccessProfileOrder)[number],
      );
      const rightKnown = preferredAccessProfileOrder.indexOf(
        right.submoduleCode as (typeof preferredAccessProfileOrder)[number],
      );
      if (leftKnown >= 0 || rightKnown >= 0) {
        if (leftKnown < 0) return 1;
        if (rightKnown < 0) return -1;
        return leftKnown - rightKnown;
      }
      return (
        left.moduleLabel.localeCompare(right.moduleLabel, "es") ||
        left.label.localeCompare(right.label, "es")
      );
    });
}

function moduleLabelFor(code: string) {
  if (code === "automation") return "Automatización de notas";
  return humanizeCode(code);
}

function humanizeCode(code: string) {
  return code
    .split(".")
    .at(-1)!
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function Field({
  id,
  label,
  description,
  ...props
}: React.ComponentProps<typeof Input> & {
  id: string;
  label: string;
  description?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: UserStatus }) {
  const meta = statusMeta[status];
  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  );
}
function roleSummary(user: AdminUser) {
  return (
    user.roles
      .slice(0, 2)
      .map((assignment) => assignment.role.name)
      .join(", ") || "Sin roles"
  );
}
