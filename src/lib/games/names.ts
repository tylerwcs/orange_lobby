/**
 * How a player is named on the LED (D273): initials plus first name, everywhere but a winner
 * card. "First name" is the first word of `attendees.name`; for surname-first names that is the
 * surname, and the initials still tell two Tans apart.
 */
export type Tag = { initials: string; first: string };

const words = (name: string) => name.trim().split(/\s+/).filter(Boolean);
// Array.from splits by code point, so "É" is one letter rather than half a surrogate pair.
const firstLetter = (w: string) => (Array.from(w)[0] ?? "").toUpperCase();

export function tag(name: string): Tag {
  const w = words(name);
  return { initials: w.slice(0, 2).map(firstLetter).join("") || "?", first: w[0] ?? "" };
}

export function tagLabel(name: string): string {
  const t = tag(name);
  return t.first ? `${t.initials} · ${t.first}` : t.initials;
}
