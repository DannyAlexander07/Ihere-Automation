import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewPortalLoader } from "./review-portal-loader";

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock("@/lib/api/api-client", () => ({ apiRequest: apiRequestMock }));
vi.mock("./review-portal", () => ({
  ReviewPortal: ({
    token,
    unavailable,
  }: {
    token: string;
    unavailable: boolean;
  }) => <div>{unavailable ? "unavailable" : `ready:${token}`}</div>,
}));

const token = "A".repeat(43);

describe("ReviewPortalLoader", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({ client: { name: "Adecco Perú" } });
    window.sessionStorage.clear();
    window.history.replaceState(null, "", `/revision#${token}`);
  });

  it("extrae el secreto del fragmento, limpia la URL y consulta por encabezado", async () => {
    render(<ReviewPortalLoader />);

    expect(await screen.findByText(`ready:${token}`)).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledWith("public/reviews/current", {
      headers: { "x-review-token": token },
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
    expect(window.location.pathname).toBe("/revision");
    expect(window.location.hash).toBe("");
    expect(window.sessionStorage.getItem("ihere:client-review-token")).toBe(
      token,
    );
  });

  it("permite recargar dentro de la misma pestaña sin volver a exponer el token", async () => {
    window.sessionStorage.setItem("ihere:client-review-token", token);
    window.history.replaceState(null, "", "/revision");

    render(<ReviewPortalLoader />);

    expect(await screen.findByText(`ready:${token}`)).toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });

  it("rechaza fragmentos malformados sin llamar al API", async () => {
    window.history.replaceState(null, "", "/revision#token-corto");

    render(<ReviewPortalLoader />);

    await waitFor(() =>
      expect(screen.getByText("unavailable")).toBeInTheDocument(),
    );
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});
