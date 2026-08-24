import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResultsPortalLoader } from "./results-portal-loader";

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));

vi.mock("@/lib/api/api-client", () => ({ apiRequest: apiRequestMock }));
vi.mock("./results-portal", () => ({
  ResultsPortal: ({ data }: { data: unknown }) => (
    <div>{data ? "resultados-listos" : "enlace-no-disponible"}</div>
  ),
}));

const token = "R".repeat(43);

describe("ResultsPortalLoader", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({ client: { name: "Adecco Perú" } });
    window.sessionStorage.clear();
    window.history.replaceState(null, "", `/resultados#${token}`);
  });

  it("retira el token de la URL y lo envía solo en el encabezado", async () => {
    render(<ResultsPortalLoader />);
    expect(await screen.findByText("resultados-listos")).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledWith("public/results/current", {
      headers: { "x-results-token": token },
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
    expect(window.location.hash).toBe("");
    expect(window.sessionStorage.getItem("ihere:results-portal-token")).toBe(
      token,
    );
  });

  it("rechaza fragmentos malformados sin consultar el API", async () => {
    window.history.replaceState(null, "", "/resultados#corto");
    render(<ResultsPortalLoader />);
    await waitFor(() =>
      expect(screen.getByText("enlace-no-disponible")).toBeInTheDocument(),
    );
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});
