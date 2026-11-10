/**
 * Text that has to fit a page: the biggest size from `max` down to `min` that holds it on one
 * line; failing that, wrapped at `min` onto at most `maxLines` lines, the last cut with "…".
 * `measure` is the canvas's (`ctx.measureText` at that size), passed in so this stays pure.
 * A single word wider than the line is broken by character, so nothing ever runs off the page.
 */
export function fitText(
  text: string, maxWidth: number, sizes: { max: number; min: number },
  measure: (t: string, size: number) => number, maxLines = 2,
): { size: number; lines: string[] } {
  const clean = text.replace(/\s+/g, " ").trim();
  for (let size = sizes.max; size >= sizes.min; size -= 2) {
    if (measure(clean, size) <= maxWidth) return { size, lines: [clean] };
  }
  const size = sizes.min;
  const fits = (t: string) => measure(t, size) <= maxWidth;
  const lines: string[] = [];
  let line = "";
  for (const word of clean.split(" ")) {
    for (const piece of breakWord(word, fits)) {
      const next = line ? `${line} ${piece}` : piece;
      if (fits(next)) line = next;
      else { if (line) lines.push(line); line = piece; }
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return { size, lines };
  const kept = lines.slice(0, maxLines);
  let last = Array.from(kept[maxLines - 1]);
  while (last.length && !fits(`${last.join("").trimEnd()}…`)) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.join("").trimEnd()}…`;
  return { size, lines: kept };
}

function breakWord(word: string, fits: (t: string) => boolean): string[] {
  if (fits(word)) return [word];
  const out: string[] = [];
  let piece = "";
  for (const ch of Array.from(word)) {
    if (piece && !fits(piece + ch)) { out.push(piece); piece = ch; }
    else piece += ch;
  }
  if (piece) out.push(piece);
  return out;
}
