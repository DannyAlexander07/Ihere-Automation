import Link from "next/link";
import { BarChart3, CircleOff, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PerformanceCard({
  analytics,
}: {
  analytics: { status: "NOT_CONFIGURED" | "CONNECTED" | "ERROR"; provider: string | null; message: string };
}) {
  return (
    <Card className="border-border/80 bg-card/95 shadow-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
        <div>
          <CardTitle className="text-base">Rendimiento de contenidos</CardTitle>
          <CardDescription className="mt-1">Solo se mostrarán datos obtenidos de integraciones autorizadas.</CardDescription>
        </div>
        <Badge variant="outline" className="bg-card">{analytics.status === "CONNECTED" ? analytics.provider : "Sin conexión"}</Badge>
      </CardHeader>
      <CardContent>
        <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/25 p-6 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary">
            {analytics.status === "ERROR" ? <CircleOff className="size-5" /> : <BarChart3 className="size-5" />}
          </span>
          <p className="mt-3 text-sm font-semibold">Métricas no disponibles todavía</p>
          <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{analytics.message}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/portal/resultados"><Settings2 />Revisar configuración</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
