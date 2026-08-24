"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { apiRequest } from "@/lib/api/api-client";
import { ResultsPortal } from "./results-portal";
import type { PublicResults } from "./types";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_TOKEN_KEY = "ihere:results-portal-token";

type PortalState =
  | { status: "loading" }
  | { status: "ready"; data: PublicResults }
  | { status: "unavailable" };

export function ResultsPortalLoader() {
  const [state, setState] = useState<PortalState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const load = async () => {
      const fragmentToken = decodeToken(window.location.hash);
      const token =
        fragmentToken || window.sessionStorage.getItem(SESSION_TOKEN_KEY) || "";
      if (fragmentToken) {
        window.sessionStorage.setItem(SESSION_TOKEN_KEY, fragmentToken);
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
      }
      if (!TOKEN_PATTERN.test(token)) {
        if (active) setState({ status: "unavailable" });
        return;
      }
      try {
        const data = await apiRequest<PublicResults>("public/results/current", {
          headers: { "x-results-token": token },
          cache: "no-store",
          signal: controller.signal,
        });
        if (active) setState({ status: "ready", data });
      } catch {
        window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
        if (active) setState({ status: "unavailable" });
      }
    };
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  if (state.status === "loading") {
    return (
      <main
        className="grid min-h-screen place-items-center bg-[#f5f8fb] p-5"
        aria-live="polite"
      >
        <div className="rounded-2xl border bg-white px-8 py-7 text-center text-sm text-muted-foreground shadow-card">
          <LoaderCircle className="mx-auto mb-3 size-7 animate-spin text-primary" />
          Preparando tus resultados…
        </div>
      </main>
    );
  }
  return <ResultsPortal data={state.status === "ready" ? state.data : null} />;
}

function decodeToken(hash: string): string {
  if (!hash.startsWith("#")) return "";
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return "";
  }
}
