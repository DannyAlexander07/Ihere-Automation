"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  MessageSquareText,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-provider";

type Activity = {
  id: string;
  action: string;
  actorName: string;
  clientName: string | null;
  createdAt: string;
};

type NotificationSummary = {
  activity: Activity[];
};

export function NotificationMenu() {
  const { apiFetch } = useAuth();
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const summary = await apiFetch<NotificationSummary>("dashboard/summary");
      setActivity(summary.activity);
      setLoaded(true);
    } catch {
      setError("No pudimos actualizar la actividad.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  const handleOpenChange = (open: boolean) => {
    if (!open) return;
    setUnread(false);
    if (!loaded && !loading) void load();
  };

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative rounded-xl bg-card"
          aria-label="Abrir notificaciones"
        >
          <Bell />
          {unread ? (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive ring-2 ring-card" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden p-0"
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3.5">
          <div>
            <DropdownMenuLabel className="p-0 text-sm font-bold text-foreground">
              Actividad reciente
            </DropdownMenuLabel>
            <p className="mt-1 text-xs leading-4 text-muted-foreground">
              Cambios visibles según tus accesos.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Actualizar actividad"
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-[22rem] overflow-y-auto p-2">
          {loading && !loaded ? <NotificationSkeleton /> : null}
          {error ? (
            <div className="rounded-xl bg-destructive/8 p-4 text-center">
              <CircleAlert className="mx-auto size-5 text-destructive" />
              <p className="mt-2 text-xs font-semibold text-destructive">
                {error}
              </p>
            </div>
          ) : null}
          {!loading && !error && loaded && activity.length === 0 ? (
            <div className="rounded-xl border border-dashed p-5 text-center">
              <CheckCircle2 className="mx-auto size-5 text-emerald-600" />
              <p className="mt-2 text-xs font-bold">Todo está al día</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Las próximas decisiones aparecerán aquí.
              </p>
            </div>
          ) : null}
          {!error
            ? activity.map((entry) => (
                <ActivityRow key={entry.id} entry={entry} />
              ))
            : null}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <Button
          asChild
          variant="ghost"
          className="h-11 w-full rounded-none text-xs font-semibold"
        >
          <Link href="/inicio">Ver resumen de actividad</Link>
        </Button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ActivityRow({ entry }: { entry: Activity }) {
  const presentation = activityPresentation(entry.action);
  const Icon = presentation.icon;
  return (
    <div className="flex gap-3 rounded-xl px-3 py-3 hover:bg-muted/60">
      <span
        className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl ${presentation.color}`}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold leading-5">
          {entry.actorName} {presentation.label}
        </p>
        <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
          {[entry.clientName, formatDate(entry.createdAt)]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </div>
  );
}

function NotificationSkeleton() {
  return (
    <div className="space-y-2" aria-label="Cargando actividad">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex gap-3 rounded-xl p-3">
          <Skeleton className="size-8 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-2.5 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function activityPresentation(action: string) {
  if (action.includes("approve")) {
    return {
      icon: CheckCircle2,
      label: "registró una aprobación",
      color: "bg-emerald-50 text-emerald-700",
    };
  }
  if (
    action.includes("request_changes") ||
    action.includes("updated") ||
    action.includes("version")
  ) {
    return {
      icon: MessageSquareText,
      label: "registró un cambio",
      color: "bg-accent text-accent-foreground",
    };
  }
  return {
    icon: FileCheck2,
    label: "actualizó el flujo editorial",
    color: "bg-secondary text-primary",
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
