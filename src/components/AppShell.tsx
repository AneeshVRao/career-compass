import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, KanbanSquare, Calendar, List, Settings, Briefcase, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/board", label: "Board", icon: KanbanSquare },
  { to: "/calendar", label: "Calendar", icon: Calendar },
  { to: "/list", label: "List", icon: List },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children, onNew }: { children: ReactNode; onNew?: () => void }) {
  const { location } = useRouterState();
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-sidebar p-4 gap-1">
        <div className="flex items-center gap-2 px-2 py-3 mb-2">
          <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold leading-tight">Placement</div>
            <div className="text-xs text-muted-foreground leading-tight">Tracker</div>
          </div>
        </div>
        {onNew && (
          <Button onClick={onNew} className="mb-3 w-full justify-start gap-2" size="sm">
            <Plus className="h-4 w-4" /> New event
          </Button>
        )}
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between bg-sidebar border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground grid place-items-center">
            <Briefcase className="h-4 w-4" />
          </div>
          <span className="font-semibold">Placement</span>
        </div>
        {onNew && (
          <Button size="sm" onClick={onNew} className="gap-1">
            <Plus className="h-4 w-4" /> New
          </Button>
        )}
      </div>

      <main className="flex-1 min-w-0 pt-14 md:pt-0">
        {children}
        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-sidebar border-t grid grid-cols-5">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-xs",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="h-16 md:hidden" />
      </main>
    </div>
  );
}
