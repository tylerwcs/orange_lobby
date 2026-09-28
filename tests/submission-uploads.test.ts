import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RegistrationQuestion } from "@/lib/types";

vi.mock("server-only", () => ({}));

const storage = vi.hoisted(() => ({ next: 0, failFor: null as string | null, deleted: [] as string[][], deleteThrows: false }));
vi.mock("@/lib/db/media", () => ({
  uploadSubmissionFile: async (input: { orgId: string; eventId: string; formId: string; file: File }) => {
    if (input.file.name === storage.failFor) throw new Error("Could not upload that file. Try again.");
    storage.next += 1;
    return `${input.orgId}/${input.eventId}/${input.formId}/submission-${storage.next}.png`;
  },
  deleteSubmissionFiles: async (paths: string[]) => {
    if (paths.length > 0) storage.deleted.push(paths);
    if (storage.deleteThrows) throw new Error("storage down");
  },
}));

const { readAnswers, saveOrDiscard, replacedFiles, deleteReplacedFiles } = await import("@/lib/submission-uploads");

const FOLDER = "org1/ev1/act1/";
const questions: RegistrationQuestion[] = [
  { key: "note", label: "Note", type: "text", required: true },
  { key: "kind", label: "Kind", type: "select", required: false, options: ["Photo", "None"] },
  { key: "photo", label: "Photo", type: "file", required: false, show_when: { key: "kind", includes: "Photo" } },
  { key: "receipt", label: "Receipt", type: "file", required: false },
];
const activity = { id: "act1", org_id: "org1", event_id: "ev1", questions };

const png = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
function form(fields: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  storage.next = 0;
  storage.failFor = null;
  storage.deleted = [];
  storage.deleteThrows = false;
});

describe("readAnswers", () => {
  it("uploads each posted file and stores its path, with typed answers as posted", async () => {
    const r = await readAnswers(activity, form({ note: "Hi", kind: "Photo", photo: png("a.png"), receipt: png("b.png") }));
    expect(r).toEqual({
      ok: true,
      answers: { note: "Hi", kind: "Photo", photo: `${FOLDER}submission-1.png`, receipt: `${FOLDER}submission-2.png` },
      uploaded: [`${FOLDER}submission-1.png`, `${FOLDER}submission-2.png`],
    });
  });

  it("keeps a stored file when none is posted, and never counts it as this request's upload", async () => {
    const stored = { note: "Old", kind: "Photo", photo: `${FOLDER}submission-old.png`, receipt: "" };
    const r = await readAnswers(activity, form({ note: "New", kind: "Photo", receipt: png("r.png") }), stored);
    expect(r).toEqual({
      ok: true,
      answers: { note: "New", kind: "Photo", photo: `${FOLDER}submission-old.png`, receipt: `${FOLDER}submission-1.png` },
      uploaded: [`${FOLDER}submission-1.png`],
    });
  });

  it("does not upload a file posted for a question its show_when hides", async () => {
    const r = await readAnswers(activity, form({ note: "Hi", kind: "None", photo: png("a.png") }));
    expect(r).toEqual({ ok: true, answers: { note: "Hi", kind: "None", photo: "", receipt: "" }, uploaded: [] });
    expect(storage.next).toBe(0);
  });

  it("discards the uploads that landed when another one fails, and says why", async () => {
    storage.failFor = "bad.png";
    const r = await readAnswers(activity, form({ note: "Hi", kind: "Photo", photo: png("good.png"), receipt: png("bad.png") }));
    expect(r).toEqual({ ok: false, error: "Could not upload that file. Try again." });
    expect(storage.deleted).toEqual([[`${FOLDER}submission-1.png`]]);
  });

  it("discards this request's uploads when validation refuses, never a stored file", async () => {
    const stored = { note: "Old", kind: "Photo", photo: `${FOLDER}submission-old.png`, receipt: "" };
    const r = await readAnswers(activity, form({ note: "", kind: "Photo", receipt: png("r.png") }), stored);
    expect(r).toEqual({ ok: false, error: "Note is required" });
    expect(storage.deleted).toEqual([[`${FOLDER}submission-1.png`]]);
  });
});

describe("saveOrDiscard", () => {
  it("hands back what the write returned and deletes nothing", async () => {
    await expect(saveOrDiscard([`${FOLDER}submission-1.png`], async () => "ok")).resolves.toBe("ok");
    expect(storage.deleted).toEqual([]);
  });

  it("discards the uploads and re-raises when the write throws", async () => {
    const boom = new Error("database down");
    await expect(saveOrDiscard([`${FOLDER}submission-1.png`], async () => { throw boom; })).rejects.toBe(boom);
    expect(storage.deleted).toEqual([[`${FOLDER}submission-1.png`]]);
  });
});

describe("replacedFiles", () => {
  it("names a file question's old path the saved answers no longer hold", () => {
    const before = { photo: `${FOLDER}submission-old.png`, receipt: `${FOLDER}submission-keep.png` };
    const after = { photo: `${FOLDER}submission-new.png`, receipt: `${FOLDER}submission-keep.png` };
    expect(replacedFiles(activity, before, after)).toEqual([`${FOLDER}submission-old.png`]);
  });

  it("names a file that was cleared, but nothing that was empty", () => {
    expect(replacedFiles(activity, { photo: `${FOLDER}submission-old.png`, receipt: "" }, { photo: "", receipt: "" }))
      .toEqual([`${FOLDER}submission-old.png`]);
  });

  it("never names anything outside this activity's own folder", () => {
    const before = {
      photo: "org1/ev1/act2/submission-other.png",
      receipt: "org2/ev1/act1/submission-x.png",
    };
    expect(replacedFiles(activity, before, { photo: "", receipt: "" })).toEqual([]);
    expect(replacedFiles(activity, { photo: `${FOLDER}nested/submission-x.png` }, {})).toEqual([]);
    expect(replacedFiles(activity, { photo: FOLDER }, {})).toEqual([]);
    expect(replacedFiles(activity, { photo: "typed text" }, {})).toEqual([]);
  });

  it("ignores answers that are not file questions", () => {
    expect(replacedFiles(activity, { note: `${FOLDER}submission-looks-like.png` }, { note: "" })).toEqual([]);
  });
});

describe("deleteReplacedFiles", () => {
  it("swallows a storage failure: the answers are already saved", async () => {
    storage.deleteThrows = true;
    await expect(deleteReplacedFiles(activity, { photo: `${FOLDER}submission-old.png` }, { photo: "" })).resolves.toBeUndefined();
    expect(storage.deleted).toEqual([[`${FOLDER}submission-old.png`]]);
  });
});
