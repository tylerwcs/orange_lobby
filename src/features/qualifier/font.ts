import { Bricolage_Grotesque } from "next/font/google";

/**
 * The games' display face (D291) for the qualifier's numbers, words and headings. The same
 * options and variable as the games' own (`features/games/font.ts`, internal to that feature),
 * so `font-game` reads it and the browser fetches one file. Not preloaded, as there.
 */
export const qualifierFont = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: "800",
  variable: "--font-bricolage",
  display: "swap",
  preload: false,
});
