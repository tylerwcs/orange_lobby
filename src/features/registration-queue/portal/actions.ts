"use server";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getEventBySlug } from "@/lib/db/events";
import { isValidToken } from "@/lib/tokens";
import { allow } from "@/lib/ratelimit";
import { flashPath } from "@/lib/flash";
import { findEntryByToken, leaveEntry } from "../db";
import { notifyRegistered } from "../notify";

/**
 * D681, D697: the person takes themselves off the waiting list, or withdraws a pending
 * registration, from their own link. The token is the authority; it takes effect at once.
 * Withdrawing a pending one frees a place, which `leave_entry` fills in the same transaction
 * (D682); anyone that moved straight into registered gets the D684 message. A message problem
 * never undoes the leave or stops the redirect.
 */
export async function leaveQueueAction(slug: string, token: string): Promise<void> {
  const base = `/e/${slug}/a/${token}`;
  // Not loadPortalEvent: @/lib/portal reads entries through this feature, and the cycle is not worth it.
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  if (!isValidToken(token)) redirect(base);
  if (!allow(`leave:${token}`, 5, 60_000)) redirect(flashPath(base, "Too many attempts. Try again in a minute.", "error"));
  const entry = await findEntryByToken(event.id, token);
  // Already gone (left in another tab, moved in, declined): the page itself now says where they stand.
  if (!entry || (entry.state !== "waiting" && entry.state !== "pending")) {
    revalidatePath(base, "layout");
    redirect(flashPath(base, "There's nothing to leave.", "error"));
  }
  const moved = await leaveEntry(event.id, token);
  try {
    await notifyRegistered(event, moved, "moved_in");
  } catch {
    // notifyRegistered does not throw; this only keeps a surprise there from failing the leave.
  }
  revalidatePath(base, "layout");
  redirect(flashPath(base, entry.state === "waiting" ? "You've left the waiting list." : "Registration withdrawn."));
}
