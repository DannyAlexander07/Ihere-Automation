import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotificationMenu } from "./notification-menu";

const { apiFetch } = vi.hoisted(() => ({
  apiFetch: vi.fn().mockResolvedValue({
    activity: [
      {
        id: "activity-1",
        action: "title.decision.approve",
        actorName: "Alexander Arellano",
        clientName: "Adecco Perú",
        createdAt: "2026-08-18T18:00:00.000Z",
      },
    ],
  }),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ apiFetch }),
}));

describe("NotificationMenu", () => {
  it("carga la actividad visible al abrir la campana", async () => {
    render(<NotificationMenu />);

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Abrir notificaciones" }),
      { button: 0, ctrlKey: false },
    );

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("dashboard/summary"),
    );
    expect(
      await screen.findByText(/Alexander Arellano registró una aprobación/i),
    ).toBeVisible();
    expect(screen.getByText(/Adecco Perú/i)).toBeVisible();
  });
});
