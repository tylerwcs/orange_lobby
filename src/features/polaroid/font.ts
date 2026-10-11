import { Caveat } from "next/font/google";

/**
 * The handwriting on every polaroid (D482): Caveat, as on the old Digital Wall. `variable` defines
 * --font-hand on whatever element carries `handFont.variable`. Not preloaded: only the composer,
 * the wall and admin's feed draw cards.
 */
export const handFont = Caveat({ subsets: ["latin"], weight: "700", variable: "--font-hand", display: "swap", preload: false });
