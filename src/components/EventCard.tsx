import { Clock, MapPin, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCardDateTime } from "@/lib/datetime";
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
        "group flex items-stretch rounded-sm border border-graphite/15 bg-parchment text-graphite shadow-sm",
        "hover:shadow-md hover:border-brass/50 transition-all cursor-pointer overflow-hidden",
      )}
    >
      <div className={cn("min-w-0 flex-1", compact ? "p-2" : "p-3")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
              <span
                className={cn(
                  "text-[9px] font-mono uppercase tracking-wider font-medium px-1.5 py-0.5 rounded-sm border",
                  TYPE_COLORS[event.type],
                )}
              >
                {typeLabel(event.type)}
              </span>
              {event.priority === "HIGH" && (
                <span className="text-[8px] font-mono uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full border border-stamp text-stamp -rotate-3">
                  Priority
                </span>
              )}
            </div>
            <div className="font-serif font-semibold text-[15px] leading-tight truncate">
              {event.company}
            </div>
            {event.role && (
              <div className="text-xs text-graphite/60 truncate mt-0.5">{event.role}</div>
            )}
            {event.round && event.type === "INTERVIEW" && (
              <div className="text-xs text-graphite/60 truncate">{event.round}</div>
            )}
          </div>
          {dragHandle}
        </div>
        {!compact && (
          <div className="mt-2.5 pt-2 border-t border-dashed border-graphite/20 flex flex-col gap-1 text-[11px] font-mono text-graphite/65">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0" />
              {formatCardDateTime(event.start_at)}
            </div>
            {event.location && (
              <div className="flex items-center gap-1.5 truncate">
                <MapPin className="h-3 w-3 shrink-0" />{" "}
                <span className="truncate">{event.location}</span>
              </div>
            )}
            {event.link && (
              <div className="flex items-center gap-1.5 truncate">
                <LinkIcon className="h-3 w-3 shrink-0" />{" "}
                <span className="truncate">{event.link}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="relative w-8 shrink-0 border-l border-dashed border-graphite/25 bg-graphite/[0.03] flex items-center justify-center">
        <span className="rotate-180 [writing-mode:vertical-rl] font-mono text-[9px] tracking-[0.2em] uppercase text-graphite/50 font-medium">
          {typeLabel(event.type)}
        </span>
      </div>
    </div>
  );
}
