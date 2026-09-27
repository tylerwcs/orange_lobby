import { Bricolage_Grotesque } from "next/font/google";

/**
 * The games' display face (D291): names, numbers, questions and headings on the LED and the
 * play page. Body text stays Manrope. `variable` defines --font-bricolage, which the
 * `font-game` utility reads (globals.css); 3D text textures use `style.fontFamily` (D293).
 */
export const gameFont = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: "800",
  variable: "--font-bricolage",
  display: "swap",
});
