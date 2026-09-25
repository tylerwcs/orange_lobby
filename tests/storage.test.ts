import { describe, it, expect } from "vitest";
import {
  acceptImage,
  acceptUpload,
  mediaObjectPath,
  mediaPathFromUrl,
  submissionObjectPath,
  submissionFilePaths,
  imageIntent,
  IMAGE_ACCEPT,
  MAX_IMAGE_BYTES,
} from "@/lib/storage";

const SUPABASE = "https://abc.supabase.co";
const img = (type: string, size = 1024) => ({ type, size });

describe("acceptImage", () => {
  it("accepts a PNG and names the extension it will be stored under", () => {
    expect(acceptImage(img("image/png"))).toBe("png");
  });

  it("stores a JPEG as .jpg whichever mime type the browser sends", () => {
    expect(acceptImage(img("image/jpeg"))).toBe("jpg");
    expect(acceptImage(img("image/jpg"))).toBe("jpg");
  });

  it("accepts WebP and SVG, because floor plans are often vector", () => {
    expect(acceptImage(img("image/webp"))).toBe("webp");
    expect(acceptImage(img("image/svg+xml"))).toBe("svg");
  });

  it("rejects a file that is not one of those image types", () => {
    expect(() => acceptImage(img("application/pdf"))).toThrow(/PNG, JPEG, WebP or SVG/);
  });

  it("rejects an image over the size cap", () => {
    expect(() => acceptImage(img("image/png", MAX_IMAGE_BYTES + 1))).toThrow(/4 MB/);
  });

  it("rejects an empty file, which is what an untouched file input posts", () => {
    expect(() => acceptImage(img("application/octet-stream", 0))).toThrow(/Choose an image/);
  });
});

describe("mediaObjectPath", () => {
  it("files the object under its org and event, named for what it is", () => {
    expect(mediaObjectPath({ orgId: "org1", eventId: "ev1", kind: "logo", ext: "png" }, "a1b2c3")).toBe("org1/ev1/logo-a1b2c3.png");
  });
});

describe("imageIntent", () => {
  const form = (entries: [string, string | File][]) => {
    const fd = new FormData();
    for (const [k, v] of entries) fd.append(k, v);
    return fd;
  };
  const png = new File(["x"], "poster.png", { type: "image/png" });

  it("uploads a picked file", () => {
    expect(imageIntent(form([["image", png]]), "image")).toEqual({ action: "upload", file: png });
  });

  it("keeps the stored image when the file input posts nothing", () => {
    expect(imageIntent(form([["image", new File([], "", { type: "application/octet-stream" })]]), "image")).toEqual({ action: "keep" });
    expect(imageIntent(form([]), "image")).toEqual({ action: "keep" });
  });

  it("removes it when the remove box is ticked and nothing new was picked", () => {
    expect(imageIntent(form([["image_remove", "on"]]), "image")).toEqual({ action: "remove" });
  });

  it("lets a new file win over a ticked remove box", () => {
    expect(imageIntent(form([["image", png], ["image_remove", "on"]]), "image")).toEqual({ action: "upload", file: png });
  });
});

describe("mediaObjectPath for an activity", () => {
  it("names the object for the activity kind", () => {
    expect(mediaObjectPath({ orgId: "org1", eventId: "ev1", kind: "activity", ext: "jpg" }, "a1b2c3")).toBe("org1/ev1/activity-a1b2c3.jpg");
  });
});

describe("mediaPathFromUrl", () => {
  it("finds the object path inside one of our own public URLs", () => {
    const url = `${SUPABASE}/storage/v1/object/public/event-media/org1/ev1/logo-a1b2c3.png`;
    expect(mediaPathFromUrl(url, SUPABASE)).toBe("org1/ev1/logo-a1b2c3.png");
  });

  it("returns null for an image hosted somewhere else, so it is dropped and never chased", () => {
    expect(mediaPathFromUrl("https://cdn.example.com/logo.png", SUPABASE)).toBeNull();
  });

  it("returns null for another bucket on the same project", () => {
    expect(mediaPathFromUrl(`${SUPABASE}/storage/v1/object/public/avatars/org1/x.png`, SUPABASE)).toBeNull();
  });

  it("tolerates a trailing slash on the configured Supabase URL", () => {
    const url = `${SUPABASE}/storage/v1/object/public/event-media/org1/ev1/banner-z9.webp`;
    expect(mediaPathFromUrl(url, `${SUPABASE}/`)).toBe("org1/ev1/banner-z9.webp");
  });
});

describe("IMAGE_ACCEPT", () => {
  it("offers the file picker exactly the types acceptImage allows", () => {
    const offered = IMAGE_ACCEPT.split(",");
    expect(offered.length).toBeGreaterThan(0);
    for (const type of offered) expect(() => acceptImage(img(type))).not.toThrow();
  });
});

describe("acceptUpload", () => {
  it("takes a PDF, which acceptImage must not", () => {
    expect(acceptUpload({ type: "application/pdf", size: 1000 })).toBe("pdf");
    expect(() => acceptImage({ type: "application/pdf", size: 1000 })).toThrow();
  });

  it("refuses a file over 10 MB", () => {
    expect(() => acceptUpload({ type: "image/png", size: 10 * 1024 * 1024 + 1 })).toThrow(/10 MB/);
  });

  it("refuses an empty file", () => {
    expect(() => acceptUpload({ type: "image/png", size: 0 })).toThrow();
  });

  it("puts a submission's file under its own event and form", () => {
    const path = submissionObjectPath({ orgId: "o", eventId: "e", formId: "f", ext: "png" }, "abc123");
    expect(path).toBe("o/e/f/submission-abc123.png");
  });
});

describe("submissionFilePaths", () => {
  const prefix = "org1/ev1";

  it("finds every uploaded file among a set of submissions' answers", () => {
    const answers = [
      { photo: "org1/ev1/act1/submission-ab12cd34.jpg", caption: "At the booth" },
      { receipt: "org1/ev1/act2/submission-ef56ab78.pdf" },
      {},
    ];
    expect(submissionFilePaths(answers, prefix)).toEqual([
      "org1/ev1/act1/submission-ab12cd34.jpg",
      "org1/ev1/act2/submission-ef56ab78.pdf",
    ]);
  });

  it("goes by where the file sits, not by the question's key", () => {
    // A key renamed after the upload still holds the path; reading current file-question
    // keys would miss exactly that file (D169).
    expect(submissionFilePaths([{ old_key: "org1/ev1/act1/submission-00000000.png" }], prefix))
      .toEqual(["org1/ev1/act1/submission-00000000.png"]);
  });

  it("never names anything outside this event's folder, or a typed answer that only looks like one", () => {
    const answers = [{ a: "org1/ev2/act1/submission-11111111.jpg", b: "org1/ev1", c: "org1/ev1x/f.jpg", d: 42, e: null }];
    expect(submissionFilePaths(answers as Record<string, unknown>[], prefix)).toEqual([]);
  });

  it("names a file once however many submissions carry it", () => {
    const path = "org1/ev1/act1/submission-22222222.jpg";
    expect(submissionFilePaths([{ a: path }, { b: path }], prefix)).toEqual([path]);
  });
});
