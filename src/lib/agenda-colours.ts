/**
 * The colours an organiser may give an agenda session.
 *
 * A fixed palette rather than a colour picker, and specifically THESE five: they are the
 * `--chart-N` tokens, the only inks in this app that `tests/contrast.test.ts` has checked
 * against `--card`. A picker would let somebody choose a yellow that cannot be seen on
 * white, and would bypass that test the same way per-event brand colours already do — a
 * finding that has been open since the September audit. One is enough.
 *
 * Each colour is a PAIR: a pastel tint for the session's own background and the saturated
 * ink for its leading edge. That is not decoration for its own sake — the arithmetic in
 * tests/contrast.test.ts shows no single colour can both be light enough to read text on
 * and be 3:1 from a white card, so the tint carries the look and the ink carries the
 * visibility.
 *
 * The colour groups sessions so a two-day programme can be scanned. It carries no meaning
 * of its own — there is no legend — so nothing reads it back, nothing filters on it, and a
 * session with no colour is exactly what it was before.
 */
export type AgendaColour = { key: string; label: string; tintClass: string; inkClass: string };

/**
 * The class names are written out in full on purpose. Tailwind v4 finds utilities by
 * scanning source text, so a class assembled at runtime — `bg-${token}` — is never
 * generated and the colour silently does not render. Anything that builds a class from a
 * fragment will pass its unit test and fail in the browser.
 */
export const AGENDA_COLOURS: AgendaColour[] = [
  { key: "orange", label: "Orange", tintClass: "bg-session-1", inkClass: "bg-chart-1" },
  { key: "blue", label: "Blue", tintClass: "bg-session-2", inkClass: "bg-chart-2" },
  { key: "plum", label: "Plum", tintClass: "bg-session-3", inkClass: "bg-chart-3" },
  { key: "violet", label: "Violet", tintClass: "bg-session-4", inkClass: "bg-chart-4" },
  { key: "slate", label: "Slate", tintClass: "bg-session-5", inkClass: "bg-chart-5" },
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
 * The pastel a coloured session sits on, replacing the card's white.
 *
 * A pastel alone cannot carry the colour: a tint light enough for --muted-foreground to
 * read on is nowhere near 3:1 from a white card, so on its own it would be a colour an
 * organiser chose and nobody could see. It always comes with its ink.
 */
export function agendaTintClass(raw: string | null | undefined): string | null {
  const key = parseAgendaColour(raw);
  return key ? BY_KEY.get(key)!.tintClass : null;
}

/** The saturated edge of a coloured session, and its dot in the organiser's list. */
export function agendaInkClass(raw: string | null | undefined): string | null {
  const key = parseAgendaColour(raw);
  return key ? BY_KEY.get(key)!.inkClass : null;
}
