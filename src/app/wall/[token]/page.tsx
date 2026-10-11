import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LinkRefused } from "@/features/games";
import { wallLinkState, wallState, WallClient } from "@/features/polaroid";

// Never cached: the wall is live, and an expired link must stop on the day it does.
export const dynamic = "force-dynamic";
// A wall link opens the event's live wall: keep it out of search indexes, like the display link.
export const metadata: Metadata = { title: "Polaroid wall", robots: { index: false, follow: false } };

export default async function WallPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await wallLinkState(token);
  if ("refused" in link) {
    if (link.refused === "missing") notFound();
    return link.refused === "draft"
      ? <LinkRefused title="This event is not published yet" body="Publish the event in Settings, then reload this page." />
      : <LinkRefused title="This wall link has expired" body="The event is over. Ask the organiser for a new link if you still need it." />;
  }
  return <WallClient token={token} initial={await wallState(link.activity, link.event)} />;
}
