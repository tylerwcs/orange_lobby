import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAttendees } from "@/lib/db/attendees";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { buildAttendanceWorkbook } from "@/lib/exports";
import { serviceClient } from "@/lib/supabase/service";
import { parseIds } from "@/lib/bulk";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { orgId } = await requireAdmin(); const ev = await requireEvent(id, orgId);
  const [attendees, cps, cis] = await Promise.all([listAttendees(ev.id), listCheckpoints(ev.id), listCheckinsForEvent(ev.id)]);
  // The posted list decides which rows are exported, so it is validated against this event's
  // own attendees exactly as the bulk server actions do — an id from another event never widens the export.
  const selectedIds = parseIds(new URL(req.url).searchParams.get("ids"), new Set(attendees.map((a) => a.id)));
  const rows = selectedIds.length > 0 ? attendees.filter((a) => selectedIds.includes(a.id)) : attendees;
  const ids = Array.from(new Set(cis.map((c) => c.scanned_by).filter(Boolean))) as string[];
  const names: Record<string, string> = {};
  for (const uid of ids) { const { data } = await serviceClient().auth.admin.getUserById(uid); if (data.user?.email) names[uid] = data.user.email; }
  const buf = await buildAttendanceWorkbook(rows, cps, cis, names).xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${ev.slug}-attendance.xlsx"` } });
}
