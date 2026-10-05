import { describe, it, expect } from "vitest";
import { nextFileHashes, sha256Hex, sharesFile } from "@/lib/file-hashes";
import type { RegistrationQuestion } from "@/lib/types";

const questions: RegistrationQuestion[] = [
  { key: "km", label: "Distance", type: "number", required: true },
  { key: "strava", label: "Strava", type: "file", required: true },
  { key: "treadmill", label: "Treadmill", type: "file", required: false },
];

describe("sha256Hex (D396)", () => {
  it("fingerprints identical bytes identically and different bytes differently", async () => {
    const a = await sha256Hex(new Blob(["same screenshot"]));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex(new Blob(["same screenshot"]))).toBe(a);
    expect(await sha256Hex(new Blob(["other screenshot"]))).not.toBe(a);
  });
});

describe("sharesFile (D396)", () => {
  const entry = (id: string, hashes: Record<string, string>, status: "submitted" | "revoked" = "submitted") => ({ id, status, file_hashes: hashes });

  it("finds a live entry holding the same file, under any question", () => {
    expect(sharesFile({ strava: "aaa" }, [entry("1", { treadmill: "aaa" })])).toBe(true);
  });

  it("ignores revoked entries, so a revoked mistake can be sent again", () => {
    expect(sharesFile({ strava: "aaa" }, [entry("1", { strava: "aaa" }, "revoked")])).toBe(false);
  });

  it("ignores the entry being edited", () => {
    expect(sharesFile({ strava: "aaa" }, [entry("1", { strava: "aaa" })], "1")).toBe(false);
  });

  it("is false with no new files, and for entries sent before fingerprints existed", () => {
    expect(sharesFile({}, [entry("1", { strava: "aaa" })])).toBe(false);
    expect(sharesFile({ strava: "aaa" }, [{ id: "1", status: "submitted", file_hashes: null }])).toBe(false);
  });
});

describe("nextFileHashes (D396)", () => {
  const before = { km: "3", strava: "p/old.jpg", treadmill: "" };

  it("keeps the fingerprint of a file the edit left in place", () => {
    expect(nextFileHashes(questions, before, { strava: "old" }, { ...before, km: "4" }, {})).toEqual({ strava: "old" });
  });

  it("takes the new fingerprint of a replaced file", () => {
    expect(nextFileHashes(questions, before, { strava: "old" }, { ...before, strava: "p/new.jpg" }, { strava: "new" })).toEqual({ strava: "new" });
  });

  it("drops the fingerprint of a file the edit cleared", () => {
    expect(nextFileHashes(questions, before, { strava: "old" }, { ...before, strava: "" }, {})).toEqual({});
  });

  it("reads a question keyed \"constructor\" as its own property", () => {
    const qs: RegistrationQuestion[] = [{ key: "constructor", label: "Constructor", type: "file", required: false }];
    expect(nextFileHashes(qs, {}, {}, { constructor: "" }, {})).toEqual({});
  });

  it("copes with an entry that has no fingerprints yet", () => {
    expect(nextFileHashes(questions, before, null, { ...before, treadmill: "p/t.jpg" }, { treadmill: "t" })).toEqual({ treadmill: "t" });
  });
});
