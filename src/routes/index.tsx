import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { isAfter, isBefore, addDays, startOfDay, formatDistanceToNowStrict } from "date-fns";
import { formatHeaderDate, formatLongDateTime } from "@/lib/datetime";
import { AppShell } from "@/components/AppShell";
import { EventDrawer } from "@/components/EventDrawer";
import { EventCard } from "@/components/EventCard";
import { listEvents } from "@/lib/events-api";
import {
  EVENT_STATUSES,
  statusLabel,
  typeLabel,
  type EventRow,
  type EventStatus,
} from "@/lib/domain";
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview · Placement Tracker" },
      { name: "description", content: "Snapshot of upcoming placement events and pipeline stats." },
      { property: "og:title", content: "Overview · Placement Tracker" },
      {
        property: "og:description",
        content: "Snapshot of upcoming placement events and pipeline stats.",
      },
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
    .slice(0, 6);

  const nextEvent = events
    .filter((e) => isAfter(new Date(e.start_at), now))
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())[0];

  const counts: Record<EventStatus, number> = EVENT_STATUSES.reduce(
    (acc, s) => {
      acc[s.value] = 0;
      return acc;
    },
    {} as Record<EventStatus, number>,
  );
  events.forEach((e) => {
    counts[e.status] = (counts[e.status] ?? 0) + 1;
  });

  const funnelData = [
    { name: "Applied", value: events.length },
    {
      name: "PPT Done",
      value: events.filter((e) =>
        [
          "PPT_DONE",
          "OT_SCHEDULED",
          "OT_CLEARED",
          "INTERVIEW_R1",
          "INTERVIEW_R2",
          "HR",
          "OFFER",
        ].includes(e.status),
      ).length,
    },
    {
      name: "OT Cleared",
      value: events.filter((e) =>
        ["OT_CLEARED", "INTERVIEW_R1", "INTERVIEW_R2", "HR", "OFFER"].includes(e.status),
      ).length,
    },
    {
      name: "Interview",
      value: events.filter((e) =>
        ["INTERVIEW_R1", "INTERVIEW_R2", "HR", "OFFER"].includes(e.status),
      ).length,
    },
    { name: "Offer", value: events.filter((e) => e.status === "OFFER").length },
  ];

  const totalUpcoming = events.filter((e) => isAfter(new Date(e.start_at), now)).length;
  const thisWeek = events.filter(
    (e) => isAfter(new Date(e.start_at), startOfDay(now)) && isBefore(new Date(e.start_at), in7),
  ).length;
  const offers = counts.OFFER;

  return (
    <AppShell
      onNew={() => {
        setEditing(null);
        setOpen(true);
      }}
    >
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        <header className="mb-6 flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-brass mb-1">
              {formatHeaderDate(now)}
            </p>
            <h1 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight">
              Season Overview
            </h1>
          </div>
        </header>

        {/* Departures-board hero: the one thing that actually matters right now */}
        <section className="mb-6 rounded-sm border border-brass/30 bg-sidebar overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-brass/20">
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-brass">
              Next up
            </span>
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              {totalUpcoming} scheduled
            </span>
          </div>
          {nextEvent ? (
            <button
              onClick={() => {
                setEditing(nextEvent);
                setOpen(true);
              }}
              className="w-full text-left px-4 py-5 flex flex-wrap items-center gap-x-6 gap-y-2 hover:bg-white/[0.03] transition-colors cursor-pointer"
            >
              <div className="min-w-0">
                <div className="font-mono text-[10px] tracking-widest uppercase text-brass/80 mb-1">
                  {typeLabel(nextEvent.type)}
                  {nextEvent.round && nextEvent.type === "INTERVIEW" ? ` · ${nextEvent.round}` : ""}
                </div>
                <div className="font-serif text-2xl md:text-3xl font-semibold truncate">
                  {nextEvent.company}
                </div>
                {nextEvent.role && (
                  <div className="text-sm text-muted-foreground mt-0.5">{nextEvent.role}</div>
                )}
              </div>
              <div className="ml-auto text-right">
                <div className="font-mono text-2xl md:text-3xl font-semibold text-brass tabular-nums">
                  {formatDistanceToNowStrict(new Date(nextEvent.start_at))}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {formatLongDateTime(nextEvent.start_at)}
                </div>
              </div>
            </button>
          ) : (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              Nothing on the schedule. Click "New entry" to log one.
            </div>
          )}
        </section>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total logged" value={events.length} />
          <StatCard label="Upcoming" value={totalUpcoming} tone="brass" />
          <StatCard label="This week" value={thisWeek} />
          <StatCard label="Offers" value={offers} tone="ledger" />
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2 p-5 bg-card border-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-lg font-semibold">Pipeline</h2>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                By status
              </span>
            </div>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart
                  data={EVENT_STATUSES.map((s) => ({ name: s.label, value: counts[s.value] }))}
                >
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  />
                  {/* Without a `name`, Recharts labels the tooltip with the raw
                      dataKey — it read "value : 1". */}
                  <Bar dataKey="value" name="Entries" radius={[2, 2, 0, 0]}>
                    {EVENT_STATUSES.map((_, i) => (
                      <Cell key={i} fill="var(--brass)" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5 bg-card border-border">
            <h2 className="font-serif text-lg font-semibold mb-4">Funnel</h2>
            <div className="space-y-3">
              {funnelData.map((row) => {
                const pct = events.length ? (row.value / events.length) * 100 : 0;
                return (
                  <div key={row.name}>
                    <div className="flex justify-between text-xs mb-1 font-mono">
                      <span className="text-muted-foreground uppercase tracking-wide text-[10px]">
                        {row.name}
                      </span>
                      <span className="font-medium">{row.value}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-brass" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </section>

        <section className="mt-6">
          <h2 className="font-serif text-lg font-semibold mb-3">This week's docket</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : upcoming.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground bg-card border-border">
              Nothing filed for the next 7 days. Click "New entry" to log one.
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((e) => (
                <EventCard
                  key={e.id}
                  event={e}
                  onClick={() => {
                    setEditing(e);
                    setOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      <EventDrawer open={open} onOpenChange={setOpen} event={editing} />
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "brass" | "ledger";
}) {
  const toneCls =
    tone === "brass" ? "text-brass" : tone === "ledger" ? "text-ledger-bright" : "text-foreground";
  return (
    <Card className="p-4 bg-card border-border border-l-2 border-l-brass/40">
      <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
        {label}
      </div>
      <div className={`mt-1 font-serif text-3xl font-semibold ${toneCls}`}>{value}</div>
    </Card>
  );
}
