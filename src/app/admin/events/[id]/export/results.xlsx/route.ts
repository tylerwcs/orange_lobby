import { notFound } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { listGroups } from "@/lib/db/groups";
import { slugify } from "@/lib/slug";
import { buildResultsWorkbook, getTournamentActivity, loadResults } from "@/features/tournaments";

// D666: one tournament's results - every match, every place, and the overall table. The
// tournament is named by `?activity=`, and must be this event's: anything else is a 404.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ev } = await requireEventAccess(id);
  const activityId = new URL(req.url).searchParams.get("activity") ?? "";
  const cup = activityId ? await getTournamentActivity(activityId, ev.id) : null;
  if (!cup) notFound();

  const [results, groups] = await Promise.all([loadResults(cup.id), listGroups(ev.id)]);
  const buf = await buildResultsWorkbook({ results, groups, table: cup.place_points ?? null }).xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ev.slug}-${slugify(cup.name) || "tournament"}-results.xlsx"`,
    },
  });
}
