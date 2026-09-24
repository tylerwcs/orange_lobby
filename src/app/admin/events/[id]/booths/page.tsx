import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listActivities } from "@/lib/db/activities";

/**
 * Booths live under their passport now (D190). Kept as a redirect so a bookmark or a runbook
 * link lands somewhere useful: the passport itself when there is exactly one, else Activities.
 * `?qr=` is carried across so an old printable-sheet link still opens the sheet.
 */
export default async function Booths({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ qr?: string }> }) {
  const { id } = await params;
  const { qr } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const passports = await listActivities(ev.id, "passport");
  if (passports.length === 1) {
    redirect(`/admin/events/${ev.id}/activities/${passports[0].id}${qr ? `?qr=${encodeURIComponent(qr)}` : ""}`);
  }
  redirect(`/admin/events/${ev.id}/activities`);
}
