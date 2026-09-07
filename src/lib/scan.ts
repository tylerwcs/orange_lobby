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
    { label: "Table", value: a.table_no ? `${a.table_no}${a.seat_no ? ` / ${a.seat_no}` : ""}` : "" },
  ];
  for (const key of e.scan_extra_fields) {
    const direct = (a as unknown as Record<string, unknown>)[key];
    const value = typeof direct === "string" ? direct : a.extra[key] ?? "";
    out.push({ label: key, value });
  }
  return out;
}
