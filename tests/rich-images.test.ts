import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { responsiveRichImages } from "@/lib/rich-images";
import { sanitizeHtml } from "@/lib/sanitize";

const SB = "https://proj.supabase.co";
const obj = (p: string) => `${SB}/storage/v1/object/public/event-media/${p}`;
const render = (p: string, w: number) => `${SB}/storage/v1/render/image/public/event-media/${p}?width=${w}&quality=75&resize=contain`;

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB));
afterEach(() => vi.unstubAllEnvs());

describe("responsiveRichImages", () => {
  it("gives our pictures a srcset, their size and lazy loading after the first", () => {
    const a = obj("o/e/info-1.jpg");
    const b = obj("o/e/info-2.png");
    const html = sanitizeHtml(`<p>Hi</p><img src="${a}" alt="Map"><img src="${b}" alt="">`);
    const out = responsiveRichImages(html, { [a]: { width: 1000, height: 500 } }, "100vw");
    expect(out).toContain(`src="${render("o/e/info-1.jpg", 828)}"`);
    // Never offers a width past the picture's own; the picture's own width closes the set.
    expect(out).toContain(`srcset="${render("o/e/info-1.jpg", 640)} 640w, ${render("o/e/info-1.jpg", 750)} 750w, ${render("o/e/info-1.jpg", 828)} 828w, ${render("o/e/info-1.jpg", 1000)} 1000w"`);
    expect(out).toContain(`alt="Map" width="1000" height="500" loading="eager" decoding="async"`);
    // No recorded size: the full set, no width/height, and lazy because it is not the first.
    expect(out).toContain(`${render("o/e/info-2.png", 1920)} 1920w"`);
    expect(out).toMatch(/alt="" loading="lazy" decoding="async"/);
  });

  it("leaves a picture it cannot resize at its own address", () => {
    const html = sanitizeHtml(`<img src="https://example.com/a.jpg" alt="x">`);
    expect(responsiveRichImages(html, {}, "100vw")).toBe(`<img src="https://example.com/a.jpg" alt="x" loading="eager" decoding="async">`);
  });

  it("changes nothing else", () => {
    const html = sanitizeHtml(`<p>No pictures <strong>here</strong></p>`);
    expect(responsiveRichImages(html, {}, "100vw")).toBe(html);
  });
});
