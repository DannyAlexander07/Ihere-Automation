import type { Metadata } from "next";
import { ArrowRight, ChartNoAxesCombined, LockKeyhole, Workflow } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { LoginMascot } from "@/components/auth/login-mascot";
import { BrandMark } from "@/components/brand/brand-mark";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { safeInternalPath } from "@/lib/safe-navigation";

export const metadata: Metadata = { title: "Acceso" };

const capabilities = [
  { icon: Workflow, tone: "sky", title: "Procesos conectados", detail: "Tareas, revisiones y entregas en un solo lugar." },
  { icon: ChartNoAxesCombined, tone: "sun", title: "Información visible", detail: "Avances y resultados siempre a la vista." },
  { icon: LockKeyhole, tone: "coral", title: "Control y trazabilidad", detail: "Permisos, decisiones e historial bajo control." },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const nextPath = safeInternalPath(next);
  return (
    <main className="login-shell relative grid h-dvh overflow-hidden lg:grid-cols-[minmax(420px,1fr)_minmax(520px,0.95fr)]">
        <LoginMascot />

        <section className="login-brand-panel relative hidden overflow-hidden border-r p-8 lg:flex lg:flex-col lg:justify-between xl:p-12">
          <div className="surface-grid absolute inset-0 opacity-30" />
          <span className="login-brand-shape login-brand-shape-one" aria-hidden="true" />
          <span className="login-brand-shape login-brand-shape-two" aria-hidden="true" />
          <span className="login-brand-shape login-brand-shape-three" aria-hidden="true" />
          <div className="relative z-10">
            <BrandMark />
          </div>

          <div className="login-brand-copy relative z-10 max-w-lg py-6">
            <span className="login-brand-kicker mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em]">
              <i aria-hidden="true" /> Plataforma de operaciones
            </span>
            <h1 className="text-balance text-4xl font-semibold leading-[1.08] xl:text-[3.05rem]">
              Tu trabajo, más claro. Tus procesos, en movimiento.
            </h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-muted-foreground xl:text-base">
              I HERE reúne las operaciones de la agencia en una experiencia simple, segura y preparada para crecer contigo.
            </p>
            <ul className="login-brand-list mt-8 grid gap-3">
              {capabilities.map(({ icon: Icon, tone, title, detail }) => (
                <li key={title} className="login-capability flex items-center gap-3 rounded-2xl border bg-white/80 p-3 shadow-card">
                  <span className={`login-capability-icon login-capability-icon-${tone}`}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative z-10 flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-[#20b99a]" /> I HERE · Plataforma interna
          </div>
        </section>

        <section className="login-access-panel relative flex min-h-0 items-center justify-center overflow-hidden px-5 py-4 sm:px-8 lg:px-12">
          <span className="login-access-shape login-access-shape-one" aria-hidden="true" />
          <span className="login-access-shape login-access-shape-two" aria-hidden="true" />
          <span className="login-access-shape login-access-shape-three" aria-hidden="true" />
          <div className="absolute right-4 top-4 z-20 lg:right-6 lg:top-6">
            <ThemeSwitcher />
          </div>
          <div className="login-form-panel relative z-10 w-full max-w-[460px] sm:rounded-[1.75rem] sm:border sm:bg-card/95 sm:p-8 sm:shadow-soft lg:p-9">
            <div className="mb-6 flex justify-center lg:hidden">
              <BrandMark />
            </div>
            <div className="mb-6">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                <span className="size-1.5 rounded-full bg-[#ffb547]" /> Acceso interno
              </p>
              <h2 className="text-balance text-2xl font-semibold">Qué bueno verte</h2>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                Ingresa con tus credenciales para continuar en I HERE.
              </p>
            </div>
            <LoginForm nextPath={nextPath} />
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>¿Necesitas acceso?</span>
              <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                Contacta al administrador <ArrowRight className="size-3" />
              </span>
            </div>
          </div>
        </section>
    </main>
  );
}
