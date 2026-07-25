// OAuth redirect target. Google (via Supabase) sends the browser here with a
// `code` query param; we exchange it for a session server-side so the auth
// cookie is written before the app renders, then redirect into the app. Runs
// server-only (it is a route handler), so importing the cookie-aware server
// client here is safe.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => handleCallback(request),
    },
  },
});

// `next` arrives as a query param, so it is fully attacker-controlled: without
// this check `/auth/callback?code=VALID&next=https://evil.com` would hand a
// freshly-authenticated user straight to an attacker's site. Only a same-origin
// relative path is accepted; anything else falls back to the app root.
export function safeNext(raw: string | null): string {
  if (!raw) return "/";
  // Browsers normalise "\" to "/" while parsing URLs, so "/\evil.com" is
  // protocol-relative in effect. Normalise first so both separators are checked.
  const path = raw.replace(/\\/g, "/");
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("://")) return "/";
  return path;
}

async function handleCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    const { getSupabaseServerClient } =
      await import("@/integrations/supabase/client.request.server");
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const dest = `/login?error=${encodeURIComponent(error.message)}`;
      return new Response(null, { status: 302, headers: { Location: dest } });
    }
  }

  return new Response(null, { status: 302, headers: { Location: next } });
}
