import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequestRaw } from "./api-client";

describe("apiRequestRaw", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("evita respuestas autenticadas obsoletas por defecto", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequestRaw("notes/note-1", {}, "token");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/notes/note-1",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("respeta una politica de cache indicada explicitamente", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequestRaw("status", { cache: "reload" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/status",
      expect.objectContaining({ cache: "reload" }),
    );
  });
});
