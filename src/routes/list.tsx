import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { EventDrawer } from "@/components/EventDrawer";
import { listEvents } from "@/lib/events-api";
import { STATUS_COLORS, TYPE_COLORS, statusLabel, typeLabel, type EventRow } from "@/lib/domain";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/list")({
  head: () => ({
    meta: [
      { title: "List · Placement Tracker" },
      { name: "description", content: "Full list of every tracked placement event." },
      { property: "og:title", content: "List · Placement Tracker" },
      { property: "og:description", content: "Full sortable list of every tracked placement event." },
    ],
  }),
  component: ListView,
});

function ListView() {
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: listEvents });
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EventRow | null>(null);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return events
      .filter((e) => !query || e.company.toLowerCase().includes(query) || (e.role ?? "").toLowerCase().includes(query))
      .slice()
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [events, q]);

  return (
    <AppShell onNew={() => { setEditing(null); setOpen(true); }}>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <header className="mb-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">All events</h1>
            <p className="text-sm text-muted-foreground">{rows.length} total</p>
          </div>
          <Input
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full sm:w-64"
          />
        </header>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Company</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Round / Role</th>
                  <th className="text-left px-3 py-2">Start</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => { setEditing(e); setOpen(true); }}
                    className="border-t hover:bg-muted/40 cursor-pointer"
                  >
                    <td className="px-3 py-2 font-medium">{e.company}</td>
                    <td className="px-3 py-2">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", TYPE_COLORS[e.type])}>
                        {typeLabel(e.type)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {[e.round, e.role].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{format(new Date(e.start_at), "MMM d, h:mm a")}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={cn("h-2 w-2 rounded-full", STATUS_COLORS[e.status])} />
                        {statusLabel(e.status)}
                      </span>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-muted-foreground">No events yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <EventDrawer open={open} onOpenChange={setOpen} event={editing} />
    </AppShell>
  );
}
