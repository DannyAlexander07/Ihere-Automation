"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const labels = {
  searching: "Buscando fuentes",
  solving: "Evaluando criterios",
  composing: "Redactando contenido",
  shaping: "Preparando entrega",
  working: "Procesando",
} as const;

export type OrbState = keyof typeof labels;

export function ActivityOrb({
  state = "working",
  showLabel = true,
  className,
}: {
  state?: OrbState;
  showLabel?: boolean;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={cn("inline-flex items-center gap-3", className)}
      role={showLabel ? "status" : undefined}
      aria-label={showLabel ? labels[state] : undefined}
    >
      <motion.span
        className="relative block size-11 shrink-0"
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 8, ease: "linear", repeat: Infinity }}
        aria-hidden="true"
      >
        <motion.span
          className="absolute left-0 top-1 size-7 rounded-full bg-[var(--brand-violet)]/85 blur-[1px]"
          animate={reduceMotion ? undefined : { scale: [0.82, 1.06, 0.82], x: [0, 6, 0] }}
          transition={{ duration: 2.2, ease: "easeInOut", repeat: Infinity }}
        />
        <motion.span
          className="absolute bottom-0 right-0 size-7 rounded-full bg-[var(--brand-pink)]/80 blur-[1px]"
          animate={reduceMotion ? undefined : { scale: [1.05, 0.8, 1.05], x: [0, -5, 0] }}
          transition={{ duration: 2.2, ease: "easeInOut", repeat: Infinity }}
        />
        <span className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm" />
      </motion.span>
      {showLabel && <span className="text-sm font-medium text-muted-foreground">{labels[state]}…</span>}
    </div>
  );
}
