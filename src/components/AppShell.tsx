import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  KanbanSquare,
  Calendar,
  List,
  Settings,
  Stamp,
  Plus,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import type { ReactNode } from "react";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/board", label: "Pipeline", icon: KanbanSquare },
  { to: "/calendar", label: "Schedule", icon: Calendar },
  { to: "/list", label: "Docket", icon: List },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children, onNew }: { children: ReactNode; onNew?: () => void }) {
  const { location } = useRouterState();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function onSignOut() {
    try {
      await signOut();
      await navigate({ to: "/login" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sign out.");
    }
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar border-r border-sidebar-border">
        <div className="flex items-center gap-3 px-5 py-6 border-b border-sidebar-border/70">
          <div className="h-10 w-10 rounded-sm border border-brass/50 text-brass grid place-items-center">
            <Stamp className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <div>
            <div className="font-serif text-lg leading-tight text-sidebar-foreground">
              Placement
            </div>
            <div className="text-[10px] font-mono tracking-[0.25em] text-brass/80 leading-tight">
              DOSSIER
            </div>
          </div>
        </div>

        {onNew && (
          <div className="px-4 pt-4">
            <button
              onClick={onNew}
              className="w-full flex items-center justify-center gap-2 rounded-sm border border-brass/50 text-brass px-3 py-2 text-xs font-mono tracking-wider uppercase hover:bg-brass hover:text-primary-foreground transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> New entry
            </button>
          </div>
        )}

        <nav className="flex flex-col mt-5 px-2">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "group flex items-center gap-3 border-l-2 px-4 py-2.5 text-sm transition-colors",
                  active
                    ? "border-brass bg-sidebar-accent text-sidebar-accent-foreground"
                    : "border-transparent text-sidebar-foreground/60 hover:border-brass/40 hover:text-sidebar-foreground",
                )}
              >
                <Icon
                  className={cn("h-4 w-4 shrink-0", active && "text-brass")}
                  strokeWidth={1.75}
                />
                <span className="font-mono text-[11px] tracking-[0.15em] uppercase">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto px-5 py-4 border-t border-sidebar-border/70">
          <p className="text-[10px] font-mono text-muted-foreground tracking-wide">
            Season in progress
          </p>
          {user && (
            <div className="mt-3">
              <p
                className="truncate text-[11px] text-sidebar-foreground/70"
                title={user.email ?? ""}
              >
                {user.email}
              </p>
              <button
                onClick={onSignOut}
                className="mt-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-brass transition-colors cursor-pointer"
              >
                <LogOut className="h-3 w-3" strokeWidth={1.75} /> Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between bg-sidebar border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-sm border border-brass/50 text-brass grid place-items-center">
            <Stamp className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <span className="font-serif text-base">Placement</span>
        </div>
        <div className="flex items-center gap-2">
          {onNew && (
            <button
              onClick={onNew}
              className="flex items-center gap-1 rounded-sm border border-brass/50 text-brass px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> New
            </button>
          )}
          {user && (
            <button
              onClick={onSignOut}
              aria-label="Sign out"
              className="grid h-8 w-8 place-items-center rounded-sm border border-sidebar-border text-muted-foreground hover:text-brass transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      <main className="flex-1 min-w-0 pt-14 md:pt-0">
        {children}
        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-sidebar border-t border-sidebar-border grid grid-cols-5">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[9px] font-mono uppercase tracking-wide",
                  active ? "text-brass" : "text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
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
