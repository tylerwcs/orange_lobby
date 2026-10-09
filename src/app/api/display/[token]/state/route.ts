import { displayLinkState, displayState, json } from "@/features/games";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await displayLinkState(token);
  if ("refused" in link) return json({ error: link.refused }, link.refused === "missing" ? 404 : 403);
  return json(await displayState(link.event, Date.now()));
}
