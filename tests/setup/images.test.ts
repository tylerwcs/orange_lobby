import { describe, expect, it } from "vitest";
import { IMAGE_TARGETS, droppedImages, proportionWarning } from "@/features/setup/images";

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
