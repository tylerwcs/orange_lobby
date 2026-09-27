import type { Metadata } from "next";
import type { Event } from "@/lib/types";
import { notFound } from "next/navigation";
import { displayLinkState } from "@/lib/games/live";
import { displayState } from "@/lib/games/display-state";
import { DisplayClient } from "@/components/games/display/DisplayClient";
import { LinkRefused } from "@/components/games/LinkRefused";
import "./display.css";

// Never cached: the stage is live, and an expired link must stop on the day it does.
export const dynamic = "force-dynamic";
// A display link opens the event's live view: keep it out of search indexes, like the host link.
export const metadata: Metadata = { title: "Display", robots: { index: false, follow: false } };

/** The LED's first view, built at the moment of the request (outside render, which must stay pure). */
const firstView = (event: Event) => displayState(event, Date.now());

export default async function DisplayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await displayLinkState(token);
  if ("refused" in link) {
    if (link.refused === "missing") notFound();
    return link.refused === "draft"
      ? <LinkRefused title="This event is not published yet" body="Publish the event in Settings, then reload this page." />
      : <LinkRefused title="This display link has expired" body="The event is over. Ask the organiser for a new link if you still need it." />;
  }
  return <DisplayClient token={token} initial={await firstView(link.event)} />;
}
