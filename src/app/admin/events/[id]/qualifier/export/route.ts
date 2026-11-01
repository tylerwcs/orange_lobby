import { redirect } from "next/navigation";

/** Slime Splat moved under Games (D797): the old CSV link lands on the new one. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/events/${encodeURIComponent(id)}/games/slime-splat/export`);
}
