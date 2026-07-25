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

async function handleCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

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
