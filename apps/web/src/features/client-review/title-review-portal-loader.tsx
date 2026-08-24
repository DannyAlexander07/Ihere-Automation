"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { apiRequest } from "@/lib/api/api-client";
import {
  TitleReviewPortal,
  type PublicTitleReview,
} from "./title-review-portal";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_TOKEN_KEY = "ihere:title-review-token";

type State =
  | { status: "loading" }
  | { status: "ready"; token: string; data: PublicTitleReview }
  | { status: "unavailable" };

export function TitleReviewPortalLoader() {
  const [state, setState] = useState<State>({ status: "loading" });

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
        const data = await apiRequest<PublicTitleReview>(
          "public/title-reviews/current",
          {
            headers: { "x-review-token": token },
            cache: "no-store",
            signal: controller.signal,
          },
        );
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
    return <TitleReviewPortal token="" initialData={null} unavailable />;
  }
  return (
    <TitleReviewPortal
      token={state.token}
      initialData={state.data}
      unavailable={false}
    />
  );
}

function decodeToken(hash: string) {
  if (!hash.startsWith("#")) return "";
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return "";
  }
}
