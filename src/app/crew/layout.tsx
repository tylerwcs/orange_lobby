import type { Metadata } from "next";

// A crew link is an authority, not a page: it opens the scanner for whoever holds it. Keep it
// out of search indexes, as every token-carrying route in this app is.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function CrewLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
