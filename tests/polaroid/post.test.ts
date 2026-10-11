import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@/lib/types";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  deletePhotos: vi.fn(async (paths: string[]) => { void paths; }),
  insertPolaroid: vi.fn(async (row: unknown): Promise<string | null> => { void row; return "new-id"; }),
  recentPosts: vi.fn(async () => [] as unknown[]),
  uploadedSize: vi.fn(async (path: string): Promise<number | null> => { void path; return 1000; }),
  createPhotoUpload: vi.fn(async () => "tok"),
}));
vi.mock("@/features/polaroid/db/polaroids", () => db);
vi.mock("@/features/polaroid/identity", () => ({ posterKeys: async () => ({ clientKey: "ck", ipHash: "ih" }) }));

import { postPolaroid, type PostContext } from "@/features/polaroid/post";
import { polaroidPhotoPath } from "@/lib/storage";

const where = { orgId: "o1", eventId: "e1", activityId: "a1" };
const path = polaroidPhotoPath(where, "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b");
const ctx = {
  event: { id: "e1", org_id: "o1", status: "live" },
  activity: { id: "a1", is_open: true, polaroid: { blocked_words: ["badword"] } } as unknown as Activity,
  attendeeId: "att1",
} as unknown as PostContext;
const input = (over: object = {}) => ({ path, width: 1200, height: 1600, message: "hello", stickers: [], ...over });

beforeEach(() => {
  vi.clearAllMocks();
  db.recentPosts.mockResolvedValue([]);
  db.uploadedSize.mockResolvedValue(1000);
  db.insertPolaroid.mockResolvedValue("new-id");
  db.deletePhotos.mockResolvedValue(undefined);
});

describe("postPolaroid cleans up after a refusal (D478)", () => {
  it("keeps the photo of a post that goes through", async () => {
    expect(await postPolaroid(ctx, input())).toEqual({ ok: true, id: "new-id" });
    expect(db.deletePhotos).not.toHaveBeenCalled();
  });

  it("deletes the upload when the message is refused", async () => {
    const r = await postPolaroid(ctx, input({ message: "a badword here" }));
    expect(r.ok).toBe(false);
    expect(db.deletePhotos).toHaveBeenCalledWith([path]);
  });

  it("deletes the upload when the stickers are refused", async () => {
    const r = await postPolaroid(ctx, input({ stickers: "not a list" }));
    expect(r.ok).toBe(false);
    expect(db.deletePhotos).toHaveBeenCalledWith([path]);
  });

  it("deletes the upload when the photo size is nonsense", async () => {
    const r = await postPolaroid(ctx, input({ width: 0 }));
    expect(r.ok).toBe(false);
    expect(db.deletePhotos).toHaveBeenCalledWith([path]);
  });

  it("deletes the upload when the poster must wait", async () => {
    db.recentPosts.mockResolvedValue([{ created_at: new Date().toISOString(), attendee_id: "att1", client_key: "ck", ip_hash: "ih" }]);
    const r = await postPolaroid(ctx, input());
    expect(r).toMatchObject({ ok: false, wait: expect.any(Number) });
    expect(db.deletePhotos).toHaveBeenCalledWith([path]);
  });

  it("deletes the upload when it is over the size limit", async () => {
    db.uploadedSize.mockResolvedValue(50 * 1024 * 1024);
    const r = await postPolaroid(ctx, input());
    expect(r.ok).toBe(false);
    expect(db.deletePhotos).toHaveBeenCalledWith([path]);
  });

  it("still returns the refusal when the delete itself fails", async () => {
    db.deletePhotos.mockRejectedValue(new Error("storage down"));
    const r = await postPolaroid(ctx, input({ message: "a badword here" }));
    expect(r.ok).toBe(false);
  });

  it("deletes nothing for a path that is not this activity's own", async () => {
    const r = await postPolaroid(ctx, input({ path: "o1/e1/other/3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b.jpg" }));
    expect(r.ok).toBe(false);
    expect(db.deletePhotos).not.toHaveBeenCalled();
  });

  it("leaves the file alone on a duplicate, because the live row it belongs to owns it", async () => {
    db.insertPolaroid.mockResolvedValue(null);
    const r = await postPolaroid(ctx, input());
    expect(r.ok).toBe(false);
    expect(db.deletePhotos).not.toHaveBeenCalled();
  });
});
