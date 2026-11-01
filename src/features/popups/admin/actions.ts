"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { flashPath } from "@/lib/flash";
import { isValidOrder } from "@/lib/agenda-placement";
import { sanitizeHtml } from "@/lib/sanitize";
import { toRichHtml } from "@/lib/rich-text";
import { listActivities } from "@/features/activities";
import { requireFeature } from "@/features/catalogue";
import type { Event } from "@/lib/types";
import { deleteEventImage, nextImage, type ImageChange } from "@/lib/db/media";
import { createPopup, deletePopup, listPopups, setPopupOn, setPopupOrder, updatePopup } from "../db";
import { readPopupForm } from "../rules";
import type { PopupInput } from "../types";

const back = (eventId: string) => `/admin/events/${eventId}/popups`;

/** The admin list, and every portal of the event: a popup switched on or off shows on the next open. */
function refresh(ev: Pick<Event, "id" | "slug">) {
  revalidatePath(back(ev.id));
  revalidatePath(`/e/${ev.slug}`, "layout");
}

/** The form, checked against this event's booking activities, with the message made safe to show. */
async function readForm(ev: Pick<Event, "id">, formData: FormData): Promise<PopupInput> {
  const bookingIds = (await listActivities(ev.id)).filter((a) => a.kind === "booking").map((a) => a.id);
  const read = readPopupForm(formData, bookingIds);
  if (!read.ok) redirect(flashPath(back(ev.id), read.error, "error"));
  const { message, ...rest } = read.input;
  return { ...rest, message_html: sanitizeHtml(toRichHtml(message)) };
}

/** D808: the picture the form asks for - a new upload, a removal, or the one it had. A bad file is the admin's flash. */
async function readImage(ev: Pick<Event, "id" | "org_id">, formData: FormData, current: string | null): Promise<ImageChange> {
  try {
    return await nextImage(formData, "image", current, { orgId: ev.org_id, eventId: ev.id, kind: "popup" });
  } catch (e) {
    redirect(flashPath(back(ev.id), (e as Error).message, "error"));
  }
}

export async function addPopupAction(eventId: string, formData: FormData) {
  const { ev } = await requireEventAccess(eventId);
  await requireFeature(ev.id, "popups", back(eventId));
  const input = await readForm(ev, formData);
  const image = await readImage(ev, formData, null);
  await createPopup(ev, { ...input, image_url: image.url });
  refresh(ev);
  redirect(flashPath(back(eventId), `“${input.heading}” created.`));
}

export async function updatePopupAction(eventId: string, popupId: string, formData: FormData) {
  const { ev } = await requireEventAccess(eventId);
  await requireFeature(ev.id, "popups", back(eventId));
  const input = await readForm(ev, formData);
  const current = (await listPopups(ev.id)).find((p) => p.id === popupId);
  if (!current) redirect(flashPath(back(eventId), "That popup no longer exists.", "error"));
  const image = await readImage(ev, formData, current.image_url);
  await updatePopup(popupId, ev.id, { ...input, image_url: image.url });
  // Only once the row names the new picture (or none) is the old one safe to throw away.
  await deleteEventImage(image.stale);
  refresh(ev);
  redirect(flashPath(back(eventId), `“${input.heading}” saved.`));
}

/** Takes the wanted state, not a flip, so a double click can't undo itself (as `toggleOpenAction`). */
export async function setPopupOnAction(eventId: string, popupId: string, on: boolean) {
  const { ev } = await requireEventAccess(eventId);
  await requireFeature(ev.id, "popups", back(eventId));
  await setPopupOn(popupId, ev.id, on);
  refresh(ev);
}

export async function deletePopupAction(eventId: string, popupId: string) {
  const { ev } = await requireEventAccess(eventId);
  await requireFeature(ev.id, "popups", back(eventId));
  await deleteEventImage(await deletePopup(popupId, ev.id));
  refresh(ev);
}

/** The order a drag or an arrow left them in. A list that is not exactly this event's popups is dropped. */
export async function reorderPopupsAction(eventId: string, ids: string[]) {
  const { ev } = await requireEventAccess(eventId);
  await requireFeature(ev.id, "popups", back(eventId));
  const current = (await listPopups(ev.id)).map((p) => p.id);
  if (current.length === 0 || !isValidOrder(current, ids)) return;
  await setPopupOrder(ev.id, ids);
  refresh(ev);
}
