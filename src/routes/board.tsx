import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { EventCard } from "@/components/EventCard";
import { EventDrawer } from "@/components/EventDrawer";
import { listEvents, setStatus } from "@/lib/events-api";
import { EVENT_STATUSES, STATUS_COLORS, type EventRow, type EventStatus } from "@/lib/domain";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/board")({
  head: () => ({
    meta: [
      { title: "Board · Placement Tracker" },
      { name: "description", content: "Kanban board of placement events by pipeline stage." },
      { property: "og:title", content: "Board · Placement Tracker" },
      { property: "og:description", content: "Drag and drop events across pipeline stages." },
    ],
  }),
  component: Board,
});

function Board() {
  const qc = useQueryClient();
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: listEvents });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<EventStatus>("UPCOMING");
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return events;
    return events.filter(
      (e) =>
        e.company.toLowerCase().includes(query) ||
        (e.role ?? "").toLowerCase().includes(query) ||
        (e.round ?? "").toLowerCase().includes(query)
    );
  }, [events, q]);

  const grouped = useMemo(() => {
    const g: Record<EventStatus, EventRow[]> = EVENT_STATUSES.reduce((acc, s) => {
      acc[s.value] = [];
      return acc;
    }, {} as Record<EventStatus, EventRow[]>);
    filtered.forEach((e) => g[e.status].push(e));
    return g;
  }, [filtered]);

  const moveMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: EventStatus }) => setStatus(id, status),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["events"] });
      const prev = qc.getQueryData<EventRow[]>(["events"]);
      qc.setQueryData<EventRow[]>(["events"], (old) =>
        (old ?? []).map((e) => (e.id === id ? { ...e, status } : e))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["events"], ctx.prev);
      toast.error("Failed to move");
    },
    onSuccess: () => toast.success("Status updated"),
  });

  const active = activeId ? events.find((e) => e.id === activeId) : null;

  return (
    <AppShell onNew={() => { setEditing(null); setDefaultStatus("UPCOMING"); setDrawerOpen(true); }}>
      <div className="p-4 md:p-6">
        <header className="mb-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Board</h1>
            <p className="text-sm text-muted-foreground">Drag cards between columns to update status</p>
          </div>
          <Input
            placeholder="Search company, role, round…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full sm:w-64"
          />
        </header>

        <DndContext
          sensors={sensors}
          onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
          onDragEnd={(e: DragEndEvent) => {
            setActiveId(null);
            const over = e.over;
            if (!over) return;
            const id = String(e.active.id);
            const status = String(over.id) as EventStatus;
            const ev = events.find((x) => x.id === id);
            if (ev && ev.status !== status) moveMut.mutate({ id, status });
          }}
        >
          <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0">
            {EVENT_STATUSES.map((s) => (
              <Column
                key={s.value}
                status={s.value}
                label={s.label}
                items={grouped[s.value]}
                onNew={() => { setEditing(null); setDefaultStatus(s.value); setDrawerOpen(true); }}
                onCardClick={(ev) => { setEditing(ev); setDrawerOpen(true); }}
              />
            ))}
          </div>

          <DragOverlay>
            {active ? (
              <div className="w-64 rotate-2 opacity-90">
                <EventCard event={active} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
      <EventDrawer open={drawerOpen} onOpenChange={setDrawerOpen} event={editing} defaultStatus={defaultStatus} />
    </AppShell>
  );
}

function Column({
  status,
  label,
  items,
  onNew,
  onCardClick,
}: {
  status: EventStatus;
  label: string;
  items: EventRow[];
  onNew: () => void;
  onCardClick: (e: EventRow) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`w-72 shrink-0 rounded-xl border bg-muted/30 flex flex-col ${
        isOver ? "ring-2 ring-primary/60 bg-muted/60" : ""
      }`}
    >
      <div className="p-3 flex items-center justify-between border-b">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[status]}`} />
          <span className="font-medium text-sm">{label}</span>
          <span className="text-xs text-muted-foreground">{items.length}</span>
        </div>
        <button
          onClick={onNew}
          className="text-xs text-muted-foreground hover:text-primary"
          aria-label="Add event to column"
        >
          + Add
        </button>
      </div>
      <div className="flex-1 min-h-16 p-2 flex flex-col gap-2 max-h-[calc(100vh-14rem)] overflow-y-auto">
        {items.map((e) => (
          <DraggableCard key={e.id} event={e} onClick={() => onCardClick(e)} />
        ))}
        {items.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8">Drop here</div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ event, onClick }: { event: EventRow; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: event.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={isDragging ? "opacity-40" : ""}
    >
      <EventCard event={event} onClick={onClick} />
    </div>
  );
}
