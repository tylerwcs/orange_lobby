import { describe, expect, it } from "vitest";
import { clearPending, expired, loadPending, savePending, settle, type Pending } from "@/features/qualifier/game/pending";
import { RUN_CAP_MS, SUBMIT_GRACE_MS } from "@/features/qualifier/game/rules";

/** A Storage held in memory, as localStorage behaves. */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}

/** Storage that throws on every call (Safari private mode, blocked site data). */
const throwing = new Proxy({} as Storage, {
  get() { throw new Error("blocked"); },
});
const throwingCalls: Storage = {
  length: 0,
  clear: () => { throw new Error("blocked"); },
  getItem: () => { throw new Error("blocked"); },
  key: () => { throw new Error("blocked"); },
  removeItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("QuotaExceededError"); },
};

const run: Pending = {
  runId: "run-1",
  body: { runId: "run-1", device: "touch", keys: "ab\bc", times: [100, 50, 70, 20], inserts: [] },
  tries: 0,
  savedAt: 1_700_000_000_000,
};

describe("pending run store", () => {
  it("saves, loads and clears a finished run, per token", () => {
    const s = memoryStorage();
    savePending(s, "tok", run);
    expect(loadPending(s, "tok")).toEqual(run);
    expect(loadPending(s, "other")).toBeNull();
    savePending(s, "tok", { ...run, tries: 2 });
    expect(loadPending(s, "tok")?.tries).toBe(2);
    clearPending(s, "tok");
    expect(loadPending(s, "tok")).toBeNull();
  });

  it("is null without storage or for junk, and never throws", () => {
    expect(loadPending(null, "tok")).toBeNull();
    expect(() => savePending(null, "tok", run)).not.toThrow();
    expect(() => clearPending(null, "tok")).not.toThrow();
    for (const s of [throwing, throwingCalls]) {
      expect(() => savePending(s, "tok", run)).not.toThrow();
      expect(loadPending(s, "tok")).toBeNull();
      expect(() => clearPending(s, "tok")).not.toThrow();
    }
    const s = memoryStorage();
    savePending(s, "tok", run);
    const key = s.key(0) as string;
    for (const junk of ["{", "null", "[]", JSON.stringify({ runId: "x", tries: 0, body: { keys: 1 } })]) {
      s.setItem(key, junk);
      expect(loadPending(s, "tok")).toBeNull();
    }
  });
});

describe("a kept run that has expired", () => {
  it("reads a missing savedAt as 0 and refuses a bad one", () => {
    const s = memoryStorage();
    savePending(s, "tok", run);
    const key = s.key(0) as string;
    const old: Partial<Pending> = { ...run };
    delete old.savedAt;
    s.setItem(key, JSON.stringify(old));
    expect(loadPending(s, "tok")).toEqual({ ...run, savedAt: 0 });
    for (const savedAt of ["1", -1, 1.5, null]) {
      s.setItem(key, JSON.stringify({ ...run, savedAt }));
      expect(loadPending(s, "tok")).toBeNull();
    }
  });
  it("is expired a minute past what the server would take (RUN_CAP_MS + SUBMIT_GRACE_MS), not before", () => {
    const last = run.savedAt + RUN_CAP_MS + SUBMIT_GRACE_MS + 60_000;
    expect(expired(run, run.savedAt)).toBe(false);
    expect(expired(run, last)).toBe(false);
    expect(expired(run, last + 1)).toBe(true);
    expect(expired({ ...run, savedAt: 0 }, run.savedAt)).toBe(true);
  });
});

describe("settle", () => {
  it("clears on any final answer", () => {
    for (const a of ["ok", "done", "late", "refused", "invalid"] as const) expect(settle(a)).toBe("clear");
  });
  it("retries an early answer (clock skew) and a network failure", () => {
    expect(settle("early")).toBe("retry");
    expect(settle("network")).toBe("retry");
  });
});
