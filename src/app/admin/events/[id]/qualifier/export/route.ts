import { requireEventAccess } from "@/lib/access";
import { requireFeature } from "@/features/catalogue";
import { boardSize, exportCsv, listBoard, listFinalists, type BoardRow } from "@/features/qualifier";

// D775: the ranked list as a CSV, with the finale list marked once it is confirmed. The
// whole board, read a page at a time so no single call holds it all.
const PAGE = 500;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ev } = await requireEventAccess(id);
  await requireFeature(ev.id, "typing_qualifier", `/admin/events/${ev.id}/qualifier`);

  const total = await boardSize(ev.id);
  const rows: BoardRow[] = [];
  while (rows.length < total) {
    const page = await listBoard(ev.id, PAGE, rows.length);
    if (page.length === 0) break;
    rows.push(...page);
  }
  const finalists = await listFinalists(ev.id);

  // The byte-order mark makes Excel read the file as UTF-8, so a name like "Zoë" survives.
  return new Response(`﻿${exportCsv(rows, finalists.length > 0 ? finalists : null)}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ev.slug}-typing-qualifier.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
