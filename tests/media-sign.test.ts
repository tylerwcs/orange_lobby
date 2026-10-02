import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Signed = { path: string | null; signedUrl: string | null; signedURL: string | null; error: string | null };
const storage = vi.hoisted(() => ({
  calls: [] as { bucket: string; paths: string[]; seconds: number }[],
  missing: new Set<string>(),
  failBatch: false,
}));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: () => ({
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (paths: string[], seconds: number) => {
          storage.calls.push({ bucket, paths, seconds });
          if (storage.failBatch) return { data: null, error: new Error("storage down") };
          const data: Signed[] = paths.map((p) => storage.missing.has(p)
            ? { path: p, signedUrl: null, signedURL: null, error: "Either the object does not exist or you do not have access to it" }
            : { path: p, signedUrl: `https://x/${p}?t=${seconds}`, signedURL: `/${p}`, error: null });
          return { data, error: null };
        },
      }),
    },
  }),
}));

const { signedSubmissionUrls } = await import("@/lib/db/media");

beforeEach(() => {
  storage.calls = [];
  storage.missing = new Set();
  storage.failBatch = false;
});

describe("signedSubmissionUrls (D383)", () => {
  it("signs every distinct path in one request against the private bucket", async () => {
    const links = await signedSubmissionUrls(["a.png", "b.png", "a.png", ""], 600);
    expect(storage.calls).toEqual([{ bucket: "form-uploads", paths: ["a.png", "b.png"], seconds: 600 }]);
    expect(links.get("a.png")).toBe("https://x/a.png?t=600");
    expect(links.get("b.png")).toBe("https://x/b.png?t=600");
    expect(links.has("")).toBe(false);
  });

  it("makes no request for no paths", async () => {
    expect((await signedSubmissionUrls([])).size).toBe(0);
    expect(storage.calls).toEqual([]);
  });

  it("splits a long list into batches", async () => {
    const paths = Array.from({ length: 1201 }, (_, i) => `p${i}.png`);
    const links = await signedSubmissionUrls(paths);
    expect(storage.calls.map((c) => c.paths.length)).toEqual([500, 500, 201]);
    expect(storage.calls[0].seconds).toBe(60);
    expect(links.get("p1200.png")).toBe("https://x/p1200.png?t=60");
  });

  it("maps a missing object, or a failed batch, to null rather than dropping it", async () => {
    storage.missing.add("gone.png");
    const links = await signedSubmissionUrls(["gone.png", "ok.png"]);
    expect(links.get("gone.png")).toBeNull();
    expect(links.get("ok.png")).not.toBeNull();

    storage.failBatch = true;
    const failed = await signedSubmissionUrls(["ok.png"]);
    expect(failed.has("ok.png")).toBe(true);
    expect(failed.get("ok.png")).toBeNull();
  });
});
