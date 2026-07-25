// Shared fetch wrapper for the Supabase clients.
//
// New-style Supabase API keys (sb_publishable_… / sb_secret_…) are opaque
// strings, not JWTs, so PostgREST rejects them in an `Authorization: Bearer`
// header. supabase-js still sets that header by default, so we strip it when it
// is just the raw key and rely on the `apikey` header instead. A real user
// session sends `Bearer <jwt>` (not the key), which passes through untouched so
// RLS sees the authenticated user.
function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

export function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}
