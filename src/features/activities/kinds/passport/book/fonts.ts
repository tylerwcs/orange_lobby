import { Archivo_Black, Caveat, DM_Sans } from "next/font/google";
import type { Fonts } from "./paint";

/**
 * The passport's three faces, as the approved sketch set them: Archivo Black for PASSPORT and the
 * personality's name, DM Sans for the page words, Caveat for handwriting. Not preloaded: only the
 * passport page paints with them, and `loadBookFonts` fetches them before the first paint.
 */
const display = Archivo_Black({ subsets: ["latin"], weight: "400", display: "swap", preload: false });
// A variable font: no weights named, so one file serves 500-700 (a weight list breaks the Turbopack build).
const body = DM_Sans({ subsets: ["latin"], display: "swap", preload: false });
const hand = Caveat({ subsets: ["latin"], weight: "600", display: "swap", preload: false });

export const BOOK_FONTS: Fonts = {
  display: display.style.fontFamily,
  body: body.style.fontFamily,
  hand: hand.style.fontFamily,
};

/**
 * A canvas draws with whatever font is loaded at that moment, so the pages wait for these. A slow
 * network never holds the passport back: after 2.5 s it paints with the fallbacks, and the pages
 * repaint once the fonts land (the caller listens to `document.fonts`).
 */
export function loadBookFonts(): Promise<void> {
  const want = [`400 40px ${BOOK_FONTS.display}`, `500 30px ${BOOK_FONTS.body}`, `700 30px ${BOOK_FONTS.body}`, `600 30px ${BOOK_FONTS.body}`, `600 40px ${BOOK_FONTS.hand}`];
  const loads = Promise.all(want.map((f) => document.fonts.load(f).catch(() => []))).then(() => undefined);
  return Promise.race([loads, new Promise<void>((r) => setTimeout(r, 2500))]);
}
