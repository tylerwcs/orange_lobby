import "server-only";
import { notFound } from "next/navigation";
import { getEventBySlug } from "@/lib/db/events";
import { findByToken } from "@/lib/db/attendees";
import { isValidToken } from "@/lib/tokens";
import type { Attendee, Event } from "@/lib/types";

export async function loadPortalEvent(slug: string): Promise<Event> {
  const ev = await getEventBySlug(slug);
  if (!ev) notFound();
  return ev;
}
export async function loadPortalAttendee(slug: string, token: string): Promise<{ event: Event; attendee: Attendee }> {
  const event = await loadPortalEvent(slug);
  if (!isValidToken(token)) notFound();
  const attendee = await findByToken(event.id, token);
  if (!attendee) notFound();
  return { event, attendee };
}
