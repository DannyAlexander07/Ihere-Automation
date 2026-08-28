"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  BrainCircuit,
  CheckCircle2,
  LoaderCircle,
  Plus,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/auth-provider";
import type { ApiClientSummary } from "@/features/titles/title-api";
import { ApiError } from "@/lib/api/api-client";

type Signal = {
  id: string;
  clientId: string;
  field: string;
  beforeValue: string;
  afterValue: string;
  reason: string;
  correctionType: string;
  createdAt: string;
  client: { name: string };
  proposal: { id: string; title: string } | null;
  note: { id: string; versions: Array<{ title: string }> } | null;
  actor: { displayName: string };
};

type Rule = {
  id: string;
  clientId: string | null;
  code: string;
  title: string;
  description: string;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  evidenceCount: number;
  approvedAt: string | null;
  client: { name: string } | null;
  approvedBy: { displayName: string } | null;
  correctionSignals: Array<{
    id: string;
    field: string;
    afterValue: string;
    reason: string;
  }>;
  glossary: {
    entries: Array<{
      preferredTerm: string;
      variants: string[];
      guidance?: string;
    }>;
  } | null;
};

type PendingRuleChange = {
  rule: Rule;
  status: "ACTIVE" | "RETIRED";
  action: "restore" | "retire";
};

export function LearningWorkspace() {
  const { apiFetch, user } = useAuth();
  const [clients, setClients] = useState<ApiClientSummary[]>([]);
  const [clientId, setClientId] = useState("");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ruleKind, setRuleKind] = useState<"instruction" | "glossary">(
    "instruction",
  );
  const [preferredTerm, setPreferredTerm] = useState("");
  const [variants, setVariants] = useState("");
  const [guidance, setGuidance] = useState("");
  const [pendingChange, setPendingChange] = useState<PendingRuleChange | null>(
    null,
  );

  const loadData = useCallback(
    async (nextClientId: string) => {
      if (!nextClientId) return;
      const query = `clientId=${encodeURIComponent(nextClientId)}`;
      const [nextSignals, nextRules] = await Promise.all([
        apiFetch<Signal[]>(`learning/signals?${query}`),
        apiFetch<Rule[]>(`learning/rules?${query}`),
      ]);
      setSignals(nextSignals);
      setRules(nextRules);
      setSelected((current) =>
        current.filter((id) => nextSignals.some((signal) => signal.id === id)),
      );
    },
    [apiFetch],
  );

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      try {
        const nextClients = await apiFetch<ApiClientSummary[]>("clients");
        const nextClientId = nextClients[0]?.id ?? "";
        if (cancelled) return;
        setClients(nextClients);
        setClientId(nextClientId);
        if (nextClientId) await loadData(nextClientId);
      } catch (reason) {
        if (!cancelled) setError(messageFrom(reason));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [apiFetch, loadData]);

  const stats = useMemo(
    () => ({
      signals: signals.length,
      drafts: rules.filter((rule) => rule.status === "DRAFT").length,
      active: rules.filter((rule) => rule.status === "ACTIVE").length,
    }),
    [rules, signals],
  );

  const changeClient = async (next: string) => {
    setClientId(next);
    setLoading(true);
    setError(null);
    try {
      await loadData(next);
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setLoading(false);
    }
  };

  const createRule = async () => {
    if (
      !clientId ||
      !selected.length ||
      title.trim().length < 5 ||
      description.trim().length < 10 ||
      (ruleKind === "glossary" &&
        (preferredTerm.trim().length < 2 ||
          variants.split(",").filter((item) => item.trim()).length === 0))
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("learning/rules", {
        method: "POST",
        body: JSON.stringify({
          clientId,
          code: slugify(title),
          title: title.trim(),
          description: description.trim(),
          signalIds: selected,
          ...(ruleKind === "glossary"
            ? {
                glossary: {
                  entries: [
                    {
                      preferredTerm: preferredTerm.trim(),
                      variants: variants
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                      ...(guidance.trim() ? { guidance: guidance.trim() } : {}),
                    },
                  ],
                },
              }
            : {}),
        }),
      });
      setDialogOpen(false);
      setTitle("");
      setDescription("");
      setRuleKind("instruction");
      setPreferredTerm("");
      setVariants("");
      setGuidance("");
      setSelected([]);
      await loadData(clientId);
      setNotice(
        "La regla quedó en borrador. Todavía no influye en ninguna generación.",
      );
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (rule: Rule, status: "ACTIVE" | "RETIRED") => {
    setBusy(true);
    setError(null);
    try {
      const restoring = rule.status === "RETIRED" && status === "ACTIVE";
      await apiFetch(
        restoring
          ? `learning/rules/${rule.id}/restore`
          : `learning/rules/${rule.id}/status`,
        restoring
          ? { method: "POST", body: "{}" }
          : { method: "PATCH", body: JSON.stringify({ status }) },
      );
      await loadData(clientId);
      setPendingChange(null);
      setNotice(
        restoring
          ? "Regla recuperada. Vuelve a estar activa y la decisión quedó auditada."
          : status === "ACTIVE"
            ? "Regla activada. Las próximas generaciones podrán aplicarla."
            : "Regla retirada. Ya no se aplicará a nuevas generaciones.",
      );
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  };

  const requestProtectedChange = (rule: Rule, status: "ACTIVE" | "RETIRED") => {
    setPendingChange({
      rule,
      status,
      action: rule.status === "RETIRED" ? "restore" : "retire",
    });
  };

  const canApprove = Boolean(user?.permissions.includes("learning.approve"));
  const canRestore = Boolean(
    user?.tenantPermissions.includes("learning.restore"),
  );

  return (
    <div className="space-y-4">
      <section className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-4 shadow-card lg:flex-row lg:items-center">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-primary">
            <BrainCircuit className="size-3.5" />
            Automatización de notas
          </div>
          <h1 className="text-xl font-semibold sm:text-2xl">
            Aprendizaje editorial controlado
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Convierte correcciones humanas en reglas verificables. Solo las
            reglas activas influyen en la automatización editorial.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={clientId}
            onChange={(event) => void changeClient(event.target.value)}
            className="h-10 rounded-lg border bg-card px-3 text-sm"
            aria-label="Seleccionar cliente"
          >
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <Button
            onClick={() => setDialogOpen(true)}
            disabled={
              !selected.length || !user?.permissions.includes("learning.manage")
            }
          >
            <Plus />
            Crear regla ({selected.length})
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        {[
          ["Señales pendientes", stats.signals],
          ["Reglas en borrador", stats.drafts],
          ["Reglas activas", stats.active],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardContent className="p-3.5">
              <p className="text-[11px] text-muted-foreground">
                {label as string}
              </p>
              <p className="mt-1 text-xl font-semibold">{value as number}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      {error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Revisa la operación</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
          <CheckCircle2 />
          <AlertTitle>Cambio registrado</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <Card>
          <CardContent className="grid min-h-64 place-items-center">
            <LoaderCircle className="size-7 animate-spin text-primary" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Señales de corrección</CardTitle>
              <CardDescription>
                Selecciona evidencia coherente; una edición aislada no debe
                convertirse automáticamente en regla.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {signals.length ? (
                signals.map((signal) => (
                  <label
                    key={signal.id}
                    className="flex cursor-pointer gap-3 rounded-xl border p-3 hover:bg-secondary/30"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(signal.id)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, signal.id]
                            : current.filter((id) => id !== signal.id),
                        )
                      }
                      className="mt-1"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{signal.correctionType}</Badge>
                        <Badge variant="secondary">{signal.field}</Badge>
                      </div>
                      <p className="mt-2 text-sm font-semibold">
                        {signal.proposal?.title ??
                          signal.note?.versions[0]?.title ??
                          "Observación editorial del cliente"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {signal.beforeValue} →{" "}
                        <span className="text-foreground">
                          {signal.afterValue}
                        </span>
                      </p>
                      <p className="mt-2 text-xs">{signal.reason}</p>
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        {signal.actor.displayName} ·{" "}
                        {new Date(signal.createdAt).toLocaleDateString("es-PE")}
                      </p>
                    </div>
                  </label>
                ))
              ) : (
                <Empty text="No hay señales pendientes para este cliente." />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reglas editoriales</CardTitle>
              <CardDescription>
                Estados: borrador, activa o retirada. No se eliminan para
                conservar trazabilidad.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {rules.length ? (
                rules.map((rule) => (
                  <div key={rule.id} className="rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{rule.title}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {rule.description}
                        </p>
                      </div>
                      <Badge
                        variant={
                          rule.status === "ACTIVE" ? "default" : "outline"
                        }
                      >
                        {rule.status === "ACTIVE"
                          ? "Activa"
                          : rule.status === "DRAFT"
                            ? "Borrador"
                            : "Retirada"}
                      </Badge>
                    </div>
                    {rule.glossary?.entries?.length ? (
                      <div className="mt-3 rounded-lg bg-secondary/45 p-3 text-xs">
                        {rule.glossary.entries.map((entry) => (
                          <p key={entry.preferredTerm} className="leading-5">
                            <strong>{entry.preferredTerm}</strong> reemplaza a{" "}
                            {entry.variants.join(", ")}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                      <span className="text-[10px] text-muted-foreground">
                        {rule.evidenceCount} evidencia(s) · {rule.code}
                      </span>
                      <div className="flex gap-2">
                        {rule.status === "DRAFT" ? (
                          <Button
                            size="sm"
                            onClick={() => void setStatus(rule, "ACTIVE")}
                            disabled={busy || !canApprove}
                          >
                            <ShieldCheck />
                            Activar
                          </Button>
                        ) : null}
                        {rule.status === "ACTIVE" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              requestProtectedChange(rule, "RETIRED")
                            }
                            disabled={busy || !canApprove}
                          >
                            <Archive />
                            Retirar
                          </Button>
                        ) : null}
                        {rule.status === "RETIRED" && canRestore ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              requestProtectedChange(rule, "ACTIVE")
                            }
                            disabled={busy}
                          >
                            <RotateCcw />
                            Recuperar
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <Empty text="Todavía no hay reglas para este cliente." />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => !busy && setDialogOpen(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear regla candidata</DialogTitle>
            <DialogDescription>
              La regla quedará en borrador y requerirá una activación separada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rule-kind">Tipo de aprendizaje</Label>
              <select
                id="rule-kind"
                value={ruleKind}
                onChange={(event) =>
                  setRuleKind(event.target.value as "instruction" | "glossary")
                }
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="instruction">Criterio editorial</option>
                <option value="glossary">Terminología y glosario</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-title">Nombre de la regla</Label>
              <Input
                id="rule-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={180}
              />
            </div>
            {ruleKind === "glossary" ? (
              <div className="grid gap-4 rounded-xl border bg-muted/30 p-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="preferred-term">Término autorizado</Label>
                  <Input
                    id="preferred-term"
                    autoComplete="off"
                    value={preferredTerm}
                    onChange={(event) => setPreferredTerm(event.target.value)}
                    maxLength={160}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="term-variants">
                    Formas que deben evitarse
                  </Label>
                  <Input
                    id="term-variants"
                    autoComplete="off"
                    value={variants}
                    onChange={(event) => setVariants(event.target.value)}
                    placeholder="Separadas por comas"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="term-guidance">Orientación (opcional)</Label>
                  <Textarea
                    id="term-guidance"
                    value={guidance}
                    onChange={(event) => setGuidance(event.target.value)}
                    maxLength={500}
                  />
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="rule-description">
                Instrucción clara y aplicable
              </Label>
              <Textarea
                id="rule-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2000}
                className="min-h-28"
              />
            </div>
            <Alert>
              <BrainCircuit />
              <AlertTitle>
                {selected.length} señal(es) como evidencia
              </AlertTitle>
              <AlertDescription>
                Revisa que representen una preferencia estable y no una
                excepción de una sola nota.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void createRule()}
              disabled={
                busy ||
                title.trim().length < 5 ||
                description.trim().length < 10 ||
                (ruleKind === "glossary" &&
                  (preferredTerm.trim().length < 2 ||
                    variants.split(",").filter((item) => item.trim()).length ===
                      0))
              }
            >
              {busy ? <LoaderCircle className="animate-spin" /> : <Plus />}Crear
              borrador
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingChange)}
        onOpenChange={(open) => {
          if (!open && !busy) setPendingChange(null);
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>
              {pendingChange?.action === "restore"
                ? "Recuperar regla"
                : "Retirar regla"}
            </DialogTitle>
            <DialogDescription>
              {pendingChange?.action === "restore"
                ? `¿Estás seguro de recuperar “${pendingChange.rule.title}”? Volverá a aplicarse en las próximas generaciones y la acción quedará auditada.`
                : `¿Estás seguro de retirar “${pendingChange?.rule.title ?? "esta regla"}”? Dejará de aplicarse en las próximas generaciones.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={busy}>
                No, cancelar
              </Button>
            </DialogClose>
            <Button
              variant={
                pendingChange?.action === "retire" ? "destructive" : "default"
              }
              disabled={busy || !pendingChange}
              onClick={() => {
                if (!pendingChange) return;
                void setStatus(pendingChange.rule, pendingChange.status);
              }}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" />
              ) : pendingChange?.action === "restore" ? (
                <RotateCcw />
              ) : (
                <Archive />
              )}
              {pendingChange?.action === "restore"
                ? "Sí, recuperar"
                : "Sí, retirar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}
function messageFrom(error: unknown) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado.";
}
