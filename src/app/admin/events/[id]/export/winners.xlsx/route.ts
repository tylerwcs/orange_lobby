import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { eventFields } from "@/lib/attendee-fields";
import { exportColumns } from "@/lib/export-columns";
import { getGame, listWinners } from "@/features/games";
import { listAttendeesByIds } from "@/lib/db/attendees";
import { buildWinnersWorkbook, winnerSheetRows } from "@/lib/exports";

// One draw per file (`?game=`), linked from that draw's editor rather than the Exports page.
// It carries the event's chosen export columns like every other export; Company is already a
// fixed column here, so it is never added a second time.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { orgId } = await requireAdmin(); const ev = await requireEvent(id, orgId);
  const gameId = new URL(req.url).searchParams.get("game") ?? "";
  const game = gameId ? await getGame(gameId, ev.id) : null;
  if (!game || game.kind !== "draw") return new Response("No such draw.", { status: 404 });
  const winners = await listWinners(game.id);
  const attendees = await listAttendeesByIds(ev.id, winners.map((w) => w.attendee_id));
  const columns = exportColumns(eventFields(ev.registration_questions, ev.attendee_fields), ev.export_fields, ["company"]);
  const rows = winnerSheetRows(game.config.prizes, winners, new Map(attendees.map((a) => [a.id, a])), columns);
  const buf = await buildWinnersWorkbook(game.title, rows).xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ev.slug}-winners.xlsx"`,
    },
  });
}
