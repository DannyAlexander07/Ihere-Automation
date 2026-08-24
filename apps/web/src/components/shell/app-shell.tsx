"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { AccountMenu } from "@/components/shell/account-menu";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { CommandSearch } from "@/components/shell/command-search";
import { NotificationMenu } from "@/components/shell/notification-menu";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { allNavigationItems } from "@/config/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { cn } from "@/lib/utils";

function CurrentBreadcrumb() {
  const pathname = usePathname();
  const item = allNavigationItems.find((entry) => entry.href === pathname);
  const breadcrumbLabel = pathname.startsWith("/automatizacion/notas/")
    ? "Editor de nota"
    : (item?.label ?? "Módulo");

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/inicio">I HERE</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {pathname !== "/inicio" && <BreadcrumbSeparator />}
        {pathname !== "/inicio" && (
          <BreadcrumbItem>
            <BreadcrumbPage>{breadcrumbLabel}</BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCompact, setDesktopCompact] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    router.replace("/login");
  };

  return (
    <div className="app-canvas min-h-screen">
      <div className="fixed inset-y-0 left-0 z-40 hidden w-[60px] border-r border-sidebar-border md:block xl:hidden">
        <AppSidebar compact />
      </div>
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r border-sidebar-border transition-[width] duration-200 xl:block",
          desktopCompact ? "w-[60px]" : "w-[256px]",
        )}
      >
        <AppSidebar
          compact={desktopCompact}
          onCompactChange={setDesktopCompact}
        />
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[280px] p-0"
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">Navegación principal</SheetTitle>
          <AppSidebar
            compact={false}
            mobile
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div
        className={cn(
          "min-w-0 transition-[padding] duration-200 md:pl-[60px]",
          desktopCompact ? "xl:pl-[60px]" : "xl:pl-[256px]",
        )}
      >
        <header className="sticky top-0 z-30 flex h-[58px] items-center gap-2.5 border-b bg-background/94 px-3 backdrop-blur-lg sm:px-4 xl:px-5">
          <Button
            variant="outline"
            size="icon"
            className="rounded-lg md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu />
          </Button>
          <div className="hidden min-w-0 flex-1 md:block">
            <CurrentBreadcrumb />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <CommandSearch />
            <ThemeSwitcher />
            <NotificationMenu />
            <AccountMenu
              loggingOut={loggingOut}
              onLogout={() => void handleLogout()}
            />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1680px] p-3 sm:p-4 xl:p-5 min-[1920px]:px-6">
          <div className="mb-3 md:hidden">
            <CurrentBreadcrumb />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
