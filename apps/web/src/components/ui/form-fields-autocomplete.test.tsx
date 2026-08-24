import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input } from "./input";
import { Textarea } from "./textarea";

describe("campos sin autocompletado", () => {
  it("fuerza autocomplete off incluso si una pantalla intenta habilitarlo", () => {
    render(
      <>
        <Input aria-label="Campo de texto" autoComplete="email" />
        <Textarea aria-label="Campo largo" autoComplete="on" />
      </>,
    );

    expect(screen.getByLabelText("Campo de texto")).toHaveAttribute(
      "autocomplete",
      "off",
    );
    expect(screen.getByLabelText("Campo largo")).toHaveAttribute(
      "autocomplete",
      "off",
    );
  });
});
