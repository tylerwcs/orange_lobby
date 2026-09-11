import { describe, expect, it } from "vitest";
import { flashPath, readFlash, stripFlash } from "@/lib/flash";

const params = (search: string) => new URLSearchParams(search);

describe("flashPath", () => {
  it("carries the message and leaves an ok tone implicit", () => {
    expect(flashPath("/admin/events/1/attendees", "Saved Ann.")).toBe("/admin/events/1/attendees?flash=Saved+Ann.");
  });

  it("marks an error tone", () => {
    expect(flashPath("/a", "Nope", "error")).toBe("/a?flash=Nope&tone=error");
  });

  it("keeps a query the path already had", () => {
    expect(flashPath("/a?q=ann&page=2", "Saved")).toBe("/a?q=ann&page=2&flash=Saved");
  });

  it("replaces a flash already on the path rather than appending a second", () => {
    expect(flashPath(flashPath("/a", "First"), "Second")).toBe("/a?flash=Second");
  });

  it("encodes a message that would otherwise break the query", () => {
    const url = flashPath("/a", 'Imported 3, updated 1. Skipped — row 4: "Name" is blank & row 5');
    expect(readFlash(params(url.split("?")[1]))?.message).toBe('Imported 3, updated 1. Skipped — row 4: "Name" is blank & row 5');
  });
});

describe("readFlash", () => {
  it("reads nothing when there is nothing to say", () => {
    expect(readFlash(params(""))).toBeNull();
    expect(readFlash(params("flash="))).toBeNull();
    expect(readFlash(params("q=ann"))).toBeNull();
  });

  it("defaults to ok, and only the exact word makes it an error", () => {
    expect(readFlash(params("flash=Saved"))).toEqual({ message: "Saved", tone: "ok" });
    expect(readFlash(params("flash=Nope&tone=error"))).toEqual({ message: "Nope", tone: "error" });
    expect(readFlash(params("flash=Nope&tone=ERROR"))?.tone).toBe("ok");
    expect(readFlash(params("flash=Nope&tone=warning"))?.tone).toBe("ok");
  });
});

describe("stripFlash", () => {
  it("takes the flash out and leaves everything else alone", () => {
    expect(stripFlash("q=ann&page=2&flash=Saved&tone=error")).toBe("?q=ann&page=2");
  });

  it("returns an empty string when nothing is left, so the URL has no bare question mark", () => {
    expect(stripFlash("flash=Saved&tone=error")).toBe("");
    expect(stripFlash("")).toBe("");
  });

  it("round-trips: what flashPath added is exactly what it removes", () => {
    const url = flashPath("/a?q=ann", "Saved", "error");
    expect(`/a${stripFlash(url.split("?")[1])}`).toBe("/a?q=ann");
  });
});
