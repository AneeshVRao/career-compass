import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  format,
  isSameMonth,
  isSameDay,
  addMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
// `format` above stays for the grid itself: `cursor` and `day` are local-field
// Dates seeded from `todayInZone`, so that math is already zone-pinned. Only the
// event instants need converting.
import { formatTime, formatTime24, todayInZone, zonedDayKey } from "@/lib/datetime";
import { AppShell } from "@/components/AppShell";
import { EventDrawer } from "@/components/EventDrawer";
import { listEvents } from "@/lib/events-api";
import { TYPE_COLORS, typeLabel, type EventRow } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar · Placement Tracker" },
      { name: "description", content: "Monthly calendar of PPTs, tests, and interviews." },
      { property: "og:title", content: "Calendar · Placement Tracker" },
      { property: "og:description", content: "See all placement events on a monthly calendar." },
    ],
  }),
  component: CalendarView,
});

function CalendarView() {
  // The grid is built from local date fields, so seed the cursor with the display
  // zone's calendar day rather than the rendering machine's.
  const [cursor, setCursor] = useState(todayInZone);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EventRow | null>(null);
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: listEvents });

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end = endOfWeek(endOfMonth(cursor));
    const arr: Date[] = [];
    let d = start;
    while (d <= end) {
      arr.push(d);
      d = addDays(d, 1);
    }
    return arr;
  }, [cursor]);

  const byDay = useMemo(() => {
    const m = new Map<string, EventRow[]>();
    for (const e of events) {
      // Zone-pinned: `format` here would read the host's local fields, so a late
      // evening event landed in a different cell on the server than the client.
      const k = zonedDayKey(e.start_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return m;
  }, [events]);

  return (
    <AppShell
      onNew={() => {
        setEditing(null);
        setOpen(true);
      }}
    >
      <div className="p-4 md:p-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-brass mb-1">
              Schedule
            </p>
            <h1 className="font-serif text-2xl font-semibold">{format(cursor, "MMMM yyyy")}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(todayInZone())}>
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <Card className="overflow-hidden bg-card border-border">
          <div className="grid grid-cols-7 border-b border-border bg-muted/50 text-[10px] font-mono uppercase tracking-wider">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="px-2 py-2 text-muted-foreground">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 auto-rows-[minmax(6rem,auto)]">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = byDay.get(key) ?? [];
              const inMonth = isSameMonth(day, cursor);
              const today = isSameDay(day, todayInZone());
              return (
                <div
                  key={key}
                  className={cn(
                    "border-b border-r p-1.5 min-h-24 flex flex-col gap-1",
                    !inMonth && "bg-muted/30 text-muted-foreground",
                  )}
                >
                  <div
                    className={cn(
                      "text-xs font-medium h-5 w-5 rounded-full grid place-items-center",
                      today && "bg-primary text-primary-foreground",
                    )}
                  >
                    {format(day, "d")}
                  </div>
                  <div className="flex flex-col gap-1 overflow-hidden">
                    {dayEvents.slice(0, 3).map((e) => (
                      <button
                        key={e.id}
                        onClick={() => {
                          setEditing(e);
                          setOpen(true);
                        }}
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded border truncate text-left",
                          TYPE_COLORS[e.type],
                        )}
                        title={`${e.company} · ${typeLabel(e.type)} · ${formatTime(e.start_at)}`}
                      >
                        {formatTime24(e.start_at)} {e.company}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{dayEvents.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      <EventDrawer open={open} onOpenChange={setOpen} event={editing} />
    </AppShell>
  );
}
