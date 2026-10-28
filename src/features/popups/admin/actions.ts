"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { flashPath } from "@/lib/flash";
import { isValidOrder } from "@/lib/agenda-placement";
import { sanitizeHtml } from "@/lib/sanitize";
import { toRichHtml } from "@/lib/rich-text";
import { listActivities } from "@/features/activities";
import type { Event } from "@/lib/types";
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

export async function addPopupAction(eventId: string, formData: FormData) {
  const { ev } = await requireEventAccess(eventId);
  const input = await readForm(ev, formData);
  await createPopup(ev, input);
  refresh(ev);
  redirect(flashPath(back(eventId), `“${input.heading}” created.`));
}

export async function updatePopupAction(eventId: string, popupId: string, formData: FormData) {
  const { ev } = await requireEventAccess(eventId);
  const input = await readForm(ev, formData);
  await updatePopup(popupId, ev.id, input);
  refresh(ev);
  redirect(flashPath(back(eventId), `“${input.heading}” saved.`));
}

/** Takes the wanted state, not a flip, so a double click can't undo itself (as `toggleOpenAction`). */
export async function setPopupOnAction(eventId: string, popupId: string, on: boolean) {
  const { ev } = await requireEventAccess(eventId);
  await setPopupOn(popupId, ev.id, on);
  refresh(ev);
}

export async function deletePopupAction(eventId: string, popupId: string) {
  const { ev } = await requireEventAccess(eventId);
  await deletePopup(popupId, ev.id);
  refresh(ev);
}

/** The order a drag or an arrow left them in. A list that is not exactly this event's popups is dropped. */
export async function reorderPopupsAction(eventId: string, ids: string[]) {
  const { ev } = await requireEventAccess(eventId);
  const current = (await listPopups(ev.id)).map((p) => p.id);
  if (current.length === 0 || !isValidOrder(current, ids)) return;
  await setPopupOrder(ev.id, ids);
  refresh(ev);
}
