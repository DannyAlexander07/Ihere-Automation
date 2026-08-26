"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Mail,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  LogIn,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/auth-provider";

const loginSchema = z.object({
  email: z.string().email("Ingresa un correo válido"),
  password: z.string().min(5, "La contraseña debe tener al menos 5 caracteres"),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm({ nextPath = "/inicio" }: { nextPath?: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { login, status } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    if (status === "authenticated") router.replace(nextPath);
  }, [nextPath, router, status]);

  const onSubmit = async (values: LoginValues) => {
    setServerError(null);
    setSubmitting(true);
    try {
      await login(values.email.trim().toLowerCase(), values.password);
      router.replace(nextPath);
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : "No pudimos iniciar sesión.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className="space-y-4"
      autoComplete="off"
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="email">Correo</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            inputMode="email"
            maxLength={254}
            placeholder="nombre@empresa.com"
            autoComplete="off"
            className="login-input h-11 pl-10"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
        </div>
        {errors.email && (
          <p id="email-error" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="password">Contraseña</Label>
          <span className="text-xs text-muted-foreground">
            Recuperación con el administrador
          </span>
        </div>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="Ingresa tu contraseña"
            autoComplete="off"
            className="login-input h-11 px-10"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={
              showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
            }
          >
            {showPassword ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
        {errors.password && (
          <p id="password-error" className="text-sm text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>

      {serverError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>No pudimos ingresar</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={submitting || status === "loading"}
        className="login-submit-button h-11 w-full"
      >
        {submitting ? <LoaderCircle className="animate-spin" /> : <LogIn />}
        {submitting ? "Verificando acceso…" : "Ingresar de forma segura"}
      </Button>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs leading-5 text-muted-foreground">
        <LockKeyhole className="size-3.5 shrink-0" aria-hidden="true" />
        Acceso protegido y actividad registrada.
      </p>
    </form>
  );
}
