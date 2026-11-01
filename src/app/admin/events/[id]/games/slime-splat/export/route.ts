import { requireEventAccess } from "@/lib/access";
import { requireFeature } from "@/features/catalogue";
import { boardSize, exportCsv, listBoard, slimeAdminPath, type BoardRow } from "@/features/qualifier";

// D775, D797: Slime Splat's leaderboard as a CSV. The whole board, read a page at a time so no
// single call holds it all.
const PAGE = 500;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ev } = await requireEventAccess(id);
  await requireFeature(ev.id, "typing_qualifier", slimeAdminPath(ev.id));

  const total = await boardSize(ev.id);
  const rows: BoardRow[] = [];
  while (rows.length < total) {
    const page = await listBoard(ev.id, PAGE, rows.length);
    if (page.length === 0) break;
    rows.push(...page);
  }

  // The byte-order mark makes Excel read the file as UTF-8, so a name like "Zoë" survives.
  return new Response(`\uFEFF${exportCsv(rows)}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ev.slug}-slime-splat.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
