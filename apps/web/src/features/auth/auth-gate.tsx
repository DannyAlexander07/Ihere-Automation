"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ActivityOrb } from "@/components/brand/activity-orb";
import { useAuth } from "./auth-provider";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      const next = pathname.startsWith("/") ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
    }
  }, [pathname, router, status]);

  if (status !== "authenticated") {
    return (
      <main className="app-canvas grid min-h-screen place-items-center p-6">
        <div className="rounded-2xl border bg-card/90 px-8 py-7 text-center shadow-card">
          <ActivityOrb state="solving" className="justify-center" />
          <p className="mt-4 text-sm font-semibold">Verificando tu sesión segura</p>
          <p className="mt-1 text-xs text-muted-foreground">I HERE está preparando tu espacio de trabajo.</p>
        </div>
      </main>
    );
  }

  return children;
}
