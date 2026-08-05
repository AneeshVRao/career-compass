import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EVENT_MODES,
  EVENT_PRIORITIES,
  EVENT_STATUSES,
  EVENT_TYPES,
  type EventRow,
  type EventInsert,
  type EventType,
  type EventMode,
  type EventStatus,
  type EventPriority,
  type Contact,
} from "@/lib/domain";
import { createEvent, deleteEvent, updateEvent } from "@/lib/events-api";
import { fromZonedInputValue, toZonedInputValue } from "@/lib/datetime";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event?: EventRow | null;
  defaultStatus?: EventStatus;
};

// Both sides of the form round-trip through the display zone, so the value the
// drawer shows matches the value every card shows. The previous pair read the
// *browser's* offset, which meant editing an event from another zone silently
// rewrote its start time.
function toLocalInput(iso: string | null | undefined) {
  return iso ? toZonedInputValue(iso) : "";
}
function fromLocalInput(v: string) {
  return v ? fromZonedInputValue(v) : null;
}

export function EventDrawer({ open, onOpenChange, event, defaultStatus }: Props) {
  const qc = useQueryClient();
  const editing = !!event;

  const [company, setCompany] = useState("");
  const [type, setType] = useState<EventType>("INTERVIEW");
  const [round, setRound] = useState("");
  const [role, setRole] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [mode, setMode] = useState<EventMode>("ONLINE");
  const [location, setLocation] = useState("");
  const [link, setLink] = useState("");
  const [status, setStatus] = useState<EventStatus>("UPCOMING");
  const [priority, setPriority] = useState<EventPriority>("MEDIUM");
  const [ctc, setCtc] = useState("");
  const [resumeVersion, setResumeVersion] = useState("");
  const [prepNotes, setPrepNotes] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    if (!open) return;
    if (event) {
      setCompany(event.company);
      setType(event.type);
      setRound(event.round ?? "");
      setRole(event.role ?? "");
      setStartAt(toLocalInput(event.start_at));
      setEndAt(toLocalInput(event.end_at));
      setMode(event.mode);
      setLocation(event.location ?? "");
      setLink(event.link ?? "");
      setStatus(event.status);
      setPriority(event.priority);
      setCtc(event.ctc ?? "");
      setResumeVersion(event.resume_version ?? "");
      setPrepNotes(event.prep_notes ?? "");
      setOutcomeNotes(event.outcome_notes ?? "");
      setContacts(Array.isArray(event.contacts) ? (event.contacts as unknown as Contact[]) : []);
    } else {
      setCompany("");
      setType("INTERVIEW");
      setRound("");
      setRole("");
      const t = new Date();
      t.setMinutes(0, 0, 0);
      t.setHours(t.getHours() + 25);
      setStartAt(toLocalInput(t.toISOString()));
      setEndAt("");
      setMode("ONLINE");
      setLocation("");
      setLink("");
      setStatus(defaultStatus ?? "UPCOMING");
      setPriority("MEDIUM");
      setCtc("");
      setResumeVersion("");
      setPrepNotes("");
      setOutcomeNotes("");
      setContacts([]);
    }
  }, [open, event, defaultStatus]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!company.trim()) throw new Error("Company is required");
      if (!startAt) throw new Error("Start date/time is required");
      const payload: EventInsert = {
        company: company.trim(),
        type,
        round: round.trim() || null,
        role: role.trim() || null,
        start_at: fromLocalInput(startAt)!,
        end_at: fromLocalInput(endAt),
        mode,
        location: location.trim() || null,
        link: link.trim() || null,
        status,
        priority,
        ctc: ctc.trim() || null,
        resume_version: resumeVersion.trim() || null,
        prep_notes: prepNotes.trim() || null,
        outcome_notes: outcomeNotes.trim() || null,
        contacts: contacts as unknown as EventInsert["contacts"],
      };
      if (editing && event) return updateEvent(event.id, payload);
      return createEvent(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      toast.success(editing ? "Event updated" : "Event created");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async () => {
      if (!event) return;
      await deleteEvent(event.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      toast.success("Event deleted");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-brass mb-0.5">
            {editing ? "Existing entry" : "New entry"}
          </p>
          <SheetTitle className="font-serif text-xl">
            {editing ? event?.company || "Edit entry" : "Log a new event"}
          </SheetTitle>
        </SheetHeader>

        <div className="grid gap-4 py-4 px-1">
          <div className="grid gap-2">
            <Label>Company *</Label>
            <Input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Google"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Type *</Label>
              <Select value={type} onValueChange={(v) => setType(v as EventType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as EventStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {type === "INTERVIEW" && (
            <div className="grid gap-2">
              <Label>Round</Label>
              <Input
                value={round}
                onChange={(e) => setRound(e.target.value)}
                placeholder="e.g. Tech R1, HR"
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label>Role / Profile</Label>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. SDE Intern"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Start *</Label>
              <Input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>End</Label>
              <Input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as EventMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as EventPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Location / Venue</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. DC-2, Room 305"
            />
          </div>

          <div className="grid gap-2">
            <Label>Link (meet / test URL)</Label>
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>CTC / Stipend</Label>
              <Input
                value={ctc}
                onChange={(e) => setCtc(e.target.value)}
                placeholder="e.g. 18 LPA"
              />
            </div>
            <div className="grid gap-2">
              <Label>Resume version</Label>
              <Input
                value={resumeVersion}
                onChange={(e) => setResumeVersion(e.target.value)}
                placeholder="e.g. v3-sde"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Contacts (POC)</Label>
            <div className="grid gap-2">
              {contacts.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input
                    placeholder="Name"
                    value={c.name}
                    onChange={(e) =>
                      setContacts((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                      )
                    }
                  />
                  <Input
                    placeholder="Email or phone"
                    value={c.email ?? c.phone ?? ""}
                    onChange={(e) =>
                      setContacts((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setContacts((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setContacts((prev) => [...prev, { name: "", email: "" }])}
              >
                + Add contact
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Prep notes</Label>
            <Textarea rows={4} value={prepNotes} onChange={(e) => setPrepNotes(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Outcome notes</Label>
            <Textarea
              rows={3}
              value={outcomeNotes}
              onChange={(e) => setOutcomeNotes(e.target.value)}
            />
          </div>
        </div>

        <SheetFooter className="flex-row justify-between gap-2">
          {editing ? (
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm("Delete this event?")) delMut.mutate();
              }}
              disabled={delMut.isPending}
            >
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? "Saving..." : editing ? "Save" : "Create"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
