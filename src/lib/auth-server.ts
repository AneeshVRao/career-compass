// Server function that resolves the current user from the auth cookie.
//
// This module IS client-reachable (the root route imports fetchAuthUser), so it
// must not statically import anything server-only. The cookie-aware Supabase
// client lives in @/integrations/supabase/client.request.server and is
// dynamic-imported inside the handler, which keeps
// `@tanstack/react-start/server` out of the client bundle — the build's
// importProtection plugin fails loudly if that discipline slips.
import { createServerFn } from "@tanstack/react-start";

// `import type` is erased at build time, so importing this from client-reachable
// modules (e.g. auth.tsx) is safe even though it's declared in the same file as
// a server function — no separate types-only module needed for one alias.
export type AuthUser = { id: string; email: string | null };

// Returns null when there is no valid session. Used by the root route's
// beforeLoad to seed router context / guard protected pages, and by /login to
// bounce already-signed-in visitors away.
export const fetchAuthUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthUser | null> => {
    const { getSupabaseServerClient } =
      await import("@/integrations/supabase/client.request.server");
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  },
);
