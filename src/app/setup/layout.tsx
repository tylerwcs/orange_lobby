import type { Metadata } from "next";

// A private working page: never in a search index (D441).
export const metadata: Metadata = { title: "Event setup", robots: { index: false, follow: false } };

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-muted/30">{children}</div>;
}
