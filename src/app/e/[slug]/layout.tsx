import type { Metadata } from "next";

// Attendee links carry personal tokens; keep every event page out of search indexes.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function EventLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-canvas">{children}</div>;
}
