import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format, isAfter, isBefore, addDays, startOfDay } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { EventDrawer } from "@/components/EventDrawer";
import { EventCard } from "@/components/EventCard";
import { listEvents } from "@/lib/events-api";
import { EVENT_STATUSES, statusLabel, type EventRow, type EventStatus } from "@/lib/domain";
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Placement Tracker" },
      { name: "description", content: "Snapshot of upcoming placement events and pipeline stats." },
      { property: "og:title", content: "Dashboard · Placement Tracker" },
      { property: "og:description", content: "Snapshot of upcoming placement events and pipeline stats." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EventRow | null>(null);
  const { data: events = [], isLoading } = useQuery({ queryKey: ["events"], queryFn: listEvents });

  const now = new Date();
  const in7 = addDays(now, 7);
  const upcoming = events
    .filter((e) => isAfter(new Date(e.start_at), now) && isBefore(new Date(e.start_at), in7))
    .slice(0, 8);

  const counts: Record<EventStatus, number> = EVENT_STATUSES.reduce((acc, s) => {
    acc[s.value] = 0;
    return acc;
  }, {} as Record<EventStatus, number>);
  events.forEach((e) => {
    counts[e.status] = (counts[e.status] ?? 0) + 1;
  });

  const funnelData = [
    { name: "Applied", value: events.length },
    { name: "PPT Done", value: events.filter((e) => ["PPT_DONE", "OT_SCHEDULED", "OT_CLEARED", "INTERVIEW_R1", "INTERVIEW_R2", "HR", "OFFER"].includes(e.status)).length },
    { name: "OT Cleared", value: events.filter((e) => ["OT_CLEARED", "INTERVIEW_R1", "INTERVIEW_R2", "HR", "OFFER"].includes(e.status)).length },
    { name: "Interview", value: events.filter((e) => ["INTERVIEW_R1", "INTERVIEW_R2", "HR", "OFFER"].includes(e.status)).length },
    { name: "Offer", value: events.filter((e) => e.status === "OFFER").length },
  ];

  const totalUpcoming = events.filter((e) => isAfter(new Date(e.start_at), now)).length;
  const thisWeek = events.filter(
    (e) => isAfter(new Date(e.start_at), startOfDay(now)) && isBefore(new Date(e.start_at), in7)
  ).length;
  const offers = counts.OFFER;

  return (
    <AppShell onNew={() => { setEditing(null); setOpen(true); }}>
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {format(now, "EEEE, MMM d")} · {totalUpcoming} upcoming, {thisWeek} this week
          </p>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total events" value={events.length} />
          <StatCard label="Upcoming" value={totalUpcoming} tone="primary" />
          <StatCard label="This week" value={thisWeek} tone="amber" />
          <StatCard label="Offers" value={offers} tone="emerald" />
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Pipeline</h2>
              <span className="text-xs text-muted-foreground">By status</span>
            </div>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={EVENT_STATUSES.map((s) => ({ name: s.label, value: counts[s.value] }))}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {EVENT_STATUSES.map((_, i) => (
                      <Cell key={i} fill="hsl(217 91% 60%)" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold mb-4">Funnel</h2>
            <div className="space-y-3">
              {funnelData.map((row) => {
                const pct = events.length ? (row.value / events.length) * 100 : 0;
                return (
                  <div key={row.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{row.name}</span>
                      <span className="font-medium">{row.value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </section>

        <section className="mt-6">
          <h2 className="font-semibold mb-3">Next 7 days</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : upcoming.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No events in the next 7 days. Click "New event" to add one.
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((e) => (
                <EventCard key={e.id} event={e} onClick={() => { setEditing(e); setOpen(true); }} />
              ))}
            </div>
          )}
        </section>
      </div>
      <EventDrawer open={open} onOpenChange={setOpen} event={editing} />
    </AppShell>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "primary" | "amber" | "emerald" }) {
  const toneCls =
    tone === "primary" ? "text-primary" :
    tone === "amber" ? "text-amber-600 dark:text-amber-400" :
    tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
    "text-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${toneCls}`}>{value}</div>
    </Card>
  );
}
