"use server";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { findByToken, getAttendee, listAttendees, createAttendee, upsertByEmail, type AttendeeInput } from "@/lib/db/attendees";
import { recordCheckin } from "@/lib/db/checkins";
import { getCheckpoint } from "@/lib/db/checkpoints";
import { extractToken, scanResultFields } from "@/lib/scan";
import type { Attendee, Event } from "@/lib/types";

export type ScanResult = {
  status: "ok" | "duplicate" | "notfound" | "error";
  attendee?: Attendee; fields?: { label: string; value: string }[]; earlier?: { at: string }; message?: string;
};

async function authorise(eventId: string): Promise<{ ev: Event; userId: string }> {
  const { orgId, userId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  return { ev, userId };
}

async function doCheckin(ev: Event, userId: string, checkpointId: string, attendee: Attendee): Promise<ScanResult> {
  if (ev.status === "archived") return { status: "error", message: "Event is archived" };
  const checkpoint = await getCheckpoint(checkpointId, ev.id);
  if (!checkpoint) return { status: "error", message: "Checkpoint not found for this event" };
  const r = await recordCheckin(ev, checkpointId, attendee.id, userId);
  const fields = scanResultFields(attendee, ev);
  return r.created ? { status: "ok", attendee, fields } : { status: "duplicate", attendee, fields, earlier: { at: r.existing!.scanned_at } };
}

export async function checkInByTokenAction(eventId: string, checkpointId: string, scanned: string): Promise<ScanResult> {
  const { ev, userId } = await authorise(eventId);
  const token = extractToken(scanned);
  if (!token) return { status: "notfound", message: "Not an attendee QR" };
  const a = await findByToken(eventId, token);
  if (!a) return { status: "notfound", message: "QR not recognised for this event" };
  return doCheckin(ev, userId, checkpointId, a);
}

export async function checkInByIdAction(eventId: string, checkpointId: string, attendeeId: string): Promise<ScanResult> {
  const { ev, userId } = await authorise(eventId);
  const a = await getAttendee(attendeeId);
  if (!a || a.event_id !== eventId) return { status: "notfound", message: "Attendee not found" };
  return doCheckin(ev, userId, checkpointId, a);
}

export async function searchAttendeesAction(eventId: string, q: string): Promise<Pick<Attendee, "id" | "name" | "company" | "table_no">[]> {
  await authorise(eventId);
  if (q.trim().length < 2) return [];
  return (await listAttendees(eventId, q)).slice(0, 20).map((a) => ({ id: a.id, name: a.name, company: a.company, table_no: a.table_no }));
}

export async function walkInAction(eventId: string, checkpointId: string, formData: FormData): Promise<ScanResult> {
  const { ev, userId } = await authorise(eventId);
  if (ev.status === "archived") return { status: "error", message: "Event is archived" };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { status: "error", message: "Name required" };
  const field = (k: string) => String(formData.get(k) ?? "").trim() || undefined;
  const email = field("email");
  // Blank fields are omitted so an upsert onto an imported row never nulls what the masterlist had.
  const input: AttendeeInput = { name, phone: field("phone"), company: field("company") };
  // A walk-in whose email is already on the masterlist must update that row, not collide with it.
  const a = email ? (await upsertByEmail(ev, { ...input, email }, "walkin")).attendee : await createAttendee(ev, input, "walkin");
  return doCheckin(ev, userId, checkpointId, a);
}
