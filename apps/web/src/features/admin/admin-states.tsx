import { AlertTriangle, Ban, Inbox, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function ForbiddenAdminState() {
  return (
    <section className="mx-auto flex min-h-[55vh] max-w-xl items-center" aria-labelledby="forbidden-title">
      <div className="w-full rounded-xl border bg-card p-6 text-center shadow-card">
        <Ban className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
        <h1 id="forbidden-title" className="mt-3 text-xl font-semibold">Acceso restringido</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tu cuenta no tiene permisos organizacionales para consultar esta sección.
        </p>
      </div>
    </section>
  );
}

export function AdminError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive" role="alert">
      <AlertTriangle />
      <AlertTitle>No pudimos completar la consulta</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{message}</span>
        <Button variant="outline" size="sm" onClick={onRetry}><RefreshCw />Reintentar</Button>
      </AlertDescription>
    </Alert>
  );
}

export function AdminLoading({ label = "Cargando administración" }: { label?: string }) {
  return (
    <div className="space-y-3" aria-label={label} aria-busy="true">
      <Skeleton className="h-10 rounded-xl" />
      {[0, 1, 2].map((item) => <Skeleton key={item} className="h-20 rounded-xl" />)}
    </div>
  );
}

export function AdminEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/20 px-5 py-10 text-center">
      <Inbox className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="mt-3 font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ocurrió un error inesperado.";
}
