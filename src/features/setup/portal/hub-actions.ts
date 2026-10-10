"use server";
import { revalidatePath } from "next/cache";
import type { Event } from "@/lib/types";
import { eventChecklist, getSetupFile, listSetupFiles, recordSetupFile, removeSetupFile, saveSetupNote, setupFileUrl, startSetupUpload } from "../db";
import { acceptSetupFile, cleanFileName, contentTypeFor, MAX_FILES_PER_ITEM, NOTE_MAX, toHubFile, type HubFile } from "../hub";
import { loadByToken } from "./load";

type Fail = { ok: false; message: string };
const fail = (message: string): Fail => ({ ok: false, message });
const NO_ITEM = "That item isn't on this event's checklist.";

/** Cards and the Agenda step take files and a note (D458). The key must be on this event's checklist. */
async function itemOf(token: string, itemKey: unknown): Promise<{ ok: true; ev: Event; key: string } | Fail> {
  const loaded = await loadByToken(token);
  if (!loaded.ok) return fail(loaded.message);
  if (typeof itemKey !== "string") return fail(NO_ITEM);
  const entry = (await eventChecklist(loaded.ev)).find((e) => e.key === itemKey);
  if (!entry || (entry.kind === "step" && entry.key !== "agenda")) return fail(NO_ITEM);
  return { ok: true, ev: loaded.ev, key: itemKey };
}

/** The admin's badge reads these rows. */
const changed = (ev: Event) => revalidatePath(`/admin/events/${ev.id}`, "layout");

/** Step 1 of an upload (D459): checks the file, then mints its path and a signed upload for it. */
export async function startSetupUploadAction(token: string, itemKey: string, file: { name: string; size: number }): Promise<{ ok: true; path: string; uploadToken: string; contentType: string } | Fail> {
  const item = await itemOf(token, itemKey);
  if (!item.ok) return item;
  const accepted = acceptSetupFile({ name: typeof file?.name === "string" ? file.name : "", size: Number(file?.size) || 0 });
  if (!accepted.ok) return fail(accepted.message);
  const have = (await listSetupFiles(item.ev.id)).filter((f) => f.item_key === item.key).length;
  if (have >= MAX_FILES_PER_ITEM) return fail(`Up to ${MAX_FILES_PER_ITEM} files per item. Remove one first.`);
  try {
    const s = await startSetupUpload(item.ev.org_id, item.ev.id, accepted.ext);
    return { ok: true, path: s.path, uploadToken: s.token, contentType: accepted.contentType };
  } catch (e) {
    return fail((e as Error).message);
  }
}

/** Step 3 of an upload: records the file once the browser has put it in the bucket. */
export async function finishSetupUploadAction(token: string, itemKey: string, path: string, name: string): Promise<{ ok: true; file: HubFile } | Fail> {
  const item = await itemOf(token, itemKey);
  if (!item.ok) return item;
  const contentType = typeof path === "string" ? contentTypeFor(path) : null;
  try {
    const row = contentType ? await recordSetupFile(item.ev, item.key, path, cleanFileName(String(name ?? "")), contentType) : null;
    if (!row) return fail("We couldn't find that upload. Try again.");
    changed(item.ev);
    return { ok: true, file: toHubFile(row) };
  } catch {
    return fail("We couldn't record that upload. Try again.");
  }
}

export async function removeSetupFileAction(token: string, fileId: string): Promise<{ ok: true } | Fail> {
  const loaded = await loadByToken(token);
  if (!loaded.ok) return fail(loaded.message);
  try {
    if (!(await removeSetupFile(loaded.ev.id, fileId))) return fail("That file has already gone.");
  } catch {
    return fail("We couldn't remove that file. Try again.");
  }
  changed(loaded.ev);
  return { ok: true };
}

/** A one-minute link to download a file this event's organiser sent. */
export async function setupFileLinkAction(token: string, fileId: string): Promise<{ ok: true; url: string } | Fail> {
  const loaded = await loadByToken(token);
  if (!loaded.ok) return fail(loaded.message);
  try {
    const f = await getSetupFile(loaded.ev.id, fileId);
    const url = f ? await setupFileUrl(f) : null;
    return url ? { ok: true, url } : fail("That file has already gone.");
  } catch {
    return fail("We couldn't open that file. Try again.");
  }
}

/** The note as typed, cut to its limit; the last save wins (D458). */
export async function saveSetupNoteAction(token: string, itemKey: string, notes: string): Promise<{ ok: true } | Fail> {
  const item = await itemOf(token, itemKey);
  if (!item.ok) return item;
  try {
    await saveSetupNote(item.ev.id, item.key, String(notes ?? "").slice(0, NOTE_MAX));
  } catch {
    return fail("We couldn't save your note. Try again.");
  }
  changed(item.ev);
  return { ok: true };
}
