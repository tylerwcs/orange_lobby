import { describe, expect, it, vi } from "vitest";
import { attendeeManifest } from "@/lib/web-app";

const event = { name: "Ecopia Kick-Off Meeting 2026", primary_color: "#f97316", slug: "ecpkom", logo_url: null as string | null };

describe("attendeeManifest", () => {
  it("opens the home screen app on this attendee's own page, and keeps them inside it", () => {
    const m = attendeeManifest(event, "/e/ecpkom/a/yrr5sk6tradw");
    expect(m.start_url).toBe("/e/ecpkom/a/yrr5sk6tradw");
    expect(m.scope).toBe("/e/ecpkom/a/yrr5sk6tradw");
    expect(m.id).toBe("/e/ecpkom/a/yrr5sk6tradw");
    expect(m.display).toBe("standalone");
  });

  it("is named after the event, and carries the icon sizes Android needs to offer an install", () => {
    const m = attendeeManifest(event, "/e/ecpkom/a/yrr5sk6tradw");
    expect(m.name).toBe("Ecopia Kick-Off Meeting 2026");
    expect(m.icons?.map((i) => i.sizes)).toEqual(["192x192", "512x512", "512x512"]);
    expect(m.theme_color).toBe("#f97316");
  });

  it("shortens a long event name for the label under the icon", () => {
    expect(attendeeManifest(event, "/x").short_name).toBe("Ecopia Kick-Off");
    expect(attendeeManifest({ ...event, name: "ECP Hub" }, "/x").short_name).toBe("ECP Hub");
    // A slash is a place to break too, or "KOM/YEP/Wellness" is one word too long to keep any of.
    expect(attendeeManifest({ ...event, name: "ECP KOM/YEP/Wellness" }, "/x").short_name).toBe("ECP KOM/YEP");
  });

  it("uses the event's logo for its icons when it has one of ours (D487)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    const logo_url = "https://x.supabase.co/storage/v1/object/public/event-media/o/e/logo-1.png";
    const srcs = attendeeManifest({ ...event, logo_url }, "/x").icons?.map((i) => i.src);
    expect(srcs?.map((s) => s.split("?")[0])).toEqual(["/e/ecpkom/app-icon/192", "/e/ecpkom/app-icon/512", "/e/ecpkom/app-icon/maskable"]);
    // A logo pasted from elsewhere is not drawn; ECP Hub's icons stand.
    expect(attendeeManifest({ ...event, logo_url: "https://elsewhere.com/l.png" }, "/x").icons?.[0].src).toBe("/app-icons/icon-192.png");
    vi.unstubAllEnvs();
  });
});
