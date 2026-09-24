import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listActivities } from "@/lib/db/activities";
import { getBoothInEvent } from "@/lib/db/booths";

/**
 * Booths live under their passport now (D190). Kept as a redirect so a bookmark or a runbook
 * link lands somewhere useful.
 *
 * `?qr=<id>` is a printable-sheet link, and every one of those has to keep working (D191) even
 * once an event grows a second passport: the booth it names is looked up directly, and the
 * redirect goes straight to ITS passport's page with `?qr=` carried across, rather than only
 * working by luck when there happens to be exactly one passport to guess. A `qr` that names
 * nothing in this event (wrong event, deleted booth) falls through to the no-`qr` rule below.
 * With no `qr` — a bare bookmark of the old list — the passport itself when there is exactly
 * one, else Activities.
 */
export default async function Booths({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ qr?: string }> }) {
  const { id } = await params;
  const { qr } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  if (qr) {
    const booth = await getBoothInEvent(qr, ev.id);
    if (booth) redirect(`/admin/events/${ev.id}/activities/${booth.activity_id}?qr=${encodeURIComponent(qr)}`);
  }
  const passports = await listActivities(ev.id, "passport");
  if (passports.length === 1) {
    redirect(`/admin/events/${ev.id}/activities/${passports[0].id}${qr ? `?qr=${encodeURIComponent(qr)}` : ""}`);
  }
  redirect(`/admin/events/${ev.id}/activities`);
}
