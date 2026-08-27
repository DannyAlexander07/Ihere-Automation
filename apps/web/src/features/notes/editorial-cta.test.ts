import { describe, expect, it } from "vitest";
import {
  ADECCO_CONTACT_URL,
  editorialCtaActionLabel,
} from "./editorial-cta";

describe("editorialCtaActionLabel", () => {
  it("usa una acción explícita para el contacto oficial de Adecco", () => {
    expect(editorialCtaActionLabel(ADECCO_CONTACT_URL)).toBe(
      "Contacta a un especialista",
    );
  });

  it("conserva una etiqueta neutra para otros destinos", () => {
    expect(editorialCtaActionLabel("https://example.com/servicio")).toBe(
      "Abrir información relacionada",
    );
  });
});
