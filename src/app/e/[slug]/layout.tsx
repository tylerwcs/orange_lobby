import type { Metadata } from "next";
import { findPortalEvent } from "@/lib/portal";
import { eventIconUrl } from "@/lib/event-icon";

// Attendee links carry personal tokens; keep every event page out of search indexes.
const robots: Metadata["robots"] = { index: false, follow: false };

/**
 * D487: the tab and home-screen icon are the event's logo when it has one; without one,
 * ECP Hub's own icons from the app root stand. Shares the page's event read (`findPortalEvent`).
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const event = await findPortalEvent(slug);
  const favicon = event && eventIconUrl(event, "favicon");
  const apple = event && eventIconUrl(event, "apple");
  if (!favicon || !apple) return { robots };
  return {
    robots,
    icons: {
      icon: [{ url: favicon, type: "image/png", sizes: "64x64" }],
      apple: [{ url: apple, type: "image/png", sizes: "180x180" }],
    },
  };
}

export default function EventLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
