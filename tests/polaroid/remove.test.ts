import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => {
  const state = { row: { id: "p1", photo_path: "o/e/a/x.jpg", status: "live" } as { id: string; photo_path: string; status: string } | null };
  const remove = vi.fn(async (paths: string[]) => { void paths; return { error: null as Error | null }; });
  // A query chain that answers every step with itself, and the row or the update's result at the end.
  const chain = (result: () => unknown) => {
    const c: Record<string, unknown> = {};
    for (const k of ["select", "eq", "update", "order", "limit"]) c[k] = () => c;
    c.maybeSingle = async () => ({ data: state.row, error: null });
    c.then = (res: (v: unknown) => unknown) => res(result());
    return c;
  };
  const client = {
    from: () => ({
      select: () => chain(() => ({ data: state.row, error: null })),
      update: () => chain(() => ({ data: [{ id: "p1" }], error: null })),
    }),
    storage: { from: () => ({ remove, getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  };
  return { state, remove, client };
});
vi.mock("@/lib/supabase/service", () => ({ serviceClient: () => h.client }));
vi.mock("@/lib/db/select-all", () => ({ selectAll: async () => [] }));
vi.mock("@/lib/db/media", () => ({ sweepPolaroidPrefix: async () => {} }));

import { removePolaroid } from "@/features/polaroid/db/polaroids";

beforeEach(() => {
  vi.clearAllMocks();
  h.state.row = { id: "p1", photo_path: "o/e/a/x.jpg", status: "live" };
  h.remove.mockResolvedValue({ error: null });
});

describe("removePolaroid (D473)", () => {
  it("deletes the photo once when that works", async () => {
    expect(await removePolaroid("p1", "a1", "admin:u1")).toBe(true);
    expect(h.remove).toHaveBeenCalledTimes(1);
    expect(h.remove).toHaveBeenCalledWith(["o/e/a/x.jpg"]);
  });

  it("retries a failed delete once, and succeeds when the retry does", async () => {
    h.remove.mockResolvedValueOnce({ error: new Error("storage blip") });
    expect(await removePolaroid("p1", "a1", "admin:u1")).toBe(true);
    expect(h.remove).toHaveBeenCalledTimes(2);
  });

  it("throws when the retry fails too, so the admin sees an error", async () => {
    h.remove.mockResolvedValue({ error: new Error("storage down") });
    await expect(removePolaroid("p1", "a1", "admin:u1")).rejects.toThrow("storage down");
    expect(h.remove).toHaveBeenCalledTimes(2);
  });

  it("re-runs the delete for an already removed polaroid, which is the feed's 'Delete photo again'", async () => {
    h.state.row = { id: "p1", photo_path: "o/e/a/x.jpg", status: "removed" };
    expect(await removePolaroid("p1", "a1", "admin:u1")).toBe(false);
    expect(h.remove).toHaveBeenCalledTimes(1);
  });
});
