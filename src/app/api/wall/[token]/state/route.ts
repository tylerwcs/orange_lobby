import { json } from "@/lib/http";
import { wallLinkState, wallState } from "@/features/polaroid";

export const dynamic = "force-dynamic";

/** D484: the wall's state, or "unchanged" when the wall already has this version. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await wallLinkState(token);
  if ("refused" in link) return json({ error: link.refused }, link.refused === "missing" ? 404 : 403);
  const state = await wallState(link.activity, link.event);
  const v = new URL(req.url).searchParams.get("v");
  return json(v && v === state.key ? { now: state.now, unchanged: true } : state);
}
