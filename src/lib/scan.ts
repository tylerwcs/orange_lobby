import { isValidToken } from "@/lib/tokens";
import type { Attendee, Event } from "@/lib/types";
import { eventFields } from "@/lib/attendee-fields";
import { fieldValue } from "@/lib/attendee-values";

export function extractToken(scanned: string): string | null {
  const s = scanned.trim();
  if (isValidToken(s)) return s;
  const m = /\/a\/([a-z0-9]{12})(?:[/?#]|$)/.exec(s);
  return m && isValidToken(m[1]) ? m[1] : null;
}

/**
 * The lines on a crew member's card after a scan: the category, then whatever fields this
 * event chose to show.
 *
 * Company and Table used to be printed here by name. They are ordinary fields now, so an
 * event that wants them on the card names them in Settings — and migration 0014 seeded
 * exactly that for every event that showed them before.
 */
export function scanResultFields(a: Attendee, e: Pick<Event, "scan_extra_fields" | "attendee_fields" | "registration_questions">) {
  const fields = eventFields(e.registration_questions ?? [], e.attendee_fields ?? []);
  const out = [{ label: "Category", value: a.category ?? "" }];
  for (const name of e.scan_extra_fields) {
    // A configured name may be a field's key (what the picker stores) or its label (what
    // the old free-text box stored). Either must find the field, or the card shows a raw
    // slug like shirt_size to someone standing at a door.
    const field = fields.find((f) => f.key === name || f.label.toLowerCase() === name.toLowerCase());
    out.push({ label: field?.label ?? name, value: field ? fieldValue(a, field.key) : fieldValue(a, name) });
  }
  return out;
}

export type CameraProblem = { title: string; hint: string };

/** Turns a getUserMedia / html5-qrcode failure into words a crew member can act on. */
export function describeCameraError(e: unknown): CameraProblem {
  const name = typeof e === "object" && e !== null && "name" in e ? String((e as { name: unknown }).name) : "";
  const text = `${name} ${e instanceof Error ? e.message : typeof e === "string" ? e : ""}`;
  if (/NotAllowedError|PermissionDenied|denied/i.test(text)) {
    return { title: "Camera blocked", hint: "Allow camera access for this site in your browser's address-bar settings, then tap Retry. You can still search by name below." };
  }
  if (/NotFoundError|OverconstrainedError|DevicesNotFound/i.test(text)) {
    return { title: "No camera found", hint: "Use a phone with a rear camera, or search by name below." };
  }
  if (/NotReadableError|TrackStartError|in use/i.test(text)) {
    return { title: "Camera is in use", hint: "Close other apps using the camera, then tap Retry." };
  }
  if (/secure|https/i.test(text)) {
    return { title: "Camera needs a secure connection", hint: "Open the scanner from the https address, not http." };
  }
  return { title: "Camera unavailable", hint: "Tap Retry, or search by name below." };
}
