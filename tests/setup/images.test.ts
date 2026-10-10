import { describe, expect, it } from "vitest";
import {
  IMAGE_TARGETS, droppedImages, imagesToDeleteOnApply, imagesToDeleteOnSave, ownImageAnswers, proportionWarning,
} from "@/features/setup/images";
import { blankBasics, type BasicsAnswers } from "@/features/setup/sections/basics";

describe("proportionWarning (D447)", () => {
  it("is quiet for the recommended size", () => {
    expect(proportionWarning(2400, 800, IMAGE_TARGETS.banner)).toBeNull();
    expect(proportionWarning(512, 512, IMAGE_TARGETS.logo)).toBeNull();
  });
  it("tolerates a few percent off the ratio", () => {
    expect(proportionWarning(2400, 820, IMAGE_TARGETS.banner)).toBeNull();
  });
  it("warns when the banner will be cropped", () => {
    expect(proportionWarning(1600, 900, IMAGE_TARGETS.banner)).toBe("This image is 1600 × 900. Banners are cropped to 3:1, so some of it will be cut off. Best: 2400 × 800.");
  });
  it("warns when an image is too small to stay sharp", () => {
    expect(proportionWarning(900, 300, IMAGE_TARGETS.banner)).toBe("This image is only 900 px wide, so it may look blurry. Best: 2400 × 800.");
  });
});

describe("droppedImages (D447)", () => {
  const f = ["logo_url", "banner_url"] as const;
  it("returns an image the new answers no longer use", () => {
    expect(droppedImages({ logo_url: "a", banner_url: "b" }, { logo_url: "c", banner_url: "b" }, f, [])).toEqual(["a"]);
  });
  it("keeps an image that is submitted, applied or live", () => {
    expect(droppedImages({ logo_url: "a", banner_url: "b" }, { logo_url: "", banner_url: "" }, f, ["a", null])).toEqual(["b"]);
  });
  it("drops nothing on a first save", () => {
    expect(droppedImages(null, { logo_url: "a", banner_url: "" }, f, [])).toEqual([]);
  });
});

const SB = "https://x.supabase.co";
const media = (path: string) => `${SB}/storage/v1/object/public/event-media/${path}`;
const LOGO_A = media("o/e/logo-a.png");
const LOGO_B = media("o/e/logo-b.png");
const LOGO_C = media("o/e/logo-c.png");
const BANNER_A = media("o/e/banner-a.png");
const FOREIGN_LOGO = media("o/other/logo-x.png");
const ev = { org_id: "o", id: "e", logo_url: LOGO_A, banner_url: null as string | null };
const ans = (over: Partial<BasicsAnswers> = {}): BasicsAnswers => ({ ...blankBasics(), ...over });

describe("ownImageAnswers (D447)", () => {
  it("keeps this event's own uploads of the right kind", () => {
    expect(ownImageAnswers(ans({ logo_url: LOGO_B, banner_url: BANNER_A }), ev, SB)).toMatchObject({ logo_url: LOGO_B, banner_url: BANNER_A });
  });
  it("keeps the event's live image wherever it lives", () => {
    const legacy = { ...ev, logo_url: "https://cdn.example.com/old-logo.png" };
    expect(ownImageAnswers(ans({ logo_url: legacy.logo_url }), legacy, SB).logo_url).toBe(legacy.logo_url);
  });
  it("blanks another event's upload, a wrong kind, or an outside URL", () => {
    const out = ownImageAnswers(ans({ logo_url: FOREIGN_LOGO, banner_url: LOGO_B }), ev, SB);
    expect(out).toMatchObject({ logo_url: "", banner_url: "" });
    expect(ownImageAnswers(ans({ logo_url: "https://evil.example.com/x.png" }), ev, SB).logo_url).toBe("");
  });
  it("leaves the other fields alone", () => {
    expect(ownImageAnswers(ans({ name: "KOM", logo_url: FOREIGN_LOGO }), ev, SB).name).toBe("KOM");
  });
});

describe("imagesToDeleteOnSave (D447)", () => {
  it("deletes a replaced draft upload", () => {
    expect(imagesToDeleteOnSave(ans({ logo_url: LOGO_B }), ans({ logo_url: LOGO_C }), [], ev, SB)).toEqual([LOGO_B]);
  });
  it("never deletes another event's file, even if a draft named it", () => {
    expect(imagesToDeleteOnSave(ans({ logo_url: FOREIGN_LOGO }), ans({ logo_url: LOGO_C }), [], ev, SB)).toEqual([]);
  });
  it("never deletes the live image, even when the draft moves off it", () => {
    expect(imagesToDeleteOnSave(ans({ logo_url: LOGO_A }), ans({ logo_url: LOGO_C }), [], ev, SB)).toEqual([]);
  });
  it("never deletes an image the submitted or applied snapshot still uses", () => {
    expect(imagesToDeleteOnSave(ans({ logo_url: LOGO_B }), ans({ logo_url: "" }), [LOGO_B, null], ev, SB)).toEqual([]);
  });
  it("deletes nothing when the draft is reverted to the image it had", () => {
    expect(imagesToDeleteOnSave(ans({ logo_url: LOGO_B }), ans({ logo_url: LOGO_B }), [], ev, SB)).toEqual([]);
  });
  it("deletes nothing on a first save", () => {
    expect(imagesToDeleteOnSave(null, ans({ logo_url: LOGO_C }), [], ev, SB)).toEqual([]);
  });
});

describe("imagesToDeleteOnApply (D450)", () => {
  it("deletes the live image the organiser started from and replaced", () => {
    expect(imagesToDeleteOnApply(ev, { logo_url: LOGO_C }, ans({ logo_url: LOGO_A }), ans({ logo_url: LOGO_C }), SB)).toEqual([LOGO_A]);
  });
  it("deletes it when the organiser removed the image", () => {
    expect(imagesToDeleteOnApply(ev, { logo_url: null }, ans({ logo_url: LOGO_A }), ans(), SB)).toEqual([LOGO_A]);
  });
  it("keeps an image the admin put there since the organiser's starting point", () => {
    // The organiser started from A; the admin since uploaded B in Settings; the organiser submitted C.
    const adminNewer = { ...ev, logo_url: LOGO_B };
    expect(imagesToDeleteOnApply(adminNewer, { logo_url: LOGO_C }, ans({ logo_url: LOGO_A }), ans({ logo_url: LOGO_C }), SB)).toEqual([]);
  });
  it("keeps the live image when the organiser's working draft has gone back to it", () => {
    expect(imagesToDeleteOnApply(ev, { logo_url: LOGO_C }, ans({ logo_url: LOGO_A }), ans({ logo_url: LOGO_A }), SB)).toEqual([]);
  });
  it("never deletes another event's file, even when it is live here", () => {
    const foreignLive = { ...ev, logo_url: FOREIGN_LOGO };
    expect(imagesToDeleteOnApply(foreignLive, { logo_url: LOGO_C }, ans({ logo_url: FOREIGN_LOGO }), ans({ logo_url: LOGO_C }), SB)).toEqual([]);
  });
  it("touches nothing the patch doesn't change", () => {
    expect(imagesToDeleteOnApply(ev, {}, ans({ logo_url: LOGO_A }), ans(), SB)).toEqual([]);
    expect(imagesToDeleteOnApply(ev, { logo_url: LOGO_A }, ans({ logo_url: LOGO_B }), ans(), SB)).toEqual([]);
  });
});
