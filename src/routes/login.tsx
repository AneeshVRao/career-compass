import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Stamp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EventCard } from "@/components/EventCard";
import type { EventRow } from "@/lib/domain";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in · Placement Tracker" },
      { name: "description", content: "Sign in to your Placement Tracker account." },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (context.user) throw redirect({ to: "/" });
  },
  component: LoginView,
});

type Mode = "signin" | "signup";

// A sample entry for the specimen card on the sign-in page. Dates are fixed
// literals rather than computed from `new Date()` so the server and client render
// identical text — a relative date here would hydrate as a mismatch.
const SPECIMEN_EVENT: EventRow = {
  id: "specimen",
  company: "Rubicon Analytics",
  role: "Quant Developer",
  round: "R2 — Technical",
  type: "INTERVIEW",
  mode: "OFFLINE",
  status: "INTERVIEW_R2",
  priority: "HIGH",
  start_at: "2026-07-26T09:00:00.000Z",
  end_at: null,
  location: "Placement Cell, Block C",
  link: null,
  ctc: "32 LPA",
  contacts: [],
  prep_notes: null,
  outcome_notes: null,
  resume_version: null,
  reminder_sent: false,
  reminder_sent_at: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
  user_id: null,
};

function LoginView() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // This page is SSR'd, so the form is on screen and interactive-looking before
  // React hydrates — but nothing done in that window survives:
  //   - typing goes only into the DOM; hydration resets these controlled inputs
  //     to their (empty) `value` prop, silently discarding it;
  //   - clicking submit runs no `onSubmit` handler, so the browser performs a
  //     *native* form submit and reloads `/login?` (empty query — no input
  //     carries a `name`, which is also why nothing leaks into the URL).
  // Gating the form on mount closes that window. A disabled default button also
  // suppresses implicit Enter-key submission, so every entry path is covered.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setPending(true);
    try {
      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        await navigate({ to: "/" });
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signUpError) throw signUpError;
      // With email confirmation on, signUp returns no active session — the user
      // must click the confirmation link first. With it off, a session is issued
      // immediately and we can go straight in.
      if (data.session) {
        await navigate({ to: "/" });
        return;
      }
      setNotice("Account created. Check your email for a confirmation link, then sign in.");
      setMode("signin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function onGoogle() {
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (oauthError) throw oauthError;
      // A successful call navigates away to Google; nothing else to do here.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Google sign-in.");
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="grid w-full max-w-4xl items-start gap-10 md:grid-cols-[1fr_22rem] md:gap-14">
        {/* Left: what you are signing into. A returning user reads none of this,
            but a first-time visitor previously got a bare form that never said
            what the product does. */}
        <div>
          <div className="mb-7 flex items-center gap-3">
            <div className="h-11 w-11 rounded-sm border border-brass/50 text-brass grid place-items-center">
              <Stamp className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <div>
              <div className="font-serif text-xl leading-tight">Placement</div>
              <div className="text-[10px] font-mono tracking-[0.25em] text-brass/80 leading-tight">
                DOSSIER
              </div>
            </div>
          </div>

          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-brass">
            Confidential · Personnel file
          </p>
          <h1 className="font-serif text-3xl font-semibold leading-[1.15] md:text-4xl">
            Your placement season, kept on file.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
            Log every pre-placement talk, online test and interview round in one place. Each entry
            gets an email reminder 24 hours before it starts, so nothing on your calendar arrives
            unannounced.
          </p>

          {/* The signature element previewing itself: the real EventCard, fed a
              specimen row, so this can never drift from the actual component.
              Inert — it is a sample document, not a control. */}
          <div className="pointer-events-none mt-9 hidden max-w-sm select-none md:block">
            <EventCard event={SPECIMEN_EVENT} />
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Specimen entry
            </p>
          </div>
        </div>

        {/* Right: the credential counter. */}
        <Card className="p-6 bg-card border-border">
          <header className="mb-5">
            <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-brass mb-1">
              {mode === "signin" ? "Access" : "Enrol"}
            </p>
            {/* h2, not h1: the page's h1 is the headline in the left panel. Still
                a heading, so it stays reachable by role. */}
            <h2 className="font-serif text-2xl font-semibold">
              {mode === "signin" ? "Sign in" : "Create account"}
            </h2>
          </header>

          <form onSubmit={onSubmit}>
            {/* One native attribute gates every control inside, so the whole
                form is inert until hydration rather than each field
                remembering to opt in. */}
            <fieldset disabled={!hydrated} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {notice && <p className="text-sm text-ledger-bright">{notice}</p>}

              <Button type="submit" disabled={pending}>
                {pending ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </fieldset>
          </form>

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              or
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          {/* Same pre-hydration window: this button's only behaviour is its
              onClick, so a click before mount would do nothing at all. */}
          <Button
            variant="outline"
            className="w-full"
            onClick={onGoogle}
            disabled={pending || !hydrated}
          >
            Sign in with Google
          </Button>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
            <button
              type="button"
              disabled={!hydrated}
              className="text-brass hover:underline cursor-pointer"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setNotice(null);
              }}
            >
              {mode === "signin" ? "Create one" : "Sign in"}
            </button>
          </p>
        </Card>
      </div>
    </div>
  );
}
