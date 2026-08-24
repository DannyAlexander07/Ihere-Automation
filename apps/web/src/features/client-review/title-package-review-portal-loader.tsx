"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { apiRequest } from "@/lib/api/api-client";
import {
  TitlePackageReviewPortal,
  type PublicTitlePackageReview,
} from "./title-package-review-portal";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_TOKEN_KEY = "ihere:title-package-review-token";

type State =
  | { status: "loading" }
  | { status: "ready"; token: string; data: PublicTitlePackageReview }
  | { status: "unavailable" };

export function TitlePackageReviewPortalLoader() {
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
        const data = await apiRequest<PublicTitlePackageReview>(
          "public/title-package-reviews/current",
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
      <main className="grid min-h-screen place-items-center bg-muted/30 p-5">
        <div className="text-center text-sm text-muted-foreground">
          <LoaderCircle className="mx-auto mb-3 size-6 animate-spin text-primary" />
          Preparando el paquete de revisión…
        </div>
      </main>
    );
  }
  if (state.status === "unavailable") {
    return (
      <TitlePackageReviewPortal token="" initialData={null} unavailable />
    );
  }
  return (
    <TitlePackageReviewPortal
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
