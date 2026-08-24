"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  primaryNavigation,
  visibleNavigationGroups,
  type NavigationItem,
} from "@/config/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { cn } from "@/lib/utils";

function SidebarLink({
  item,
  compact,
  nested = false,
  onNavigate,
}: {
  item: NavigationItem;
  compact: boolean;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === item.href;
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex min-w-0 items-center rounded-lg font-medium transition-colors",
        compact
          ? "min-h-9 justify-center px-2 text-[13px]"
          : nested
            ? "min-h-8 gap-2 px-2.5 text-[12px]"
            : "min-h-9 gap-2.5 px-2.5 text-[13px]",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon
        className={cn("shrink-0", nested ? "size-3.5" : "size-4")}
        strokeWidth={1.8}
        aria-hidden="true"
      />
      {!compact && (
        <span className="min-w-0 flex-1 break-words leading-4">
          {item.label}
        </span>
      )}
      {!compact && item.badge && (
        <Badge
          variant={active ? "secondary" : "outline"}
          className="h-5 min-w-6 justify-center px-1.5 text-[10px]"
        >
          {item.badge}
        </Badge>
      )}
    </Link>
  );

  if (!compact) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function AppSidebar({
  compact,
  onCompactChange,
  mobile = false,
  onNavigate,
}: {
  compact: boolean;
  onCompactChange?: (compact: boolean) => void;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [openedGroups, setOpenedGroups] = useState<Record<string, boolean>>({});
  const visibleGroups = visibleNavigationGroups({
    permissions: user?.permissions ?? [],
    tenantPermissions: user?.tenantPermissions ?? [],
  });

  return (
    <aside className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          "flex h-[58px] items-center border-b border-sidebar-border",
          compact ? "justify-center px-2" : "justify-between px-3",
        )}
      >
        <BrandMark compact={compact} />
        {!mobile && !compact && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onCompactChange?.(true)}
            aria-label="Contraer menú"
          >
            <PanelLeftClose />
          </Button>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav
          className={cn("space-y-3.5 py-3", compact ? "px-2" : "px-2.5")}
          aria-label="Navegación principal"
        >
          <div className="space-y-1">
            {primaryNavigation.map((item) => (
              <SidebarLink
                key={item.href}
                item={item}
                compact={compact}
                onNavigate={onNavigate}
              />
            ))}
          </div>

          {visibleGroups.map((group) => {
            const GroupIcon = group.icon;
            const groupIsActive = group.items.some(
              (item) => item.href === pathname,
            );
            const expanded =
              compact || (openedGroups[group.label] ?? groupIsActive);
            const groupId = `sidebar-group-${group.label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
            return (
              <div key={group.label} className="space-y-1">
                {compact ? (
                  <div className="my-2 flex justify-center" aria-hidden="true">
                    <span className="h-px w-7 bg-sidebar-border" />
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={groupId}
                    onClick={() =>
                      setOpenedGroups((current) => ({
                        ...current,
                        [group.label]: !expanded,
                      }))
                    }
                    className={cn(
                      "flex min-h-9 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-[11px] font-semibold transition-colors",
                      groupIsActive
                        ? "text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-sidebar-accent/80">
                      <GroupIcon
                        className="size-3.5"
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="min-w-0 flex-1 break-words leading-4">
                      {group.label}
                    </span>
                    <ChevronRight
                      className={cn(
                        "size-3.5 shrink-0 transition-transform duration-200",
                        expanded && "rotate-90",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                )}
                {expanded ? (
                  <div
                    id={groupId}
                    className={cn(
                      "space-y-1",
                      !compact && "ml-3 border-l border-sidebar-border pl-2",
                    )}
                  >
                    {group.items.map((item) => (
                      <SidebarLink
                        key={item.href}
                        item={item}
                        compact={compact}
                        nested={!compact}
                        onNavigate={onNavigate}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </ScrollArea>

      <div
        className={cn(
          "border-t border-sidebar-border p-2.5",
          compact && "flex justify-center",
        )}
      >
        {compact && !mobile ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onCompactChange?.(false)}
                aria-label="Expandir menú"
              >
                <PanelLeftOpen />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Expandir menú</TooltipContent>
          </Tooltip>
        ) : (
          <div className="rounded-lg bg-sidebar-accent px-2.5 py-2">
            <p className="text-xs font-semibold text-sidebar-accent-foreground">
              Entorno interno
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Acceso controlado
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
