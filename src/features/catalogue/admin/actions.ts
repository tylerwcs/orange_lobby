"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { flashPath } from "@/lib/flash";
import { FEATURES } from "../catalogue";
import { isStoredAddon } from "../features";
import { readCustomModule } from "../custom-modules";
import { setAddon, addCustomModule, updateCustomModule, removeCustomModule } from "../db";

const settingsPath = (eventId: string) => `/admin/events/${eventId}/settings`;

async function event(eventId: string) {
  const { orgId } = await requireAdmin();
  return requireEvent(eventId, orgId);
}

/**
 * Turn on from the "Not part of this event" panel returns to the page it was pressed on, and
 * the Features tab returns to Settings. Only a path inside this event is accepted, so a crafted
 * `back` can't send the admin anywhere else.
 */
function safeBack(eventId: string, back: string): string {
  const root = `/admin/events/${eventId}`;
  return back === root || back.startsWith(`${root}/`) ? back : settingsPath(eventId);
}

export async function setAddonAction(eventId: string, key: string, on: boolean, back: string) {
  const ev = await event(eventId);
  const to = safeBack(ev.id, back);
  if (!isStoredAddon(key)) redirect(flashPath(to, "That isn't an add-on.", "error"));
  await setAddon(ev.id, key, on);
  // The layout's sidebar reads the features too, so refresh the whole event.
  revalidatePath(`/admin/events/${ev.id}`, "layout");
  redirect(flashPath(to, on ? `${FEATURES[key].name} is on.` : `${FEATURES[key].name} is off. Nothing was deleted.`));
}

export async function addCustomModuleAction(eventId: string, fd: FormData) {
  const ev = await event(eventId);
  const read = readCustomModule(fd);
  if (!read.ok) redirect(flashPath(settingsPath(ev.id), read.error, "error"));
  await addCustomModule(ev, read.value);
  revalidatePath(settingsPath(ev.id));
  redirect(flashPath(settingsPath(ev.id), `${read.value.name} added.`));
}

export async function updateCustomModuleAction(eventId: string, moduleId: string, fd: FormData) {
  const ev = await event(eventId);
  const read = readCustomModule(fd);
  if (!read.ok) redirect(flashPath(settingsPath(ev.id), read.error, "error"));
  if (!(await updateCustomModule(ev.id, moduleId, read.value))) redirect(flashPath(settingsPath(ev.id), "That custom module no longer exists.", "error"));
  revalidatePath(settingsPath(ev.id));
  redirect(flashPath(settingsPath(ev.id), "Saved."));
}

export async function removeCustomModuleAction(eventId: string, moduleId: string) {
  const ev = await event(eventId);
  await removeCustomModule(ev.id, moduleId);
  revalidatePath(settingsPath(ev.id));
  redirect(flashPath(settingsPath(ev.id), "Custom module removed."));
}
