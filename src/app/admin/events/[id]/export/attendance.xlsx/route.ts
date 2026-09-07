import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAttendees } from "@/lib/db/attendees";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { buildAttendanceWorkbook } from "@/lib/exports";
import { serviceClient } from "@/lib/supabase/service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { orgId } = await requireAdmin(); const ev = await requireEvent(id, orgId);
  const [attendees, cps, cis] = await Promise.all([listAttendees(ev.id), listCheckpoints(ev.id), listCheckinsForEvent(ev.id)]);
  const ids = Array.from(new Set(cis.map((c) => c.scanned_by).filter(Boolean))) as string[];
  const names: Record<string, string> = {};
  for (const uid of ids) { const { data } = await serviceClient().auth.admin.getUserById(uid); if (data.user?.email) names[uid] = data.user.email; }
  const buf = await buildAttendanceWorkbook(attendees, cps, cis, names).xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${ev.slug}-attendance.xlsx"` } });
}
