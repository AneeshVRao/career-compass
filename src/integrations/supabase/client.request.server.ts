// The THIRD Supabase client: per-request, cookie-aware, anon key, RLS-enforced.
//
// How the three differ:
//   - client.ts                 → browser client; session in a cookie
//   - client.server.ts          → service-role admin client; bypasses RLS
//   - this file                 → server-side client that reads the request's auth
//                                 cookie, so queries run as the logged-in user
//                                 and RLS applies
//
// SECURITY / BUILD: this imports TanStack Start's cookie helpers from
// `@tanstack/react-start/server`, which the build's importProtection plugin
// forbids in any client-reachable module. Only ever dynamic-import this from
// inside a server function handler or a route `server.handlers` block — the same
// discipline client.server.ts requires.
import { createServerClient } from "@supabase/ssr";
import { getCookies, setCookie } from "@tanstack/react-start/server";
import type { Database } from "./types";
import { createSupabaseFetch } from "./fetch";

function resolveServerSupabaseEnv(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    const missing = [
      ...(!url ? ["SUPABASE_URL"] : []),
      ...(!key ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Set them in your .env / deployment secrets.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }
  return { url, key };
}

export function getSupabaseServerClient() {
  const { url, key } = resolveServerSupabaseEnv();
  return createServerClient<Database>(url, key, {
    global: { fetch: createSupabaseFetch(key) },
    cookies: {
      getAll() {
        return Object.entries(getCookies() ?? {}).map(([name, value]) => ({
          name,
          value: value ?? "",
        }));
      },
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          setCookie(name, value, options);
        }
      },
    },
  });
}
