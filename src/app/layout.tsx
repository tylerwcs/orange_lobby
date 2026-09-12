import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

// Manrope is kept over the nova preset's Geist (D59 amended 12 Sep) - it carries the identity the
// printed KOM badges assume. It binds to --font-sans, the variable shadcn's font-sans utility and
// every component read, so nothing else needs to know which face is in use.
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

export const metadata: Metadata = { title: "Orange Lobby", description: "Event portal by Ecopia Events" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("h-full antialiased font-sans", manrope.variable)}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
