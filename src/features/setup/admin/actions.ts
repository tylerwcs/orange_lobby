"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { flashPath } from "@/lib/flash";
import { clearSetupToken, rotateSetupToken } from "../db";

const setupPath = (eventId: string) => `/admin/events/${eventId}/setup`;

async function event(eventId: string) {
  const { orgId } = await requireAdmin();
  return requireEvent(eventId, orgId);
}

export async function createSetupLinkAction(eventId: string) {
  const ev = await event(eventId);
  await rotateSetupToken(ev.id);
  revalidatePath(setupPath(ev.id));
  redirect(flashPath(setupPath(ev.id), "Setup link ready. Send it to the organiser."));
}

/** Replacing is the revocation (D108, D441): every copy of the old link stops working. */
export async function replaceSetupLinkAction(eventId: string) {
  const ev = await event(eventId);
  await rotateSetupToken(ev.id);
  revalidatePath(setupPath(ev.id));
  redirect(flashPath(setupPath(ev.id), "New setup link ready. The old one has stopped working."));
}

export async function turnOffSetupLinkAction(eventId: string) {
  const ev = await event(eventId);
  await clearSetupToken(ev.id);
  revalidatePath(setupPath(ev.id));
  redirect(flashPath(setupPath(ev.id), "Setup link turned off. What the organiser sent is kept."));
}
