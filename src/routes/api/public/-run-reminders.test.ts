// Named with the "-" prefix so the TanStack router plugin's routeFileIgnorePrefix
// excludes it from route generation while it stays next to the route it covers.
//
// This is the wiring test for the per-user reminder fan-out. `planReminderSends()`
// is unit-tested in src/lib/reminders.test.ts, but only in the abstract — it just
// pairs recipients with events. What is verified here is the part that actually
// sends: that each user's due event produces exactly one Resend call addressed to
// *that* user's reminder_email, and that the event is flagged as sent afterwards so
// the next cron tick can't send it twice.
//
// Supabase and Resend are mocked rather than live: this asserts the route's
// orchestration, and the chainable/thenable builder mirrors postgrest-js the same
// way src/lib/events-api.test.ts does (see docs/DEVELOPMENT.md).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: fromMock },
}));

type Row = Record<string, unknown>;

// Rows the mocked Supabase returns, and the writes it received. Each test sets the
// first two and asserts on the third.
let settingsRows: Row[] = [];
let eventRows: Row[] = [];
let eventUpdates: { id: unknown; patch: Row }[] = [];
let fetchMock = vi.fn();

function makeBuilder(table: string) {
  let patch: Row | null = null;
  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.select = vi.fn(chain);
  builder.gte = vi.fn(chain);
  builder.lte = vi.fn(chain);
  builder.update = vi.fn((next: Row) => {
    patch = next;
    return builder;
  });
  // Doubles as the reads' filter and the update's row selector — only the latter
  // (a pending patch plus an id filter) counts as a write.
  builder.eq = vi.fn((column: string, value: unknown) => {
    if (patch && column === "id") eventUpdates.push({ id: value, patch });
    return builder;
  });
  builder.then = (
    onFulfilled: (value: { data: unknown; error: null }) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => {
    const data = patch ? null : table === "settings" ? settingsRows : eventRows;
    return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
  };
  return builder;
}

const CRON_SECRET = "test-cron-secret";

beforeEach(() => {
  settingsRows = [];
  eventRows = [];
  eventUpdates = [];
  fromMock.mockImplementation((table: string) => makeBuilder(table));
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "resend-id" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("REMINDER_CRON_SECRET", CRON_SECRET);
  vi.stubEnv("RESEND_API_KEY", "test-resend-key");
});

afterEach(() => {
  fromMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const { Route } = await import("./run-reminders");

function post(headers: Record<string, string> = { "x-reminder-cron-secret": CRON_SECRET }) {
  const handler = Route.options.server!.handlers as {
    POST: (ctx: { request: Request }) => Promise<Response>;
  };
  return handler.POST({
    request: new Request("http://localhost:8080/api/public/run-reminders", {
      method: "POST",
      headers,
    }),
  });
}

function settingsFor(userId: string, email: string, overrides: Row = {}): Row {
  return {
    user_id: userId,
    reminder_email: email,
    reminders_enabled: true,
    from_email: "Placement Tracker <onboarding@resend.dev>",
    ...overrides,
  };
}

function eventFor(id: string, userId: string | null, overrides: Row = {}): Row {
  return {
    id,
    user_id: userId,
    company: "Acme",
    type: "INTERVIEW",
    round: "Tech R1",
    role: "SWE",
    start_at: "2026-07-26T09:30:00.000Z",
    mode: "Online",
    location: null,
    link: null,
    prep_notes: null,
    reminder_sent: false,
    ...overrides,
  };
}

// Body of the nth Resend call, so assertions read as "who got emailed what".
function sentEmail(index: number): Row {
  const init = fetchMock.mock.calls[index][1] as RequestInit;
  return JSON.parse(init.body as string) as Row;
}

describe("POST /api/public/run-reminders — authorization", () => {
  it("rejects a request with no shared secret header", async () => {
    const res = await post({});
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong shared secret", async () => {
    const res = await post({ "x-reminder-cron-secret": "not-the-secret" });
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to run at all when no secret is configured on the server", async () => {
    vi.stubEnv("REMINDER_CRON_SECRET", "");
    const res = await post({ "x-reminder-cron-secret": "anything" });
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("looks identical from outside whether the secret is missing or just wrong", async () => {
    // The point of the 401: an anonymous caller must not be able to probe
    // whether REMINDER_CRON_SECRET is configured. Both paths have to be
    // byte-for-byte the same response.
    const wrong = await post({ "x-reminder-cron-secret": "not-the-secret" });
    const wrongBody = await wrong.text();

    vi.stubEnv("REMINDER_CRON_SECRET", "");
    const unconfigured = await post({ "x-reminder-cron-secret": "not-the-secret" });

    expect(unconfigured.status).toBe(wrong.status);
    expect(await unconfigured.text()).toBe(wrongBody);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/public/run-reminders — per-user fan-out", () => {
  it("emails the owner of a due event exactly once and flips reminder_sent", async () => {
    settingsRows = [settingsFor("user-a", "a@example.com")];
    eventRows = [eventFor("event-a", "user-a")];

    const res = await post();
    const body = (await res.json()) as Row;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.checked).toBe(1);
    expect(body.results).toEqual([
      { id: "event-a", company: "Acme", user_id: "user-a", sent: true },
    ]);

    // Exactly one email, addressed to that user's configured recipient.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.resend.com/emails");
    expect(sentEmail(0).to).toEqual(["a@example.com"]);

    // And the event is flagged so the next tick cannot send it again.
    expect(eventUpdates).toHaveLength(1);
    expect(eventUpdates[0].id).toBe("event-a");
    expect(eventUpdates[0].patch.reminder_sent).toBe(true);
    expect(eventUpdates[0].patch.reminder_sent_at).toEqual(expect.any(String));
  });

  it("sends each user only their own event, never the other user's", async () => {
    settingsRows = [settingsFor("user-a", "a@example.com"), settingsFor("user-b", "b@example.com")];
    eventRows = [
      eventFor("event-a", "user-a", { company: "AlphaCo" }),
      eventFor("event-b", "user-b", { company: "BetaCo" }),
    ];

    await post();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const byRecipient = new Map(
      fetchMock.mock.calls.map((_, i) => {
        const mail = sentEmail(i);
        return [(mail.to as string[])[0], mail];
      }),
    );

    expect([...byRecipient.keys()].sort()).toEqual(["a@example.com", "b@example.com"]);
    expect(byRecipient.get("a@example.com")!.subject).toContain("AlphaCo");
    expect(byRecipient.get("a@example.com")!.subject).not.toContain("BetaCo");
    expect(byRecipient.get("b@example.com")!.subject).toContain("BetaCo");
    expect(byRecipient.get("b@example.com")!.subject).not.toContain("AlphaCo");

    expect(eventUpdates.map((u) => u.id).sort()).toEqual(["event-a", "event-b"]);
  });

  it("sends nothing for a user who has reminders switched off", async () => {
    settingsRows = [settingsFor("user-a", "a@example.com", { reminders_enabled: false })];
    eventRows = [eventFor("event-a", "user-a")];

    const res = await post();
    const body = (await res.json()) as Row;

    expect(body.checked).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(eventUpdates).toHaveLength(0);
  });

  it("sends nothing for an unowned event rather than defaulting to another user", async () => {
    settingsRows = [settingsFor("user-a", "a@example.com")];
    eventRows = [eventFor("orphan", null)];

    await post();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(eventUpdates).toHaveLength(0);
  });

  it("leaves reminder_sent alone when Resend rejects the send", async () => {
    settingsRows = [settingsFor("user-a", "a@example.com")];
    eventRows = [eventFor("event-a", "user-a")];
    fetchMock.mockResolvedValue(new Response("quota exceeded", { status: 429 }));

    const res = await post();
    const body = (await res.json()) as { results: Row[] };

    expect(res.status).toBe(200);
    expect(body.results[0].sent).toBe(false);
    expect(body.results[0].error).toContain("429");
    // Not flipping the flag is what lets the next tick retry.
    expect(eventUpdates).toHaveLength(0);
  });

  it("uses the sender address from the owner's settings row", async () => {
    settingsRows = [
      settingsFor("user-a", "a@example.com", { from_email: "Alerts <alerts@a.example>" }),
    ];
    eventRows = [eventFor("event-a", "user-a")];

    await post();

    expect(sentEmail(0).from).toBe("Alerts <alerts@a.example>");
  });
});
