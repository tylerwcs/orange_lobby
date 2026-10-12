import { describe, expect, it } from "vitest";
import { qrPngBuffer } from "@/lib/qr";

/** A PNG's width: the first four bytes of its IHDR chunk, after the 8-byte signature and the chunk's length and type. */
const pngWidth = (png: Buffer) => png.readUInt32BE(16);

describe("qrPngBuffer", () => {
  it("draws at 600px unless told otherwise", async () => {
    expect(pngWidth(await qrPngBuffer("https://example.com"))).toBe(600);
  });

  it("draws at the asked size, for print", async () => {
    expect(pngWidth(await qrPngBuffer("https://example.com", 1200))).toBe(1200);
  });
});
