import type { AgendaDay, AgendaItem } from "@/lib/types";
import { agendaRows } from "@/lib/breakouts";
import { formatDateRange } from "@/lib/text";

/** A day of the programme as the organiser fills it in (D453). */
export type SetupDay = { id: string; date: string; name: string };
/**
 * A session as the organiser fills it in (D453): when, what and where. Who it's for, a photo,
 * breakout rounds and colours are the admin's, built from what the organiser sends.
 */
export type SetupSession = { id: string; day: string; starts_at: string; ends_at: string; title: string; location: string; description: string };
export type AgendaAnswers = { days: SetupDay[]; sessions: SetupSession[] };
/** Setup id → real row id (D454). */
export type AgendaMap = Record<string, string>;
/** The dates the days must fall within. Either end may be unknown. */
export type DateRange = { first: string | null; last: string | null };

export const MAX_DAYS = 14;
export const MAX_SESSIONS = 300;
/** Setup ids: uuids, and the live ids a form starts from. Never ".", which error keys use. */
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const DAY_LIMITS = { date: 10, name: 60 } as const;
const SESSION_LIMITS = { starts_at: 5, ends_at: 5, title: 160, location: 120, description: 2000 } as const;
export type SessionField = keyof typeof SESSION_LIMITS;
const SESSION_FIELDS = Object.keys(SESSION_LIMITS) as SessionField[];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isDate = (s: string) => DATE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export function blankAgenda(): AgendaAnswers {
  return { days: [], sessions: [] };
}

export function blankSession(id: string, day: string): SetupSession {
  return { id, day, starts_at: "", ends_at: "", title: "", location: "", description: "" };
}

const text = (v: unknown, max: number) => (typeof v === "string" || typeof v === "number" ? String(v).slice(0, max) : "");
const record = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/**
 * Whatever the browser sent, as answers: known fields only, each a string cut to its limit. Not
 * trimmed - this runs on every autosave, mid-typing. A repeated or malformed id is dropped, and so
 * is a session whose day isn't there.
 */
export function sanitizeAgenda(raw: unknown): AgendaAnswers {
  const out = blankAgenda();
  const o = record(raw);
  if (!o) return out;
  const seen = new Set<string>();
  const takeId = (v: unknown): string | null => {
    if (typeof v !== "string" || !ID.test(v) || seen.has(v)) return null;
    seen.add(v);
    return v;
  };
  for (const rawDay of Array.isArray(o.days) ? o.days.slice(0, MAX_DAYS) : []) {
    const r = record(rawDay);
    const id = r ? takeId(r.id) : null;
    if (!r || !id) continue;
    out.days.push({ id, date: text(r.date, DAY_LIMITS.date), name: text(r.name, DAY_LIMITS.name) });
  }
  const dayIds = new Set(out.days.map((d) => d.id));
  for (const rawSession of Array.isArray(o.sessions) ? o.sessions.slice(0, MAX_SESSIONS) : []) {
    const r = record(rawSession);
    if (!r || typeof r.day !== "string" || !dayIds.has(r.day)) continue;
    const id = takeId(r.id);
    if (!id) continue;
    const s = blankSession(id, r.day);
    for (const f of SESSION_FIELDS) s[f] = text(r[f], SESSION_LIMITS[f]);
    out.sessions.push(s);
  }
  return out;
}

/** A live session as an answer. Review and Apply compare against the live agenda in this form. */
export function sessionFromItem(i: AgendaItem): SetupSession {
  return {
    id: i.id, day: i.day_id ?? "", starts_at: i.starts_at ?? "", ends_at: i.ends_at ?? "",
    title: i.title, location: i.location ?? "", description: i.description ?? "",
  };
}

/**
 * The live agenda as answers, and the map tying each answer to its row (D454): what an organiser
 * opening Agenda for the first time starts from. Days and sessions keep their real ids, so the
 * map is the identity. Image rows and breakout rounds are the admin's (D453): left out, never touched.
 */
export function agendaFromLive(days: AgendaDay[], items: AgendaItem[]): { answers: AgendaAnswers; map: AgendaMap } {
  const answers = blankAgenda();
  const map: AgendaMap = {};
  for (const d of days) {
    answers.days.push({ id: d.id, date: d.date, name: d.name ?? "" });
    map[d.id] = d.id;
  }
  const known = new Set(days.map((d) => d.id));
  for (const row of agendaRows(items)) {
    if (row.kind !== "item") continue;
    const i = row.item;
    if (i.kind !== "session" || !i.day_id || !known.has(i.day_id)) continue;
    answers.sessions.push(sessionFromItem(i));
    map[i.id] = i.id;
  }
  return { answers, map };
}

/**
 * The starting point limited to what the organiser's form showed (`ids`, D454): anything the
 * admin added after the page opened stays out, so Apply never reads it as removed.
 */
export function restrictSeed(seed: { answers: AgendaAnswers; map: AgendaMap }, ids: readonly string[]): { answers: AgendaAnswers; map: AgendaMap } {
  const keep = new Set(ids);
  const days = seed.answers.days.filter((d) => keep.has(d.id));
  const dayIds = new Set(days.map((d) => d.id));
  const sessions = seed.answers.sessions.filter((s) => keep.has(s.id) && dayIds.has(s.day));
  const kept = new Set([...dayIds, ...sessions.map((s) => s.id)]);
  return { answers: { days, sessions }, map: Object.fromEntries(Object.entries(seed.map).filter(([k]) => kept.has(k))) };
}

/** Every id the answers hold: what the form started from, sent with the first save. */
export function seedIdsOf(a: AgendaAnswers): string[] {
  return [...a.days.map((d) => d.id), ...a.sessions.map((s) => s.id)];
}

/**
 * The dates days are checked against (D457): the organiser's own Basics dates when both are
 * dates, else the live event's. Apply passes the live event's alone.
 */
export function agendaRange(basics: { starts_on: string; ends_on: string } | null, ev: { starts_on: string | null; ends_on: string | null }): DateRange {
  const first = basics?.starts_on.trim() ?? "";
  const last = basics?.ends_on.trim() ?? "";
  if (isDate(first) && isDate(last)) return { first, last };
  return { first: ev.starts_on, last: ev.ends_on };
}

export const errorKey = (id: string, field: string) => `${id}.${field}`;
export const dayName = (d: SetupDay, index: number) => d.name.trim() || `Day ${index + 1}`;

/** Values that are wrong, keyed `<id>.<field>`. Empty fields are `agendaMissing`'s business. */
export function agendaErrors(a: AgendaAnswers, range: DateRange): Record<string, string> {
  const e: Record<string, string> = {};
  const dates = new Map<string, number>();
  for (const d of a.days) {
    const t = d.date.trim();
    if (t) dates.set(t, (dates.get(t) ?? 0) + 1);
  }
  for (const d of a.days) {
    const t = d.date.trim();
    if (!t) continue;
    if (!isDate(t)) e[errorKey(d.id, "date")] = "Pick a date.";
    else if ((dates.get(t) ?? 0) > 1) e[errorKey(d.id, "date")] = "Another day already has this date.";
    else if ((range.first && t < range.first) || (range.last && t > range.last)) {
      e[errorKey(d.id, "date")] = `Outside the event dates (${formatDateRange(range.first, range.last)}).`;
    }
  }
  for (const s of a.sessions) {
    const start = s.starts_at.trim();
    const end = s.ends_at.trim();
    if (start && !TIME.test(start)) e[errorKey(s.id, "starts_at")] = "Use a time like 09:30.";
    if (end && !TIME.test(end)) e[errorKey(s.id, "ends_at")] = "Use a time like 10:30.";
    else if (end && TIME.test(start) && end <= start) e[errorKey(s.id, "ends_at")] = "The end must be after the start.";
  }
  return e;
}

/** What still has to be filled in before Submit, as sentences the organiser reads. */
export function agendaMissing(a: AgendaAnswers): string[] {
  if (a.days.length === 0) return ["Add at least one day."];
  const out: string[] = [];
  a.days.forEach((d, n) => {
    const label = dayName(d, n);
    if (!d.date.trim()) out.push(`${label} needs a date.`);
    const mine = a.sessions.filter((s) => s.day === d.id);
    if (mine.length === 0) out.push(`${label} has no sessions yet.`);
    for (const s of mine) {
      if (!s.starts_at.trim()) out.push(`${label}: ${s.title.trim() || "a session"} needs a start time.`);
      if (!s.title.trim()) out.push(`${label}: a session needs a title.`);
    }
  });
  return out;
}

/** Everything stopping Submit or Apply, each naming where it is: "Day 2: Keynote: The end must be after the start." */
export function agendaProblems(a: AgendaAnswers, range: DateRange): string[] {
  const where = new Map<string, string>();
  a.days.forEach((d, n) => where.set(d.id, dayName(d, n)));
  for (const s of a.sessions) where.set(s.id, `${where.get(s.day)}: ${s.title.trim() || "a session"}`);
  const errors = Object.entries(agendaErrors(a, range)).map(([k, m]) => `${where.get(k.split(".")[0]) ?? "Agenda"}: ${m}`);
  return [...agendaMissing(a), ...errors];
}

export type PreviewAgenda = { days: { id: string; date: string; name: string | null }[]; items: AgendaItem[] };

/** The answers as the portal agenda shows them (D445, D456): days with a usable date, each day in time order (ties keep the form's order). */
export function previewAgenda(a: AgendaAnswers): PreviewAgenda {
  const days = a.days
    .filter((d) => isDate(d.date.trim()))
    .map((d) => ({ id: d.id, date: d.date.trim(), name: d.name.trim() || null }))
    .sort((x, y) => x.date.localeCompare(y.date));
  const dateOf = new Map(days.map((d) => [d.id, d.date]));
  const items: AgendaItem[] = [];
  a.sessions.forEach((s, n) => {
    const date = dateOf.get(s.day);
    if (!date) return;
    items.push({
      id: s.id, event_id: "", day_id: s.day, day: date, kind: "session",
      starts_at: TIME.test(s.starts_at.trim()) ? s.starts_at.trim() : "--:--",
      ends_at: TIME.test(s.ends_at.trim()) ? s.ends_at.trim() : null,
      title: s.title.trim() || "Untitled session",
      description: s.description.trim() || null,
      location: s.location.trim() || null,
      categories: null, slot: null, code: null, color: null, image_url: null,
      sort_order: n,
    });
  });
  items.sort((x, y) => x.day.localeCompare(y.day) || (x.starts_at ?? "").localeCompare(y.starts_at ?? "") || x.sort_order - y.sort_order);
  return { days, items };
}
