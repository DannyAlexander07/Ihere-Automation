import { AppShell } from "@/components/shell/app-shell";
import { AuthGate } from "@/features/auth/auth-gate";

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
