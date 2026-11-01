import { redirect } from "next/navigation";

/** Slime Splat moved under Games (D797): an old link to a player's runs lands on its new page. */
export default async function OldSlimeSplatRuns({ params }: { params: Promise<{ id: string; attendeeId: string }> }) {
  const { id, attendeeId } = await params;
  redirect(`/admin/events/${encodeURIComponent(id)}/games/slime-splat/${encodeURIComponent(attendeeId)}`);
}
