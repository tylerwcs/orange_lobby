import { describe, expect, it } from "vitest";
import { createWedgeReader } from "@/lib/wedge";

/** Feeds `text` one key at a time, `gap` ms apart, then `end`; returns what the last key yielded. */
function type(reader: ReturnType<typeof createWedgeReader>, text: string, { start = 1000, gap = 8, end = "Enter" } = {}) {
  let t = start;
  for (const ch of text) { reader.feed(ch, t); t += gap; }
  return reader.feed(end, t);
}

const url = "https://ecphub.vercel.app/a/yrr5sk6tradw";

describe("createWedgeReader", () => {
  it("returns what a hand scanner typed when it presses Enter", () => {
    expect(type(createWedgeReader(), url)).toBe(url);
  });

  it("accepts Tab as the end of a scan too, for scanners set up that way", () => {
    expect(type(createWedgeReader(), url, { end: "Tab" })).toBe(url);
  });

  it("ignores a person typing, however long, because people type slowly", () => {
    expect(type(createWedgeReader(), "tan wei ming", { gap: 140 })).toBeNull();
  });

  it("ignores a short fast burst, like a name typed quickly and then Enter", () => {
    expect(type(createWedgeReader(), "ann", { gap: 20 })).toBeNull();
  });

  it("ignores Enter on its own", () => {
    expect(createWedgeReader().feed("Enter", 1000)).toBeNull();
  });

  it("drops what a person typed before the scan started, keeping only the scan", () => {
    const r = createWedgeReader();
    r.feed("a", 0); r.feed("n", 200); r.feed("n", 400);
    expect(type(r, url, { start: 900 })).toBe(url);
  });

  it("does not let Shift, which a scanner sends before capitals, break a burst", () => {
    const r = createWedgeReader();
    let t = 0;
    for (const ch of "ABCDEFGHIJKL") { r.feed("Shift", t); r.feed(ch, t + 2); t += 8; }
    expect(r.feed("Enter", t)).toBe("ABCDEFGHIJKL");
  });

  it("does not return a code twice when Enter is pressed again straight after", () => {
    const r = createWedgeReader();
    expect(type(r, url)).toBe(url);
    expect(r.feed("Enter", 2000)).toBeNull();
  });

  it("reads two badges scanned back to back as two codes", () => {
    const r = createWedgeReader();
    expect(type(r, url, { start: 0 })).toBe(url);
    expect(type(r, "https://ecphub.vercel.app/a/abcdefghijkl", { start: 1500 })).toBe("https://ecphub.vercel.app/a/abcdefghijkl");
  });

  it("forgets a burst that stalls before Enter, so a later Enter cannot submit it", () => {
    const r = createWedgeReader();
    let t = 0;
    for (const ch of url) { r.feed(ch, t); t += 8; }
    expect(r.feed("Enter", t + 1000)).toBeNull();
  });
});
