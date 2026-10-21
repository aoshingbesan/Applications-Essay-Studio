"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookMarked,
  FileStack,
  FolderKanban,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Settings,
  UserRound,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { signOut } from "@/server/account";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/applications", label: "Applications", icon: FolderKanban },
  { href: "/studio", label: "Essay Studio", icon: PenLine },
  { href: "/profile", label: "Personal Profile", icon: UserRound },
  { href: "/stories", label: "Story Bank", icon: BookMarked },
  { href: "/exemplars", label: "Exemplar Library", icon: LibraryBig },
  { href: "/documents", label: "Supporting Documents", icon: FileStack },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

const COLLAPSE_KEY = "es-sidebar-collapsed";

function NavLinks({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        const link = (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            aria-label={collapsed ? label : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-(--duration-fast) outline-none focus-visible:ring-2 focus-visible:ring-ring",
              collapsed && "justify-center px-0",
              active ? "bg-sidebar-accent font-medium text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4 shrink-0", active && "text-ink")} aria-hidden />
            {!collapsed && label}
          </Link>
        );
        return collapsed ? (
          <Tooltip key={href}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        ) : (
          link
        );
      })}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-md px-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Essay Studio home">
      <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-md bg-primary font-heading text-sm font-semibold text-primary-foreground">
        E
      </span>
      {!collapsed && <span className="font-heading text-[1.05rem] leading-tight font-semibold tracking-tight">Essay Studio</span>}
    </Link>
  );
}

export function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  // The writing workspace manages its own full-height layout.
  const fullBleed = /^\/studio\/[^/]+/.test(pathname);
  // The writing workspace needs the width: it always uses the compact icon rail.
  const rail = collapsed || fullBleed;

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a per-device preference after hydration
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Storage unavailable: keep the default.
    }
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // ignore
      }
      return !c;
    });
  };

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-background focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col gap-6 border-r bg-sidebar py-5 transition-[width] duration-(--duration-base) ease-(--ease-standard) lg:flex",
          rail ? "w-16" : "w-60",
        )}
      >
        <Brand collapsed={rail} />
        <div className="px-2">
          <NavLinks collapsed={rail} />
        </div>
        <div className="mt-auto flex flex-col gap-1 px-2">
          {!rail && (
            <div className="truncate px-2.5 pb-1 text-xs text-muted-foreground" title={email}>
              {email}
            </div>
          )}
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm" className={cn("w-full justify-start text-muted-foreground", rail && "justify-center")} aria-label="Sign out">
              <LogOut aria-hidden />
              {!rail && "Sign out"}
            </Button>
          </form>
          {!fullBleed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggle}
              className={cn("w-full justify-start text-muted-foreground", collapsed && "justify-center")}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
              {!collapsed && "Collapse"}
            </Button>
          )}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-4">
              <SheetHeader className="p-0 pb-4">
                <SheetTitle asChild>
                  <div>
                    <Brand />
                  </div>
                </SheetTitle>
              </SheetHeader>
              <NavLinks onNavigate={() => setOpen(false)} />
              <div className="mt-6 border-t pt-4">
                <div className="truncate px-2.5 pb-2 text-xs text-muted-foreground">{email}</div>
                <form action={signOut}>
                  <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
                    <LogOut aria-hidden /> Sign out
                  </Button>
                </form>
              </div>
            </SheetContent>
          </Sheet>
          <Brand />
        </header>
        <main id="main" className={cn("flex-1", fullBleed && "min-h-0")}>
          {children}
        </main>
      </div>
    </div>
  );
}
