import { playContext, phoneState, json } from "@/features/games";
import { allow } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Once a second is 60 a minute; the limit leaves room for a reload or two.
  if (!allow(`play:${token}`, 240, 60_000)) return json({ error: "Too many requests." }, 429);
  const ctx = await playContext(token);
  if (!ctx) return json({ error: "This link does not open a game." }, 404);
  return json(await phoneState(ctx, new URL(req.url).searchParams.get("v"), Date.now()));
}
