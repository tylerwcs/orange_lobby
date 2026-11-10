import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { resizeForWeb } from "@/lib/image-resize";

async function png(width: number, height: number, type = "image/png"): Promise<File> {
  const buf = await sharp({ create: { width, height, channels: 3, background: "#3e7bd9" } })[type === "image/png" ? "png" : "jpeg"]().toBuffer();
  return new File([new Uint8Array(buf)], "x", { type });
}

describe("resizeForWeb", () => {
  it("shrinks a big picture to WebP at 1600 on its long side", async () => {
    const out = await resizeForWeb(await png(3000, 2000), 1600);
    expect(out.type).toBe("image/webp");
    expect(out.ext).toBe("webp");
    const meta = await sharp(out.body as Buffer).metadata();
    expect([meta.width, meta.height]).toEqual([1600, 1067]);
  });

  it("re-encodes a small JPEG as WebP without enlarging it", async () => {
    const out = await resizeForWeb(await png(800, 600, "image/jpeg"), 1600);
    expect(out.type).toBe("image/webp");
    const meta = await sharp(out.body as Buffer).metadata();
    expect([meta.width, meta.height]).toEqual([800, 600]);
  });

  it("leaves an SVG alone", async () => {
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], "x.svg", { type: "image/svg+xml" });
    const out = await resizeForWeb(svg, 1600);
    expect(out).toEqual({ body: svg, type: "image/svg+xml", ext: "svg" });
  });
});
