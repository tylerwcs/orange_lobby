import type { Event } from "@/lib/types";
import { toE164My } from "@/lib/phone";

export const BASICS_FIELDS = [
  "name", "starts_on", "ends_on", "venue_name", "primary_color", "logo_url", "banner_url",
  "categories", "committee_numbers", "notes",
] as const;
export type BasicsField = (typeof BASICS_FIELDS)[number];
export type BasicsAnswers = Record<BasicsField, string>;

export const DEFAULT_COLOUR = "#F97316";
export const BASICS_IMAGE_FIELDS = ["logo_url", "banner_url"] as const;
export const BASICS_REQUIRED: readonly BasicsField[] = ["name", "starts_on", "ends_on", "venue_name"];

const LIMITS: Record<BasicsField, number> = {
  name: 120, starts_on: 10, ends_on: 10, venue_name: 160, primary_color: 7, logo_url: 600, banner_url: 600,
  categories: 1000, committee_numbers: 600, notes: 2000,
};

export const BASICS_LABELS: Record<BasicsField, string> = {
  name: "Event name", starts_on: "First day", ends_on: "Last day", venue_name: "Venue",
  primary_color: "Brand colour", logo_url: "Logo", banner_url: "Home banner",
  categories: "Attendee categories",
  committee_numbers: "Committee WhatsApp numbers", notes: "Notes",
};

/** Shown in review but never written to the event (D450). */
const INFO_ONLY: readonly BasicsField[] = ["categories", "notes"];

export type BasicsSource = Pick<Event,
  "name" | "starts_on" | "ends_on" | "venue_name" | "primary_color" | "logo_url" | "banner_url" | "committee_alert_numbers">;

export function blankBasics(): BasicsAnswers {
  const a = Object.fromEntries(BASICS_FIELDS.map((f) => [f, ""])) as BasicsAnswers;
  a.primary_color = DEFAULT_COLOUR;
  return a;
}

/**
 * A full colour as "#RRGGBB", so "#f97316" and "#F97316" are the same answer (the colour picker
 * sends lowercase). Anything else, such as a half-typed value, is left as it is.
 */
export function normaliseColour(s: string): string {
  const t = s.trim();
  return /^#[0-9a-fA-F]{6}$/.test(t) ? t.toUpperCase() : s;
}

/** The live event as answers: what an organiser opening Basics for the first time starts from. */
export function basicsFromEvent(ev: BasicsSource): BasicsAnswers {
  return {
    ...blankBasics(),
    name: ev.name ?? "", starts_on: ev.starts_on ?? "", ends_on: ev.ends_on ?? "", venue_name: ev.venue_name ?? "",
    primary_color: normaliseColour(ev.primary_color || DEFAULT_COLOUR), logo_url: ev.logo_url ?? "", banner_url: ev.banner_url ?? "",
    committee_numbers: (ev.committee_alert_numbers ?? []).map((n) => `+${n}`).join("\n"),
  };
}

/**
 * Whatever the browser sent, as answers: known fields only, each a string cut to its limit.
 * Not trimmed - this runs on every autosave, mid-typing.
 */
export function sanitizeBasics(raw: unknown): BasicsAnswers {
  const out = blankBasics();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const o = raw as Record<string, unknown>;
  for (const f of BASICS_FIELDS) {
    const v = o[f];
    if (v === null || v === undefined) continue;
    if (typeof v === "string" || typeof v === "number") out[f] = String(v).slice(0, LIMITS[f]);
  }
  out.primary_color = normaliseColour(out.primary_color);
  return out;
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const lines = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

export function basicsErrors(a: BasicsAnswers): Partial<Record<BasicsField, string>> {
  const e: Partial<Record<BasicsField, string>> = {};
  const t = (f: BasicsField) => a[f].trim();
  if (t("starts_on") && !isDate(t("starts_on"))) e.starts_on = "Pick a date.";
  if (t("ends_on") && !isDate(t("ends_on"))) e.ends_on = "Pick a date.";
  if (!e.starts_on && !e.ends_on && t("starts_on") && t("ends_on") && t("ends_on") < t("starts_on")) e.ends_on = "The last day can't be before the first.";
  if (!/^#[0-9a-fA-F]{6}$/.test(t("primary_color"))) e.primary_color = "Use a colour like #F97316.";
  const bad = lines(a.committee_numbers).filter((l) => !toE164My(l));
  if (bad.length) e.committee_numbers = `These can't be read as Malaysian mobile numbers: ${bad.join(", ")}`;
  return e;
}

export function basicsMissing(a: BasicsAnswers): BasicsField[] {
  return BASICS_REQUIRED.filter((f) => !a[f].trim());
}

export function basicsComplete(a: BasicsAnswers): boolean {
  return basicsMissing(a).length === 0 && Object.keys(basicsErrors(a)).length === 0;
}

export type BasicsChange = { field: BasicsField; label: string; before: string; after: string; image: boolean; infoOnly: boolean };

/**
 * Committee lines as the list Apply would store: each read as a Malaysian mobile, deduped, in order.
 * Comparing these rather than the raw text keeps a formatting-only difference from counting as a change.
 */
function committeeList(s: string): string[] {
  return [...new Set(lines(s).map((l) => toE164My(l)).filter((n): n is string => !!n))];
}

/** Whether two answers for a field differ, trimmed; committee numbers by the numbers they mean. */
function differs(f: BasicsField, a: BasicsAnswers, b: BasicsAnswers): boolean {
  if (f === "committee_numbers") return committeeList(a[f]).join("\n") !== committeeList(b[f]).join("\n");
  return a[f].trim() !== b[f].trim();
}

/**
 * The organiser's starting point for Apply (D450): the last applied snapshot, else the live event
 * as their form first showed it (`seed`), else the live event now (a row saved before seeds existed).
 */
export function basicsBaseline(row: { applied: unknown; seed: unknown } | null, ev: BasicsSource): BasicsAnswers {
  if (row?.applied) return sanitizeBasics(row.applied);
  if (row?.seed) return sanitizeBasics(row.seed);
  return basicsFromEvent(ev);
}

/**
 * What Apply would write, plus the info-only fields the organiser filled (D449): a field is listed
 * only when the organiser changed it from `baseline` AND it differs from the live event, so the
 * review lists exactly what Apply writes.
 */
export function basicsChanges(submitted: BasicsAnswers, live: BasicsAnswers, baseline: BasicsAnswers): BasicsChange[] {
  return BASICS_FIELDS.flatMap((f) => {
    const after = submitted[f].trim();
    const infoOnly = INFO_ONLY.includes(f);
    if (infoOnly ? !after : !differs(f, submitted, baseline) || !differs(f, submitted, live)) return [];
    return [{ field: f, label: BASICS_LABELS[f], before: infoOnly ? "" : live[f].trim(), after, image: (BASICS_IMAGE_FIELDS as readonly string[]).includes(f), infoOnly }];
  });
}

export type EventPatch = Partial<{
  name: string; starts_on: string | null; ends_on: string | null; venue_name: string | null; primary_color: string;
  logo_url: string | null; banner_url: string | null;
  committee_alert_numbers: string[];
}>;

/**
 * Only what the organiser changed since the baseline (D450). The baseline is the last applied
 * snapshot, or before the first Apply the organiser's starting point (basicsBaseline). So a field
 * the organiser left as it was is never written, and a field the admin edited in admin keeps the
 * admin's value until the organiser changes that field again - on the first Apply too.
 *
 * Given `live` (the event now, as answers), a field that already holds the organiser's value is
 * left out too, so the patch has exactly the fields basicsChanges lists and no write is a no-op.
 */
export function basicsPatch(submitted: BasicsAnswers, baseline: BasicsAnswers, live?: BasicsAnswers): EventPatch {
  const changed = (f: BasicsField) => differs(f, submitted, baseline) && (!live || differs(f, submitted, live));
  const val = (f: BasicsField) => submitted[f].trim() || null;
  const p: EventPatch = {};
  if (changed("name") && val("name")) p.name = val("name")!;
  if (changed("starts_on")) p.starts_on = val("starts_on");
  if (changed("ends_on")) p.ends_on = val("ends_on");
  if (changed("venue_name")) p.venue_name = val("venue_name");
  if (changed("primary_color") && val("primary_color")) p.primary_color = val("primary_color")!;
  if (changed("logo_url")) p.logo_url = val("logo_url");
  if (changed("banner_url")) p.banner_url = val("banner_url");
  if (changed("committee_numbers")) {
    p.committee_alert_numbers = committeeList(submitted.committee_numbers);
  }
  return p;
}
