"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent, updateEvent } from "@/lib/db/events";
import { createBooth, updateBooth, setBoothOrder, deleteBoothIfUnstamped, listBooths } from "@/lib/db/booths";
import { flashPath } from "@/lib/flash";

async function event(eventId: string) {
  const { orgId } = await requireAdmin();
  return requireEvent(eventId, orgId);
}

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

export async function addBoothAction(eventId: string, fd: FormData) {
  const ev = await event(eventId);
  const name = text(fd, "name");
  if (!name) throw new Error("A booth needs a name");
  await createBooth(ev, name, text(fd, "location") || null);
  revalidatePath(`/admin/events/${eventId}/booths`);
}

export async function renameBoothAction(eventId: string, boothId: string, fd: FormData) {
  const ev = await event(eventId);
  const name = text(fd, "name");
  if (!name) throw new Error("A booth needs a name");
  await updateBooth(boothId, ev.id, { name, location: text(fd, "location") || null });
  revalidatePath(`/admin/events/${eventId}/booths`);
}

export async function reorderBoothsAction(eventId: string, ids: string[]) {
  const ev = await event(eventId);
  await setBoothOrder(ev.id, ids);
  revalidatePath(`/admin/events/${eventId}/booths`);
}

/**
 * Checked again in the database (D94). The button is disabled once a booth has stamps, but a
 * second tab opened before the first stamp still has a live one.
 */
export async function deleteBoothAction(eventId: string, boothId: string) {
  const ev = await event(eventId);
  const removed = await deleteBoothIfUnstamped(boothId, ev.id);
  revalidatePath(`/admin/events/${eventId}/booths`);
  redirect(removed
    ? flashPath(`/admin/events/${eventId}/booths`, "Booth deleted.")
    : flashPath(`/admin/events/${eventId}/booths`, "That booth has stamped somebody, so it can't be deleted. Rename it, or lower the stamps needed.", "error"));
}

/**
 * The target and the message (D95, D96). An empty target is stored as null, which the portal
 * reads as "every booth" — so clearing the box is a meaningful answer, not a validation error.
 */
export async function savePassportAction(eventId: string, fd: FormData) {
  const ev = await event(eventId);
  const path = `/admin/events/${eventId}/booths`;
  const raw = text(fd, "stamps_required");
  const parsed = raw === "" ? null : Number.parseInt(raw, 10);
  if (parsed !== null && (!Number.isFinite(parsed) || parsed < 1)) {
    redirect(flashPath(path, "Stamps needed must be a whole number, or blank for every booth.", "error"));
  }
  const booths = await listBooths(ev.id);
  if (parsed !== null && parsed > booths.length) {
    redirect(flashPath(path, `This event has ${booths.length} booths, so the target cannot be ${parsed}.`, "error"));
  }
  await updateEvent(ev.id, { stamps_required: parsed, stamps_message: text(fd, "stamps_message") || null });
  revalidatePath(path);
  redirect(flashPath(path, "Passport saved."));
}
