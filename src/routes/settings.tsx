import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { getSettings, updateSettings } from "@/lib/events-api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Placement Tracker" },
      { name: "description", content: "Configure reminder email and delivery preferences." },
      { property: "og:title", content: "Settings · Placement Tracker" },
      { property: "og:description", content: "Configure reminder email and delivery preferences." },
    ],
  }),
  component: SettingsView,
});

function SettingsView() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const [email, setEmail] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [from, setFrom] = useState("");

  useEffect(() => {
    if (data) {
      setEmail(data.reminder_email);
      setEnabled(data.reminders_enabled);
      setFrom(data.from_email);
    }
  }, [data]);

  const mut = useMutation({
    mutationFn: () =>
      updateSettings({ reminder_email: email, reminders_enabled: enabled, from_email: from }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell>
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <header className="mb-6">
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-brass mb-1">
            Configuration
          </p>
          <h1 className="font-serif text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage where and when reminder emails go.</p>
        </header>

        <Card className="p-6 space-y-5 bg-card border-border">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">24h email reminders</Label>
              <p className="text-xs text-muted-foreground">Sent the day before each event.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reminder-email">Recipient email</Label>
            <Input
              id="reminder-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="from-email">From address</Label>
            <Input id="from-email" value={from} onChange={(e) => setFrom(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Use <code>onboarding@resend.dev</code> until you verify a domain in Resend. Verified
              domain? Use e.g. <code>Reminders &lt;alerts@yourdomain.com&gt;</code>.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
              {mut.isPending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </Card>

        <Card className="p-6 mt-4 text-sm text-muted-foreground bg-card border-border">
          <p className="font-medium text-foreground mb-2">How reminders work</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>A scheduled job runs every 15 minutes.</li>
            <li>
              Any event starting in ~24 hours gets one reminder email, then is marked as sent.
            </li>
            <li>
              Emails are sent via Resend using your <code>RESEND_API_KEY</code>.
            </li>
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}
