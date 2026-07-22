import { format } from "date-fns";
import { Clock, MapPin, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TYPE_COLORS, typeLabel, type EventRow } from "@/lib/domain";

export function EventCard({
  event,
  onClick,
  compact,
  dragHandle,
}: {
  event: EventRow;
  onClick?: () => void;
  compact?: boolean;
  dragHandle?: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "group rounded-lg border bg-card p-3 shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer",
        compact && "p-2"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={cn(
                "text-[10px] font-medium px-1.5 py-0.5 rounded border",
                TYPE_COLORS[event.type]
              )}
            >
              {typeLabel(event.type)}
            </span>
            {event.priority === "HIGH" && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300">
                HIGH
              </span>
            )}
          </div>
          <div className="font-semibold text-sm truncate">{event.company}</div>
          {event.role && <div className="text-xs text-muted-foreground truncate">{event.role}</div>}
          {event.round && event.type === "INTERVIEW" && (
            <div className="text-xs text-muted-foreground truncate">{event.round}</div>
          )}
        </div>
        {dragHandle}
      </div>
      {!compact && (
        <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            {format(new Date(event.start_at), "MMM d, h:mm a")}
          </div>
          {event.location && (
            <div className="flex items-center gap-1.5 truncate">
              <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{event.location}</span>
            </div>
          )}
          {event.link && (
            <div className="flex items-center gap-1.5 truncate">
              <LinkIcon className="h-3 w-3 shrink-0" /> <span className="truncate">{event.link}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
