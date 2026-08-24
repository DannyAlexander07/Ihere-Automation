"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { apiRequest } from "@/lib/api/api-client";
import { NotePackageReviewPortal, type PublicNotePackageReview } from "./note-package-review-portal";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_KEY = "ihere:note-package-review-token";

type State =
  | { status: "loading" }
  | { status: "ready"; token: string; data: PublicNotePackageReview }
  | { status: "unavailable" };

export function NotePackageReviewPortalLoader() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const load = async () => {
      const fragment = decodeToken(window.location.hash);
      const token = fragment || window.sessionStorage.getItem(SESSION_KEY) || "";
      if (fragment) {
        window.sessionStorage.setItem(SESSION_KEY, fragment);
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }
      if (!TOKEN_PATTERN.test(token)) {
        setState({ status: "unavailable" });
        return;
      }
      try {
        const data = await apiRequest<PublicNotePackageReview>("public/note-package-reviews/current", {
          headers: { "x-review-token": token },
          cache: "no-store",
          signal: controller.signal,
        });
        if (active) setState({ status: "ready", token, data });
      } catch {
        if (!active) return;
        window.sessionStorage.removeItem(SESSION_KEY);
        setState({ status: "unavailable" });
      }
    };
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  if (state.status === "loading") {
    return <main className="grid min-h-screen place-items-center bg-muted/30 p-5"><div className="text-center text-sm text-muted-foreground"><LoaderCircle className="mx-auto mb-3 size-6 animate-spin text-primary" />Preparando las notas para revisión…</div></main>;
  }
  return <NotePackageReviewPortal token={state.status === "ready" ? state.token : ""} initialData={state.status === "ready" ? state.data : null} unavailable={state.status === "unavailable"} />;
}

function decodeToken(hash: string) {
  if (!hash.startsWith("#")) return "";
  try { return decodeURIComponent(hash.slice(1)); } catch { return ""; }
}
