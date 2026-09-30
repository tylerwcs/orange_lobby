/**
 * How a player is named on the LED (D273, D365): their nickname, everywhere but a winner card.
 * The nickname is the attendee field keyed "nickname" (the masterlist imports one for everyone).
 * Without one, the name falls back to its first word and the next word's initial, "Priya R.";
 * for surname-first names that first word is the surname, which is why nicknames come first.
 * `initials` fill the small circles and mosaic tiles, and come from whichever name is shown.
 */
export type Tag = { initials: string; label: string };

export const NICKNAME_KEY = "nickname";

type Named = { name: string; extra?: Record<string, unknown> | null };

const words = (name: string) => name.trim().split(/\s+/).filter(Boolean);
// Array.from splits by code point, so "É" is one letter rather than half a surrogate pair.
const firstLetter = (w: string) => (Array.from(w)[0] ?? "").toUpperCase();
const initialsOf = (w: string[]) => w.slice(0, 2).map(firstLetter).join("") || "?";

export function nicknameOf(a: Named): string {
  const v = a.extra?.[NICKNAME_KEY];
  return typeof v === "string" ? words(v).join(" ") : "";
}

export function tag(a: Named): Tag {
  const nick = nicknameOf(a);
  if (nick) return { initials: initialsOf(words(nick)), label: nick };
  const w = words(a.name);
  if (!w.length) return { initials: "?", label: "?" };
  return { initials: initialsOf(w), label: w[1] ? `${w[0]} ${firstLetter(w[1])}.` : w[0] };
}

/**
 * Everyone's tag at once, so two people the LED would name alike can be told apart: each of them
 * gets their full name's initials added, "Jason (TJ)".
 */
export function tagsFor(people: (Named & { id: string })[]): Map<string, Tag> {
  const tags = people.map((p) => [p, tag(p)] as const);
  const count = new Map<string, number>();
  for (const [, t] of tags) count.set(t.label.toLowerCase(), (count.get(t.label.toLowerCase()) ?? 0) + 1);
  return new Map(tags.map(([p, t]) => [p.id, (count.get(t.label.toLowerCase()) ?? 0) > 1
    ? { ...t, label: `${t.label} (${initialsOf(words(p.name))})` }
    : t]));
}
