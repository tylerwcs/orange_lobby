import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAttendees } from "@/lib/db/attendees";
import { listSends } from "@/lib/db/whatsapp-sends";
import { eventFields } from "@/lib/attendee-fields";
import { splitAudience } from "@/lib/whatsapp-audience";
import { DEFAULT_TEMPLATE } from "@/lib/whatsapp-run";
import { listTemplates } from "@/lib/whatsapp";
import { readTemplate, type Template } from "@/lib/whatsapp-templates";
import { audienceOptions, inAudience } from "@/lib/whatsapp-targets";
import { listActivities, listBookings } from "@/lib/db/activities";
import { nowInKL } from "@/lib/time";
import { formatDateRange, shortDateTime } from "@/lib/text";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { WhatsappComposer } from "@/components/admin/WhatsappComposer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { sendWhatsappAction } from "../actions";

export const metadata = { title: "WhatsApp" };

const STATUS_TONE: Record<string, "default" | "secondary" | "destructive"> = {
  delivered: "default", read: "default", sent: "secondary", accepted: "secondary",
  queued: "secondary", failed: "destructive",
};

export default async function WhatsappAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const attendees = await listAttendees(ev.id);
  const fields = eventFields(ev.registration_questions, ev.attendee_fields);
  const { recipients, unusable } = splitAudience(attendees, fields);
  const [sends, list, bookingActivities, bookings] = await Promise.all([
    listSends(ev.id), listTemplates(), listActivities(ev.id, "booking"), listBookings(ev.id),
  ]);
  const templates = list.ok ? list.templates.map(readTemplate).filter((t): t is Template => t !== null) : [];

  // Each audience as the reachable people in it (whatsapp-targets.ts), and one of them to
  // preview with. Only that one person's link code reaches the browser, not everybody's.
  const bookedBy = new Map<string, Set<string>>();
  for (const b of bookings) (bookedBy.get(b.activity_id) ?? bookedBy.set(b.activity_id, new Set()).get(b.activity_id)!).add(b.attendee_id);
  const audiences = audienceOptions(bookingActivities).map((o) => {
    const members = recipients.filter((r) => inAudience(o.key, r.attendee, bookingActivities, bookedBy));
    const sample = members[0]?.attendee;
    return { ...o, ids: members.map((m) => m.attendee.id), sample: sample ? { name: sample.name, token: sample.token } : null };
  });
  // Who already has what: the claim keys of every send that did not fail (a failed one is
  // retried by pressing Send again - claimSend).
  const sentKeys = sends.filter((s) => s.status !== "failed" && s.dedupe_key).map((s) => s.dedupe_key as string);
  const delivered = sends.filter((s) => s.status !== "failed").length;
  const failed = sends.filter((s) => s.status === "failed");

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader title="WhatsApp" subtitle="Message attendees from an approved template. Nobody gets the same message twice unless you choose Send again." />
      {!list.ok && (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">Could not read the templates from WhatsApp: {list.error}</p>
      )}

      <div className="@container"><div className="grid items-start gap-4 @4xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><div className="text-2xl font-bold">{recipients.length}</div><div className="text-muted-foreground">Can be reached</div></div>
                <div><div className="text-2xl font-bold">{delivered}</div><div className="text-muted-foreground">Messages sent</div></div>
                <div><div className="text-2xl font-bold">{unusable.length}</div><div className="text-muted-foreground">No usable number</div></div>
              </div>
              {failed.length > 0 && (
                <p className="text-sm text-destructive">{failed.length} message{failed.length === 1 ? "" : "s"} failed to deliver — see the log below. Sending again retries only those.</p>
              )}
            </CardContent>
          </Card>

          {/* The whole reason this screen exists: the organiser sees who will be skipped while
              there is still time to fix the sheet, rather than finding out at the door. */}
          <Card>
            <CardHeader><CardTitle>Will not be sent to ({unusable.length})</CardTitle></CardHeader>
            <CardContent className="px-0">
              <ul className="divide-y text-sm">
                {unusable.map(({ attendee, reason }) => (
                  <li key={attendee.id} className="flex items-baseline justify-between gap-4 p-4">
                    <span className="font-bold">{attendee.name}</span>
                    <span className="text-right text-muted-foreground">{reason}</span>
                  </li>
                ))}
                {unusable.length === 0 && (
                  <li><Empty className="border-0 bg-transparent"><EmptyHeader>
                    <EmptyTitle>Everyone has a usable number</EmptyTitle>
                    <EmptyDescription>All {recipients.length} attendees can be reached.</EmptyDescription>
                  </EmptyHeader></Empty></li>
                )}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Send log</CardTitle></CardHeader>
            <CardContent className="px-0">
              <ul className="divide-y text-sm">
                {sends.slice(0, 200).map((s) => {
                  const who = attendees.find((a) => a.id === s.attendee_id);
                  return (
                    <li key={s.id} className="flex items-baseline justify-between gap-4 p-4">
                      <div className="min-w-0">
                        <div className="font-bold">{who?.name ?? "Deleted attendee"}</div>
                        <div className="text-xs text-muted-foreground">{s.template} · {s.to_e164} · {shortDateTime(s.created_at)}</div>
                        {s.error_title && <div className="mt-1 text-xs text-destructive">{s.error_code ? `${s.error_code}: ` : ""}{s.error_title}</div>}
                      </div>
                      <Badge variant={STATUS_TONE[s.status] ?? "secondary"}>{s.status}</Badge>
                    </li>
                  );
                })}
                {sends.length === 0 && (
                  <li><Empty className="border-0 bg-transparent"><EmptyHeader>
                    <EmptyTitle>Nothing sent yet</EmptyTitle>
                    <EmptyDescription>Delivery and failure land here as Meta reports them.</EmptyDescription>
                  </EmptyHeader></Empty></li>
                )}
              </ul>
            </CardContent>
          </Card>
        </div>

        <WhatsappComposer
          templates={templates}
          initial={DEFAULT_TEMPLATE}
          audiences={audiences}
          sentKeys={sentKeys}
          today={nowInKL().date}
          event={{ eventName: ev.name, eventDates: formatDateRange(ev.starts_on, ev.ends_on), venue: ev.venue_name ?? "" }}
          action={sendWhatsappAction.bind(null, ev.id)}
        />
      </div>
      </div>
    </div>
  );
}
