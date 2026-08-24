"use client";

import { useState, type FormEvent } from "react";
import {
  Check,
  ChevronDown,
  KeyRound,
  LogOut,
  Mail,
  Palette,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Avatar, AvatarBadge, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { appThemes, useAppTheme } from "@/components/theme/theme-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/auth-provider";
import { cn } from "@/lib/utils";

export function AccountMenu({
  loggingOut,
  onLogout,
}: {
  loggingOut: boolean;
  onLogout: () => void;
}) {
  const { user, apiFetch, refreshUser } = useAuth();
  const { theme, setTheme } = useAppTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [preferencesBusy, setPreferencesBusy] = useState(false);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [preferencesNotice, setPreferencesNotice] = useState<string | null>(
    null,
  );
  const initials = initialsFrom(user?.displayName ?? "I HERE");
  const roleLabel = user?.tenantPermissions.includes("users.manage")
    ? "Administrador"
    : "Colaborador";

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPreferencesBusy(true);
    setPreferencesError(null);
    setPreferencesNotice(null);
    try {
      await apiFetch("auth/me/profile", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: data.get("displayName"),
          email: data.get("email") || null,
        }),
      });
      await refreshUser();
      setPreferencesNotice("Tus datos se actualizaron correctamente.");
    } catch (error) {
      setPreferencesError(preferenceError(error));
    } finally {
      setPreferencesBusy(false);
    }
  }

  async function changeCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPreferencesBusy(true);
    setPreferencesError(null);
    setPreferencesNotice(null);
    try {
      await apiFetch("auth/me/credentials", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: data.get("currentPassword"),
          newDni: data.get("newDni") || undefined,
          newPassword: data.get("newPassword") || undefined,
        }),
      });
      form.reset();
      setPreferencesNotice(
        "Tus credenciales se actualizaron. Las demás sesiones quedaron cerradas.",
      );
    } catch (error) {
      setPreferencesError(preferenceError(error));
    } finally {
      setPreferencesBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl p-1.5 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Abrir menú de usuario"
          >
            <Avatar>
              <AvatarFallback className="bg-secondary font-semibold text-primary">
                {initials}
              </AvatarFallback>
              <AvatarBadge className="bg-emerald-500" />
            </Avatar>
            <span className="hidden xl:block">
              <span className="block max-w-36 truncate text-xs font-semibold leading-4">
                {user?.displayName}
              </span>
              <span className="block text-[10px] text-muted-foreground">
                {roleLabel}
              </span>
            </span>
            <ChevronDown className="hidden size-3.5 text-muted-foreground xl:block" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-[min(18rem,calc(100vw-1.5rem))] p-2"
        >
          <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2.5">
            <Avatar size="sm">
              <AvatarFallback className="bg-secondary font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">
                {user?.displayName}
              </span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {user?.email ?? roleLabel}
              </span>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="min-h-10 gap-2.5 px-2.5"
            onSelect={() => setProfileOpen(true)}
          >
            <UserRound /> Perfil
          </DropdownMenuItem>
          <DropdownMenuItem
            className="min-h-10 gap-2.5 px-2.5"
            onSelect={() => setPreferencesOpen(true)}
          >
            <Settings /> Preferencias
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            className="min-h-10 gap-2.5 px-2.5"
            disabled={loggingOut}
            onSelect={onLogout}
          >
            <LogOut /> {loggingOut ? "Cerrando…" : "Cerrar sesión"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tu perfil</DialogTitle>
            <DialogDescription>
              Identidad y alcance asignados por la administración de I HERE.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-4 rounded-2xl border bg-secondary/35 p-4">
            <Avatar className="size-14">
              <AvatarFallback className="bg-primary text-lg font-bold text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-base font-bold">
                {user?.displayName}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{roleLabel}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ProfileDatum
              icon={Mail}
              label="Correo"
              value={user?.email ?? "No registrado"}
            />
            <ProfileDatum
              icon={ShieldCheck}
              label="Tipo de acceso"
              value={roleLabel}
            />
            <ProfileDatum
              icon={KeyRound}
              label="Permisos habilitados"
              value={String(user?.permissions.length ?? 0)}
            />
            <ProfileDatum
              icon={UserRound}
              label="Asignaciones por cliente"
              value={String(user?.clientIds.length ?? 0)}
            />
          </div>
          <p className="rounded-xl bg-muted/70 px-4 py-3 text-xs leading-5 text-muted-foreground">
            Si necesitas modificar estos datos o tus accesos, solicítalo a un
            administrador de la plataforma.
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={preferencesOpen} onOpenChange={setPreferencesOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preferencias</DialogTitle>
            <DialogDescription>
              Elige cómo quieres ver I HERE en este equipo.
            </DialogDescription>
          </DialogHeader>
          {preferencesError ? (
            <Alert variant="destructive">
              <AlertDescription>{preferencesError}</AlertDescription>
            </Alert>
          ) : null}
          {preferencesNotice ? (
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
              <Check />
              <AlertDescription>{preferencesNotice}</AlertDescription>
            </Alert>
          ) : null}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Palette className="size-4 text-primary" />
              <h3 className="text-sm font-bold">Tema visual</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {appThemes.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    "relative rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md",
                    theme === option.value
                      ? "border-primary bg-secondary/55 ring-2 ring-primary/20"
                      : "bg-card hover:border-primary/40",
                  )}
                  aria-pressed={theme === option.value}
                >
                  {theme === option.value ? (
                    <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" />
                    </span>
                  ) : null}
                  <span className="flex -space-x-1">
                    {option.colors.map((color) => (
                      <span
                        key={color}
                        className="size-7 rounded-full border-2 border-card"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </span>
                  <span className="mt-4 block font-bold">{option.name}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <form
            className="space-y-3 rounded-2xl border p-4"
            autoComplete="off"
            onSubmit={saveProfile}
          >
            <div>
              <h3 className="text-sm font-bold">Datos personales</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Estos cambios también aparecerán inmediatamente en tu perfil.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="preference-display-name">Nombre completo</Label>
                <Input
                  id="preference-display-name"
                  name="displayName"
                  defaultValue={user?.displayName ?? ""}
                  minLength={2}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="preference-email">Correo</Label>
                <Input
                  id="preference-email"
                  name="email"
                  type="email"
                  defaultValue={user?.email ?? ""}
                />
              </div>
            </div>
            <Button type="submit" disabled={preferencesBusy}>
              Guardar datos
            </Button>
          </form>
          <form
            className="space-y-3 rounded-2xl border p-4"
            autoComplete="off"
            onSubmit={changeCredentials}
          >
            <div>
              <h3 className="text-sm font-bold">DNI y contraseña</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Por seguridad no mostramos tu DNI actual. Completa únicamente lo
                que quieras cambiar y confirma con tu contraseña vigente.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="preference-new-dni">DNI nuevo (opcional)</Label>
                <Input
                  id="preference-new-dni"
                  name="newDni"
                  inputMode="numeric"
                  pattern="[0-9]{8}"
                  maxLength={8}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="preference-new-password">
                  Contraseña nueva (opcional)
                </Label>
                <Input
                  id="preference-new-password"
                  name="newPassword"
                  type="password"
                  minLength={5}
                />
                <p className="text-[11px] text-muted-foreground">
                  Mínimo 5 caracteres; recomendamos 12 o más.
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="preference-current-password">
                Contraseña actual
              </Label>
              <Input
                id="preference-current-password"
                name="currentPassword"
                type="password"
                minLength={5}
                required
              />
            </div>
            <Button type="submit" variant="outline" disabled={preferencesBusy}>
              Actualizar credenciales
            </Button>
          </form>
          <p className="rounded-xl bg-muted/70 px-4 py-3 text-xs leading-5 text-muted-foreground">
            La preferencia queda guardada en este navegador y también cambia los
            acentos de carpetas, botones y navegación.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

function preferenceError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No pudimos guardar los cambios. Inténtalo nuevamente.";
}

function ProfileDatum({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Icon className="size-3.5 text-primary" /> {label}
      </div>
      <p className="mt-2 break-words text-sm font-bold">{value}</p>
    </div>
  );
}

function initialsFrom(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
