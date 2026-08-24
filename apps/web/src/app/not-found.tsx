import Link from "next/link";
import { ArrowLeft, MapPinOff } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="app-canvas grid min-h-screen place-items-center p-5 text-center">
      <div>
        <BrandMark className="justify-center" />
        <div className="mx-auto mt-10 grid size-16 place-items-center rounded-2xl bg-secondary text-primary"><MapPinOff className="size-7" /></div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-primary">Error 404</p>
        <h1 className="mt-2 text-3xl font-extrabold">Esta vista no existe</h1>
        <p className="mt-2 text-sm text-muted-foreground">Regresa al espacio principal para continuar trabajando.</p>
        <Button asChild className="mt-6"><Link href="/inicio"><ArrowLeft />Volver al inicio</Link></Button>
      </div>
    </main>
  );
}
