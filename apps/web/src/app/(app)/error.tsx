"use client";

import { useEffect } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ProductError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Card className="w-full max-w-lg border-destructive/20 shadow-card">
        <CardContent className="p-8 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive"><CircleAlert /></div>
          <h1 className="mt-4 text-2xl font-extrabold">No pudimos cargar esta vista</h1>
          <p className="mt-2 text-sm text-muted-foreground">Tu información no se modificó. Puedes intentarlo nuevamente.</p>
          <Button className="mt-6" onClick={reset}><RotateCcw />Reintentar</Button>
        </CardContent>
      </Card>
    </div>
  );
}
