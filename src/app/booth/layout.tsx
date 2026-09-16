import type { Metadata } from "next";

// A booth link is a stamping authority (D91): whoever holds it may stamp, no login involved.
// It must never turn up in search results the way any other unauthenticated write surface
// must not, so it is kept out of indexes exactly like the token-carrying portal pages in
// src/app/e/[slug]/layout.tsx.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function BoothLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
