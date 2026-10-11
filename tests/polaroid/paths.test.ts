import { describe, expect, it } from "vitest";
import { polaroidFolder, polaroidPhotoPath, isOwnPolaroidPath } from "@/lib/storage";
import { polaroidWalkinLink, polaroidWallLink } from "@/lib/links";

const where = { orgId: "o1", eventId: "e1", activityId: "a1" };
const uuid = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";

describe("polaroid paths (D474)", () => {
  it("files every photo under its org, event and activity", () => {
    expect(polaroidFolder(where)).toBe("o1/e1/a1/");
    expect(polaroidPhotoPath(where, uuid)).toBe(`o1/e1/a1/${uuid}.jpg`);
  });
  it("accepts only a uuid .jpg directly in the activity's folder", () => {
    const folder = polaroidFolder(where);
    expect(isOwnPolaroidPath(folder, `o1/e1/a1/${uuid}.jpg`)).toBe(true);
    expect(isOwnPolaroidPath(folder, `o1/e1/a2/${uuid}.jpg`)).toBe(false);
    expect(isOwnPolaroidPath(folder, `o1/e1/a1/x/${uuid}.jpg`)).toBe(false);
    expect(isOwnPolaroidPath(folder, `o1/e1/a1/../a2/${uuid}.jpg`)).toBe(false);
    expect(isOwnPolaroidPath(folder, `o1/e1/a1/${uuid}.png`)).toBe(false);
  });
});

describe("polaroid links", () => {
  it("puts the walk-in link on the event's own address when it has one", () => {
    expect(polaroidWalkinLink({ slug: "kom", domain: null }, "abc")).toBe("http://localhost:3000/e/kom/polaroid/abc");
    expect(polaroidWalkinLink({ slug: "kom", domain: "kom.example.com" }, "abc")).toBe("http://kom.example.com:3000/polaroid/abc");
  });
  it("keeps the wall on the app's address", () => {
    expect(polaroidWallLink("https://ecphub.vercel.app", "tok")).toBe("https://ecphub.vercel.app/wall/tok");
  });
});
