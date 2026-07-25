import { afterEach, describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: fromMock },
}));

type QueryResult = { data: unknown; error: { message: string } | null };

function makeBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.limit = vi.fn(chain);
  builder.insert = vi.fn(chain);
  builder.update = vi.fn(chain);
  builder.delete = vi.fn(chain);
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (
    onFulfilled: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

// Builders are captured so a test can assert which chain methods a query used,
// not just what it resolved to.
const builders: Record<string, unknown>[] = [];

function queueFromResults(...results: QueryResult[]) {
  for (const result of results) {
    fromMock.mockImplementationOnce(() => {
      const builder = makeBuilder(result);
      builders.push(builder);
      return builder;
    });
  }
}

afterEach(() => {
  fromMock.mockReset();
  builders.length = 0;
});

const {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  setStatus,
  getSettings,
  updateSettings,
} = await import("./events-api");

describe("listEvents", () => {
  it("returns the rows on success", async () => {
    queueFromResults({ data: [{ id: "1" }], error: null });
    await expect(listEvents()).resolves.toEqual([{ id: "1" }]);
  });

  it("returns an empty array when data is null", async () => {
    queueFromResults({ data: null, error: null });
    await expect(listEvents()).resolves.toEqual([]);
  });

  it("throws when the query errors", async () => {
    queueFromResults({ data: null, error: { message: "boom" } });
    await expect(listEvents()).rejects.toEqual({ message: "boom" });
  });
});

describe("createEvent", () => {
  it("returns the created row on success", async () => {
    queueFromResults({ data: { id: "1", company: "Acme" }, error: null });
    await expect(createEvent({ company: "Acme" } as never)).resolves.toEqual({
      id: "1",
      company: "Acme",
    });
  });

  it("throws when the insert errors", async () => {
    queueFromResults({ data: null, error: { message: "boom" } });
    await expect(createEvent({ company: "Acme" } as never)).rejects.toEqual({ message: "boom" });
  });
});

describe("updateEvent", () => {
  it("returns the updated row on success", async () => {
    queueFromResults({ data: { id: "1", company: "Updated" }, error: null });
    await expect(updateEvent("1", { company: "Updated" })).resolves.toEqual({
      id: "1",
      company: "Updated",
    });
  });

  it("throws when the update errors", async () => {
    queueFromResults({ data: null, error: { message: "boom" } });
    await expect(updateEvent("1", { company: "Updated" })).rejects.toEqual({ message: "boom" });
  });
});

describe("deleteEvent", () => {
  it("resolves with no error on success", async () => {
    queueFromResults({ data: null, error: null });
    await expect(deleteEvent("1")).resolves.toBeUndefined();
  });

  it("throws when the delete errors", async () => {
    queueFromResults({ data: null, error: { message: "boom" } });
    await expect(deleteEvent("1")).rejects.toEqual({ message: "boom" });
  });
});

describe("setStatus", () => {
  it("delegates to updateEvent with the new status", async () => {
    queueFromResults({ data: { id: "1", status: "OFFER" }, error: null });
    await expect(setStatus("1", "OFFER")).resolves.toEqual({ id: "1", status: "OFFER" });
  });
});

describe("getSettings", () => {
  it("returns the current user's settings row on success", async () => {
    queueFromResults({ data: { id: "s1", user_id: "u1", reminder_email: "a@b.com" }, error: null });
    await expect(getSettings()).resolves.toEqual({
      id: "s1",
      user_id: "u1",
      reminder_email: "a@b.com",
    });
    expect(fromMock).toHaveBeenCalledWith("settings");
  });

  it("returns null when the user has no settings row yet", async () => {
    queueFromResults({ data: null, error: null });
    await expect(getSettings()).resolves.toBeNull();
  });

  // RLS scopes the query to one user, so the old global single-row `.limit(1)`
  // must be gone: keeping it would hide a duplicate-row bug instead of erroring.
  it("does not fall back to the global single-row limit(1) shortcut", async () => {
    queueFromResults({ data: { id: "s1", user_id: "u1" }, error: null });
    await getSettings();
    expect(builders[0].limit).not.toHaveBeenCalled();
    expect(builders[0].maybeSingle).toHaveBeenCalled();
  });

  it("throws when the query errors", async () => {
    queueFromResults({ data: null, error: { message: "boom" } });
    await expect(getSettings()).rejects.toEqual({ message: "boom" });
  });
});

describe("updateSettings", () => {
  it("throws when no settings row exists", async () => {
    queueFromResults({ data: null, error: null });
    await expect(updateSettings({ reminder_email: "a@b.com" })).rejects.toThrow(
      "Settings row missing",
    );
  });

  it("updates and returns the settings row when one exists", async () => {
    queueFromResults(
      { data: { id: "s1", reminder_email: "old@b.com" }, error: null },
      { data: { id: "s1", reminder_email: "new@b.com" }, error: null },
    );
    await expect(updateSettings({ reminder_email: "new@b.com" })).resolves.toEqual({
      id: "s1",
      reminder_email: "new@b.com",
    });
  });

  it("throws when the update itself errors", async () => {
    queueFromResults(
      { data: { id: "s1", reminder_email: "old@b.com" }, error: null },
      { data: null, error: { message: "boom" } },
    );
    await expect(updateSettings({ reminder_email: "new@b.com" })).rejects.toEqual({
      message: "boom",
    });
  });
});
