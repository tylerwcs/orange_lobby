import "server-only";
import { getEvent } from "@/lib/db/events";
import { entryNames, fillFreePlaces, type Moved } from "../db";
import { notifyRegistered } from "../notify";
import { movedFlash, whatsappNote, type NotifyResult } from "../lib/rules";

/**
 * The flash line for rows a fill, Move in or Decline moved: who went where (one person by name,
 * several by count), then what WhatsApp did for the ones now registered. Only a group of one
 * needs its name, so at most two are read.
 */
export async function movedLine(moved: Moved[], sent: NotifyResult): Promise<string> {
  if (moved.length === 0) return "";
  const single = (["registered", "pending"] as const).flatMap((s) => {
    const rows = moved.filter((m) => m.newState === s);
    return rows.length === 1 ? [rows[0].entryId] : [];
  });
  const names = await entryNames(single);
  return [movedFlash(moved.map((m) => ({ name: names.get(m.entryId) ?? "", newState: m.newState }))), whatsappNote(sent)]
    .filter(Boolean).join(" ");
}

/**
 * D682, D691: call after anything that may have freed a counted place, raised or cleared the
 * limit, or reopened registration. Moves the waiting list along (`fill_free_places`, which does
 * nothing while registration is closed, D683), WhatsApps whoever became registered (D684), and
 * returns a line to append to the action's flash ("" when nobody moved).
 *
 * Not a server action: it lives outside a "use server" file so it cannot be called from the
 * browser with an event id of the caller's choosing. It reloads the event so a Settings save
 * that renamed it messages under the new name. Never throws: the organiser's own change has
 * already been saved, and the next trigger fills whatever this one could not.
 */
export async function afterPlacesChange(eventId: string): Promise<string> {
  try {
    const ev = await getEvent(eventId);
    if (!ev) return "";
    const moved = await fillFreePlaces(ev.id);
    if (moved.length === 0) return "";
    const sent = await notifyRegistered(ev, moved, "moved_in");
    return await movedLine(moved, sent);
  } catch (e) {
    console.error("afterPlacesChange failed", e);
    return "The waiting list could not be moved along just now; it moves at the next change.";
  }
}
