import { describe, expect, it } from "vitest";
import { isResizable, resizablePath, resizedUrl } from "@/lib/image-src";

const SB = "https://proj.supabase.co";
const obj = (p: string) => `${SB}/storage/v1/object/public/event-media/${p}`;

describe("resizablePath", () => {
  it("returns the bucket path of our own raster images", () => {
    expect(resizablePath(obj("org/ev/activity-ab12.jpg"), SB)).toBe("org/ev/activity-ab12.jpg");
    expect(resizablePath(obj("org/ev/banner-1.PNG"), SB)).toBe("org/ev/banner-1.PNG");
    expect(resizablePath(obj("org/ev/x.webp"), SB)).toBe("org/ev/x.webp");
  });

  it("leaves SVGs, GIFs, other buckets and other hosts alone", () => {
    expect(resizablePath(obj("org/ev/logo.svg"), SB)).toBeNull();
    expect(resizablePath(obj("org/ev/anim.gif"), SB)).toBeNull();
    expect(resizablePath(`${SB}/storage/v1/object/public/polaroids/a.jpg`, SB)).toBeNull();
    expect(resizablePath("https://example.com/storage/v1/object/public/event-media/a.jpg", SB)).toBeNull();
    expect(resizablePath("/portal-icons/agenda.webp", SB)).toBeNull();
  });

  it("refuses a URL that already carries a query or fragment", () => {
    expect(resizablePath(obj("org/ev/a.jpg?x=1"), SB)).toBeNull();
    expect(resizablePath(obj("org/ev/a.jpg#1"), SB)).toBeNull();
  });

  it("is never resizable without a Supabase URL", () => {
    expect(isResizable(obj("org/ev/a.jpg"), "")).toBe(false);
  });
});

describe("resizedUrl", () => {
  it("points at the render endpoint, keeping the shape and never cropping", () => {
    expect(resizedUrl(obj("org/ev/a%20b.jpg"), 828, 75, SB)).toBe(
      `${SB}/storage/v1/render/image/public/event-media/org/ev/a%20b.jpg?width=828&quality=75&resize=contain`,
    );
  });

  it("tolerates a trailing slash on the project URL", () => {
    expect(resizedUrl(obj("o/e/a.png"), 640, 75, `${SB}/`)).toContain(`${SB}/storage/v1/render/image/public/`);
  });

  it("returns anything it cannot resize unchanged", () => {
    expect(resizedUrl("/app-icons/icon-192.png", 640, 75, SB)).toBe("/app-icons/icon-192.png");
    expect(resizedUrl(obj("o/e/logo.svg"), 640, 75, SB)).toBe(obj("o/e/logo.svg"));
  });
});
