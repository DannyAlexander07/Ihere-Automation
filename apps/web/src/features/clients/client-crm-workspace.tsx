"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Building2,
  CheckCircle2,
  Edit3,
  FolderKanban,
  Plus,
  Search,
  Trash2,
  UsersRound,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError } from "@/lib/api/api-client";

type EditorialClient = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export function ClientCrmWorkspace() {
  const { apiFetch, user } = useAuth();
  const canManage = user?.tenantPermissions.includes("clients.manage") ?? false;
  const canDelete = user?.tenantPermissions.includes("clients.delete") ?? false;
  const [clients, setClients] = useState<EditorialClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EditorialClient | null>(null);
  const [deleting, setDeleting] = useState<EditorialClient | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setClients(await apiFetch<EditorialClient[]>("clients"));
    } catch (reason) {
      setError(message(reason));
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    let cancelled = false;
    void apiFetch<EditorialClient[]>("clients")
      .then((items) => {
        if (!cancelled) setClients(items);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(message(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es-PE");
    return clients.filter((client) => {
      const matchesText =
        !query ||
        `${client.name} ${client.slug}`
          .toLocaleLowerCase("es-PE")
          .includes(query);
      const matchesStatus =
        status === "all" ||
        (status === "active" ? client.active : !client.active);
      return matchesText && matchesStatus;
    });
  }, [clients, search, status]);

  const activeCount = clients.filter((client) => client.active).length;

  async function saved(text: string) {
    setNotice(text);
    setCreateOpen(false);
    setEditing(null);
    await load();
  }

  return (
    <div className="space-y-4 min-[1920px]:space-y-5">
      <section className="overflow-hidden rounded-2xl border bg-[radial-gradient(circle_at_92%_12%,color-mix(in_srgb,var(--primary)_16%,transparent),transparent_26%),var(--card)] p-4 shadow-card sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold text-primary">
              <FolderKanban className="size-4" />
              Automatización de notas
            </p>
            <h1 className="mt-1 font-heading text-2xl font-semibold">
              Clientes editoriales
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              CRM propio del módulo para organizar títulos, notas, aprobaciones
              y resultados por cliente.
            </p>
          </div>
          {canManage ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              Crear cliente
            </Button>
          ) : null}
        </div>
      </section>

      {notice ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
          <CheckCircle2 />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2">
        <SummaryCard
          label="Clientes del módulo"
          value={clients.length}
          icon={Building2}
        />
        <SummaryCard
          label="Clientes activos"
          value={activeCount}
          icon={UsersRound}
          accent
        />
      </section>

      <section className="rounded-2xl border bg-card p-3 shadow-card">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
          <Label htmlFor="client-search" className="sr-only">
            Buscar cliente
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="client-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
              placeholder="Buscar por nombre o identificador"
            />
          </div>
          <Label htmlFor="client-status" className="sr-only">
            Estado
          </Label>
          <select
            id="client-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>
      </section>

      {loading ? (
        <ClientSkeleton />
      ) : visible.length ? (
        <section
          className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3"
          aria-label="Clientes editoriales"
        >
          {visible.map((client) => (
            <article
              key={client.id}
              className="group rounded-2xl border bg-card p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Building2 />
                </span>
                <Badge
                  variant="outline"
                  className={
                    client.active
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {client.active ? "Activo" : "Inactivo"}
                </Badge>
              </div>
              <h2 className="mt-4 text-base font-semibold leading-tight">
                {client.name}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {client.slug}
              </p>
              <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                <span>CRM de notas</span>
                <div className="flex items-center gap-1">
                  {canManage ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(client)}
                    >
                      <Edit3 />
                      Editar
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Eliminar a ${client.name}`}
                      title={`Eliminar a ${client.name}`}
                      onClick={() => setDeleting(client)}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed bg-card p-10 text-center">
          <Building2 className="mx-auto size-10 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">No hay clientes para mostrar</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cambia los filtros o crea el primer cliente de este módulo.
          </p>
        </section>
      )}

      <ClientDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        apiFetch={apiFetch}
        onSaved={() =>
          saved("El cliente quedó creado dentro de Automatización de notas.")
        }
      />
      <DeleteClientDialog
        client={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        apiFetch={apiFetch}
        onDeleted={async () => {
          setNotice("El cliente fue eliminado del CRM.");
          setDeleting(null);
          await load();
        }}
      />
      <ClientDialog
        key={editing?.id ?? "edit-client"}
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        client={editing ?? undefined}
        apiFetch={apiFetch}
        onSaved={() =>
          saved("Los datos y el estado del cliente fueron actualizados.")
        }
      />
    </div>
  );
}

function DeleteClientDialog({
  client,
  onOpenChange,
  apiFetch,
  onDeleted,
}: {
  client: EditorialClient | null;
  onOpenChange: (open: boolean) => void;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  onDeleted: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch<{ success: true }>(`clients/${client.id}`, {
        method: "DELETE",
      });
      await onDeleted();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={Boolean(client)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <span className="mb-2 grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <Trash2 />
          </span>
          <DialogTitle>¿Eliminar este cliente?</DialogTitle>
          <DialogDescription>
            {client ? (
              <>
                Se eliminará <strong>{client.name}</strong> de forma permanente.
                Esta acción solo está disponible para administradores.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">
          Si el cliente ya tiene títulos, notas, aprobaciones o métricas, I HERE
          protegerá el historial y te pedirá desactivarlo en su lugar.
        </p>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            No, conservar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => void remove()}
          >
            <Trash2 />
            {busy ? "Eliminando…" : "Sí, eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: typeof Building2;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border bg-card p-4 shadow-card">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </div>
      <span
        className={`grid size-10 place-items-center rounded-xl ${accent ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary"}`}
      >
        <Icon />
      </span>
    </div>
  );
}

function ClientDialog({
  open,
  onOpenChange,
  client,
  apiFetch,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: EditorialClient;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const body = {
      name: data.get("name"),
      slug: data.get("slug") || undefined,
      ...(client ? { active: data.get("active") === "active" } : {}),
    };
    try {
      await apiFetch(client ? `clients/${client.id}` : "clients", {
        method: client ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      await onSaved();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {client ? "Editar cliente" : "Crear cliente editorial"}
          </DialogTitle>
          <DialogDescription>
            {client
              ? "Actualiza la identidad o disponibilidad del cliente dentro de este módulo."
              : "El cliente tendrá su propio expediente para títulos, notas, aprobaciones y resultados."}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" autoComplete="off" onSubmit={submit}>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor={`${client?.id ?? "new"}-client-name`}>
              Nombre del cliente
            </Label>
            <Input
              id={`${client?.id ?? "new"}-client-name`}
              name="name"
              defaultValue={client?.name}
              minLength={2}
              maxLength={160}
              required
              placeholder="Ej. Adecco Perú"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${client?.id ?? "new"}-client-slug`}>
              Identificador
            </Label>
            <Input
              id={`${client?.id ?? "new"}-client-slug`}
              name="slug"
              defaultValue={client?.slug}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              maxLength={80}
              placeholder="Se genera automáticamente"
            />
            <p className="text-xs text-muted-foreground">
              Se usa para ordenar expedientes; solo minúsculas, números y
              guiones.
            </p>
          </div>
          {client ? (
            <div className="space-y-1.5">
              <Label htmlFor={`${client.id}-client-active`}>
                Estado en Automatización de notas
              </Label>
              <select
                id={`${client.id}-client-active`}
                name="active"
                defaultValue={client.active ? "active" : "inactive"}
                className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
              >
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Al desactivarlo deja de aparecer en nuevos trabajos, sin borrar
                su historial.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {busy
                ? "Guardando…"
                : client
                  ? "Guardar cambios"
                  : "Crear cliente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ClientSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3" aria-busy="true">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-48 rounded-2xl" />
      ))}
    </div>
  );
}

function message(reason: unknown) {
  return reason instanceof ApiError || reason instanceof Error
    ? reason.message
    : "Ocurrió un error inesperado.";
}
