/**
 * The colours an organiser may give an agenda session.
 *
 * A fixed palette rather than a colour picker, and specifically THESE five: they are the
 * `--chart-N` tokens, the only inks in this app that `tests/contrast.test.ts` has checked
 * against `--card`. A picker would let somebody choose a yellow that cannot be seen on
 * white, and would bypass that test the same way per-event brand colours already do — a
 * finding that has been open since the September audit. One is enough.
 *
 * The colour groups sessions so a two-day programme can be scanned. It carries no meaning
 * of its own — there is no legend — so nothing reads it back, nothing filters on it, and a
 * session with no colour is exactly what it was before.
 */
export type AgendaColour = { key: string; label: string; className: string };

/**
 * The class names are written out in full on purpose. Tailwind v4 finds utilities by
 * scanning source text, so a class assembled at runtime — `bg-${token}` — is never
 * generated and the colour silently does not render. Anything that builds a class from a
 * fragment will pass its unit test and fail in the browser.
 */
export const AGENDA_COLOURS: AgendaColour[] = [
  { key: "orange", label: "Orange", className: "bg-chart-1" },
  { key: "blue", label: "Blue", className: "bg-chart-2" },
  { key: "plum", label: "Plum", className: "bg-chart-3" },
  { key: "violet", label: "Violet", className: "bg-chart-4" },
  { key: "slate", label: "Slate", className: "bg-chart-5" },
];

const BY_KEY = new Map(AGENDA_COLOURS.map((c) => [c.key, c]));

/**
 * The stored value as a palette key, or null.
 *
 * `agenda_items.color` is free text in the database, so a hand-edited row, or one written
 * before a colour was retired from the palette, must read as "no colour" rather than reach
 * a template and emit a class name that does not exist.
 */
export function parseAgendaColour(raw: string | null | undefined): string | null {
  const key = (raw ?? "").trim();
  return BY_KEY.has(key) ? key : null;
}

/**
 * The class for the bar down a session's leading edge, and for its dot in the organiser's
 * list. The saturated ink, not a tint: `tests/contrast.test.ts` already proves every chart
 * ink is 3:1 against a white card, which is the bar in the clear. A pastel fill was tried
 * and taken back out — it is about 1.2:1 on white and could barely be seen.
 */
export function agendaAccentClass(raw: string | null | undefined): string | null {
  const key = parseAgendaColour(raw);
  return key ? BY_KEY.get(key)!.className : null;
}
