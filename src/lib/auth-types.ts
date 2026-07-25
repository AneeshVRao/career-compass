// Shared auth types. Deliberately free of any server-only import so both the
// client bundle and server modules can reference it.
export type AuthUser = { id: string; email: string | null };
