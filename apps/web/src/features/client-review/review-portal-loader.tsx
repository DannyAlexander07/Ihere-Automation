"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { apiRequest } from "@/lib/api/api-client";
import { ReviewPortal, type PublicReview } from "./review-portal";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_TOKEN_KEY = "ihere:client-review-token";

type ReviewState =
  | { status: "loading" }
  | { status: "ready"; token: string; data: PublicReview }
  | { status: "unavailable" };

export function ReviewPortalLoader() {
  const [state, setState] = useState<ReviewState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const load = async () => {
      const fragmentToken = decodeFragmentToken(window.location.hash);
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
        const data = await apiRequest<PublicReview>("public/reviews/current", {
          headers: { "x-review-token": token },
          cache: "no-store",
          signal: controller.signal,
        });
        if (active) setState({ status: "ready", token, data });
      } catch {
        if (!active) return;
        window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
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
    return (
      <main
        className="grid min-h-screen place-items-center bg-muted/30 p-5"
        aria-live="polite"
      >
        <div className="text-center text-sm text-muted-foreground">
          <LoaderCircle className="mx-auto mb-3 size-6 animate-spin text-primary" />
          Validando enlace seguro…
        </div>
      </main>
    );
  }

  if (state.status === "unavailable") {
    return <ReviewPortal token="" initialData={null} unavailable />;
  }

  return (
    <ReviewPortal
      token={state.token}
      initialData={state.data}
      unavailable={false}
    />
  );
}

function decodeFragmentToken(hash: string): string {
  if (!hash.startsWith("#")) return "";
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return "";
  }
}
