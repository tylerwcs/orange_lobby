import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/events", () => ({ getEvent: async () => null, updateEvent: async () => {} }));
vi.mock("@/lib/db/media", () => ({ sweepSetupFiles: async () => {} }));
vi.mock("@/lib/db/agenda", () => ({ listAgenda: async () => [], listAgendaDays: async () => [] }));
vi.mock("@/features/catalogue", () => ({ eventFeatures: async () => [] }));

type Row = Record<string, unknown>;
type Table = "event_setup_files" | "event_setup_items";
const h = vi.hoisted(() => ({
  store: { event_setup_files: [] as Record<string, unknown>[], event_setup_items: [] as Record<string, unknown>[] },
  log: [] as string[],
  info: undefined as unknown as (path: string) => Promise<unknown>,
  /** The next file insert loses a race: someone else's identical row lands first, and the insert is refused. */
  raceInsert: false,
  failTouch: false,
}));

/** Just enough of the query builder: select/insert/upsert, eq filters, limit, single, head counts. */
function query(name: Table) {
  const filters: [string, unknown][] = [];
  let op: "select" | "insert" | "upsert" = "select";
  let payload: Row = {};
  let count = false;
  let head = false;
  let single = false;
  let limit = Infinity;
  const run = () => {
    const rows = h.store[name];
    if (op === "insert") {
      if (h.raceInsert) {
        h.raceInsert = false;
        rows.push({ id: "raced", ...payload });
        return { data: null, error: { code: "23505" } };
      }
      h.log.push(`${name}.insert`);
      const row = { id: `row-${rows.length + 1}`, ...payload };
      rows.push(row);
      return { data: single ? row : [row], error: null };
    }
    if (op === "upsert") {
      if (h.failTouch) return { data: null, error: new Error("items down") };
      h.log.push(`${name}.upsert`);
      const same = rows.find((r) => r.event_id === payload.event_id && r.item_key === payload.item_key);
      if (same) Object.assign(same, payload);
      else rows.push({ ...payload });
      return { data: null, error: null };
    }
    const hit = rows.filter((r) => filters.every(([k, v]) => r[k] === v)).slice(0, limit);
    return { data: head ? null : single ? hit[0] : hit, count: count ? hit.length : null, error: null };
  };
  const b = {
    select(_cols?: string, opts?: { count?: string; head?: boolean }) { count = !!opts?.count; head = !!opts?.head; return b; },
    insert(row: Row) { op = "insert"; payload = row; return b; },
    upsert(row: Row) { op = "upsert"; payload = row; return b; },
    eq(k: string, v: unknown) { filters.push([k, v]); return b; },
    limit(n: number) { limit = n; return b; },
    single() { single = true; return b; },
    then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(run()).then(res, rej); },
  };
  return b;
}

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: () => ({
    from: (name: Table) => query(name),
    storage: {
      from: () => ({
        info: (path: string) => h.info(path),
        remove: async (paths: string[]) => { h.log.push(`remove ${paths.join()}`); return { data: null, error: null }; },
      }),
    },
  }),
}));

import { recordSetupFile, retryOnce } from "@/features/setup/db";
import { setupFilePath } from "@/features/setup/hub";

const unknown = (message = "fetch failed") => Object.assign(new Error(message), { name: "StorageUnknownError" });
const apiError = (message: string, status: number) => Object.assign(new Error(message), { name: "StorageApiError", status });

describe("retryOnce (D459)", () => {
  it("returns the first result when nothing went wrong", async () => {
    const fn = vi.fn(async () => ({ data: 1, error: null }));
    expect(await retryOnce(fn)).toEqual({ data: 1, error: null });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries once when storage-js returns a network failure", async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce({ data: null, error: unknown() })
      .mockResolvedValueOnce({ data: 2, error: null });
    expect(await retryOnce(fn)).toEqual({ data: 2, error: null });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries once when the call throws one, recognised by message or by its cause", async () => {
    const errors = [new Error("fetch failed"), new Error("read ECONNRESET"), new Error("other side closed the socket"), new Error("boom", { cause: new Error("ECONNRESET") })];
    for (const e of errors) {
      const fn = vi.fn().mockRejectedValueOnce(e).mockResolvedValueOnce("ok");
      expect(await retryOnce(fn)).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    }
  });

  it("tries exactly twice: a second failure is the answer", async () => {
    const fn = vi.fn(async () => ({ data: null, error: unknown("ECONNRESET") }));
    expect((await retryOnce(fn)).error).toBeTruthy();
    expect(fn).toHaveBeenCalledTimes(2);
    const thrower = vi.fn(async () => { throw new Error("fetch failed"); });
    await expect(retryOnce(thrower)).rejects.toThrow("fetch failed");
    expect(thrower).toHaveBeenCalledTimes(2);
  });

  it("rethrows, and does not retry, anything else", async () => {
    const thrower = vi.fn(async () => { throw new Error("permission denied"); });
    await expect(retryOnce(thrower)).rejects.toThrow("permission denied");
    expect(thrower).toHaveBeenCalledTimes(1);
    const api = vi.fn(async () => ({ data: null, error: apiError("Object not found", 404) }));
    expect((await retryOnce(api)).error).toBeTruthy();
    expect(api).toHaveBeenCalledTimes(1);
  });
});

describe("recordSetupFile (D459)", () => {
  const ev = { id: "11111111-1111-4111-8111-111111111111", org_id: "22222222-2222-4222-8222-222222222222" };
  const path = setupFilePath(ev.org_id, ev.id, "33333333-3333-4333-8333-333333333333", "csv");
  const record = (item = "rooms") => recordSetupFile(ev, item, path, "rooms.csv", "text/csv");

  beforeEach(() => {
    h.store.event_setup_files.length = 0;
    h.store.event_setup_items.length = 0;
    h.log.length = 0;
    h.raceInsert = false;
    h.failTouch = false;
    h.info = async () => ({ data: { name: "x.csv", size: 1234 }, error: null });
  });

  it("records the file with its size and marks the item", async () => {
    expect(await record()).toMatchObject({ event_id: ev.id, item_key: "rooms", path, size_bytes: 1234 });
    expect(h.store.event_setup_items).toHaveLength(1);
  });

  it("survives a dropped connection on the object lookup", async () => {
    let calls = 0;
    h.info = async () => (++calls === 1 ? { data: null, error: unknown("fetch failed") } : { data: { size: 50 }, error: null });
    expect(await record()).toMatchObject({ size_bytes: 50 });
    expect(calls).toBe(2);
  });

  it("is null when nothing is in the bucket, and fails loudly on any other storage error", async () => {
    h.info = async () => ({ data: null, error: apiError("Object not found", 400) });
    expect(await record()).toBeNull();
    h.info = async () => ({ data: null, error: apiError("Invalid JWT", 403) });
    await expect(record()).rejects.toThrow("Invalid JWT");
  });

  it("is idempotent: finishing again returns the same row, recorded once", async () => {
    const first = await record();
    expect(await record()).toEqual(first);
    expect(h.store.event_setup_files).toHaveLength(1);
  });

  it("returns the winner's row when a racing finish inserts it first", async () => {
    h.raceInsert = true;
    expect(await record()).toMatchObject({ id: "raced", item_key: "rooms", path });
    expect(h.store.event_setup_files).toHaveLength(1);
  });

  it("is null for a path recorded under another item or event, or not minted for this event", async () => {
    await record();
    expect(await record("agenda")).toBeNull();
    h.store.event_setup_files[0].event_id = "someone-else";
    expect(await record()).toBeNull();
    expect(await recordSetupFile(ev, "rooms", "not/a/minted/path.csv", "x.csv", "text/csv")).toBeNull();
  });

  it("writes the item's row before the file's row, so a file never lacks one (D458)", async () => {
    await record();
    expect(h.log).toEqual(["event_setup_items.upsert", "event_setup_files.insert"]);
  });

  it("leaves no file row behind when marking the item fails", async () => {
    h.failTouch = true;
    await expect(record()).rejects.toThrow("items down");
    expect(h.store.event_setup_files).toHaveLength(0);
  });
});
