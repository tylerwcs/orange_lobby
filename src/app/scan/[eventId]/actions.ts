"use server";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { findByToken, getAttendee, listAttendees, createAttendee } from "@/lib/db/attendees";
import { recordCheckin } from "@/lib/db/checkins";
import { extractToken, scanResultFields } from "@/lib/scan";
import type { Attendee } from "@/lib/types";

export type ScanResult = {
  status: "ok" | "duplicate" | "notfound" | "error";
  attendee?: Attendee; fields?: { label: string; value: string }[]; earlier?: { at: string }; message?: string;
};

async function doCheckin(eventId: string, checkpointId: string, attendee: Attendee): Promise<ScanResult> {
  const { orgId, userId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  if (ev.status === "archived") return { status: "error", message: "Event is archived" };
  const r = await recordCheckin(ev, checkpointId, attendee.id, userId);
  const fields = scanResultFields(attendee, ev);
  return r.created ? { status: "ok", attendee, fields } : { status: "duplicate", attendee, fields, earlier: { at: r.existing!.scanned_at } };
}

export async function checkInByTokenAction(eventId: string, checkpointId: string, scanned: string): Promise<ScanResult> {
  const token = extractToken(scanned);
  if (!token) return { status: "notfound", message: "Not an attendee QR" };
  const a = await findByToken(eventId, token);
  if (!a) return { status: "notfound", message: "QR not recognised for this event" };
  return doCheckin(eventId, checkpointId, a);
}

export async function checkInByIdAction(eventId: string, checkpointId: string, attendeeId: string): Promise<ScanResult> {
  const a = await getAttendee(attendeeId);
  if (!a || a.event_id !== eventId) return { status: "notfound", message: "Attendee not found" };
  return doCheckin(eventId, checkpointId, a);
}

export async function searchAttendeesAction(eventId: string, q: string): Promise<Pick<Attendee, "id" | "name" | "company" | "table_no">[]> {
  const { orgId } = await requireAdmin(); await requireEvent(eventId, orgId);
  if (q.trim().length < 2) return [];
  return (await listAttendees(eventId, q)).slice(0, 20).map((a) => ({ id: a.id, name: a.name, company: a.company, table_no: a.table_no }));
}

export async function walkInAction(eventId: string, checkpointId: string, formData: FormData): Promise<ScanResult> {
  const { orgId } = await requireAdmin(); const ev = await requireEvent(eventId, orgId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { status: "error", message: "Name required" };
  const a = await createAttendee(ev, { name, email: String(formData.get("email") ?? "").trim() || null, phone: String(formData.get("phone") ?? "").trim() || null, company: String(formData.get("company") ?? "").trim() || null }, "walkin");
  return doCheckin(eventId, checkpointId, a);
}
