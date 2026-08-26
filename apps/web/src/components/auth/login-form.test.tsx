import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

const { loginMock, replaceMock } = vi.hoisted(() => ({
  loginMock: vi.fn().mockResolvedValue(undefined),
  replaceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ login: loginMock, status: "unauthenticated" }),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    loginMock.mockClear();
    replaceMock.mockClear();
  });

  it("valida correo y contraseña antes de enviarlos", async () => {
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Correo"), {
      target: { value: "correo-invalido" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "1234" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Ingresar de forma segura" }),
    );

    expect(
      await screen.findByText("Ingresa un correo válido"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("La contraseña debe tener al menos 5 caracteres"),
    ).toBeInTheDocument();
  });

  it("mantiene desactivado el autocompletado del formulario", () => {
    const { container } = render(<LoginForm />);

    expect(container.querySelector("form")).toHaveAttribute(
      "autocomplete",
      "off",
    );
    expect(screen.getByLabelText("Correo")).toHaveAttribute(
      "autocomplete",
      "off",
    );
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute(
      "autocomplete",
      "off",
    );
  });

  it("inicia sesión y navega cuando las credenciales son válidas", async () => {
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Correo"), {
      target: { value: "ALEXANDER@EXAMPLE.COM" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "clave-segura-2026" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Ingresar de forma segura" }),
    );

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith(
        "alexander@example.com",
        "clave-segura-2026",
      );
      expect(replaceMock).toHaveBeenCalledWith("/inicio");
    });
  });
});
