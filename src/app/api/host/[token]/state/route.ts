import { hostLinkState } from "@/lib/games/live";
import { hostState } from "@/lib/games/display-state";
import { json } from "@/lib/games/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await hostLinkState(token);
  if ("refused" in link) return json({ error: link.refused }, link.refused === "missing" ? 404 : 403);
  return json(await hostState(link.event, Date.now()));
}
