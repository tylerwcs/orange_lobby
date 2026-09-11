import { isValidToken } from "@/lib/tokens";
import type { Attendee, Event } from "@/lib/types";

export function extractToken(scanned: string): string | null {
  const s = scanned.trim();
  if (isValidToken(s)) return s;
  const m = /\/a\/([a-z0-9]{12})(?:[/?#]|$)/.exec(s);
  return m && isValidToken(m[1]) ? m[1] : null;
}

export function scanResultFields(a: Attendee, e: Pick<Event, "scan_extra_fields">) {
  const out = [
    { label: "Company", value: a.company ?? "" }, { label: "Category", value: a.category ?? "" },
    { label: "Table", value: a.table_no ?? "" },
  ];
  for (const key of e.scan_extra_fields) {
    const direct = (a as unknown as Record<string, unknown>)[key];
    const value = typeof direct === "string" ? direct : a.extra[key] ?? "";
    out.push({ label: key, value });
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
