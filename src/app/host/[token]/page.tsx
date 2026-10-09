import type { Metadata } from "next";
import type { Event } from "@/lib/types";
import { notFound } from "next/navigation";
import { hostLinkState, hostState, HostConsole, LinkRefused } from "@/features/games";

// Never cached: the stage is live, and an expired link must stop on the day it does.
export const dynamic = "force-dynamic";
// A host link is an authority, like the crew link: keep it out of search indexes.
export const metadata: Metadata = { title: "Host console", robots: { index: false, follow: false } };

/** The console's first view, built at the moment of the request (outside render, which must stay pure). */
const firstView = (event: Event) => hostState(event, Date.now());

export default async function HostPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await hostLinkState(token);
  if ("refused" in link) {
    if (link.refused === "missing") notFound();
    return link.refused === "draft"
      ? <LinkRefused title="This event is not published yet" body="Publish the event in Settings, then open this link again." />
      : <LinkRefused title="This host link has expired" body="The event is over. Ask the organiser for a new link if you still need it." />;
  }
  return <HostConsole token={token} initial={await firstView(link.event)} />;
}
