import { redirect } from "next/navigation";

/** Slime Splat moved under Games (D797): an old link or bookmark lands on its new page. */
export default async function OldSlimeSplat({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/events/${encodeURIComponent(id)}/games/slime-splat`);
}
