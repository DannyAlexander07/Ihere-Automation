"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  canAccessNavigationItem,
  primaryNavigation,
  visibleNavigationGroups,
} from "@/config/navigation";
import { useAuth } from "@/features/auth/auth-provider";

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { user } = useAuth();
  const access = {
    permissions: user?.permissions ?? [],
    tenantPermissions: user?.tenantPermissions ?? [],
  };
  const visiblePrimary = primaryNavigation.filter((item) =>
    canAccessNavigationItem(item, access),
  );
  const visibleGroups = visibleNavigationGroups(access);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const goTo = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <Button
        variant="outline"
        className="h-9 w-9 justify-center rounded-xl bg-card px-0 text-muted-foreground sm:w-56 sm:justify-start sm:px-3"
        onClick={() => setOpen(true)}
        aria-label="Buscar en I HERE"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Buscar en I HERE</span>
        <kbd className="ml-auto hidden rounded-md border bg-muted px-1.5 py-0.5 text-[10px] font-medium md:inline">
          Ctrl K
        </kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Buscar"
        description="Navega por los módulos de I HERE"
        className="sm:max-w-xl"
      >
        <Command className="p-0">
          <CommandInput placeholder="Escribe un módulo o submódulo…" />
          <CommandList className="max-h-[min(65vh,30rem)] px-2 pb-3">
            <CommandEmpty>No encontramos esa opción.</CommandEmpty>
            <CommandGroup heading="General" className="pt-1">
              {visiblePrimary.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.href}
                    value={item.label}
                    onSelect={() => goTo(item.href)}
                    className="min-h-10 px-3"
                  >
                    <Icon />
                    {item.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {visibleGroups.map((group) => (
              <div key={group.label}>
                <CommandSeparator className="mx-2" />
                <CommandGroup heading={group.label} className="py-2">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <CommandItem
                        key={item.href}
                        value={`${group.label} ${item.label}`}
                        onSelect={() => goTo(item.href)}
                        className="min-h-10 px-3"
                      >
                        <Icon />
                        <span className="min-w-0 flex-1">{item.label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </div>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
