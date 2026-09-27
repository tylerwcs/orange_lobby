import { Bricolage_Grotesque } from "next/font/google";

/**
 * The games' display face (D291): names, numbers, questions and headings on the LED and the
 * play page. Body text stays Manrope. `variable` defines --font-bricolage, which the
 * `font-game` utility reads (globals.css); 3D text textures use `style.fontFamily` (D293).
 * Not preloaded: GameBanner imports this on every portal home, and most visits there never
 * show a game. The play page and the LED fetch it when they first use it (display: swap).
 */
export const gameFont = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: "800",
  variable: "--font-bricolage",
  display: "swap",
  preload: false,
});
