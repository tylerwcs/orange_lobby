import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAttendees } from "@/lib/db/attendees";
import { listSends } from "@/lib/db/whatsapp-sends";
import { eventFields } from "@/lib/attendee-fields";
import { splitAudience } from "@/lib/whatsapp-audience";
import { PORTAL_LINK_TEMPLATE } from "@/lib/whatsapp-run";
import { shortDateTime } from "@/lib/text";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { sendPortalLinksAction } from "../actions";

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
  const sends = await listSends(ev.id);

  const already = new Set(sends.filter((s) => s.template === PORTAL_LINK_TEMPLATE && s.status !== "failed").map((s) => s.attendee_id));
  const pending = recipients.filter((r) => !already.has(r.attendee.id));
  const failed = sends.filter((s) => s.status === "failed");

  return (
    <div className="space-y-6">
      <AdminHeader title="WhatsApp" subtitle="Send every attendee their personal portal link. Messages go out once per person." />

      <div className="@container"><div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><div className="text-2xl font-bold">{pending.length}</div><div className="text-muted-foreground">Ready to send</div></div>
                <div><div className="text-2xl font-bold">{already.size}</div><div className="text-muted-foreground">Already sent</div></div>
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
            <CardContent className="px-0">
              <h2 className="px-4 pb-3 font-semibold">Will not be sent to ({unusable.length})</h2>
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
            <CardContent className="px-0">
              <h2 className="px-4 pb-3 font-semibold">Send log</h2>
              <ul className="divide-y text-sm">
                {sends.slice(0, 200).map((s) => {
                  const who = attendees.find((a) => a.id === s.attendee_id);
                  return (
                    <li key={s.id} className="flex items-baseline justify-between gap-4 p-4">
                      <div className="min-w-0">
                        <div className="font-bold">{who?.name ?? "Deleted attendee"}</div>
                        <div className="text-xs text-muted-foreground">{s.to_e164} · {shortDateTime(s.created_at)}</div>
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

        <form action={sendPortalLinksAction.bind(null, ev.id)} className="grid gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10 xl:sticky xl:top-6">
          <h2 className="font-semibold">Send portal links</h2>
          <p className="text-sm text-muted-foreground">
            Sends the <code className="text-xs">{PORTAL_LINK_TEMPLATE}</code> template to <strong>{pending.length}</strong> {pending.length === 1 ? "person" : "people"} who have not had it yet.
          </p>
          {pending.length === 0 ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              Nobody left to send to. Every attendee with a usable number already has their link.
            </p>
          ) : (
            <ConfirmButton message={`Send portal links to ${pending.length} attendee${pending.length === 1 ? "" : "s"}? This cannot be recalled.`}>
              Send to {pending.length}
            </ConfirmButton>
          )}
          <p className="text-xs text-muted-foreground">
            Safe to press twice: anyone who already has the message is skipped, not messaged again.
          </p>
        </form>
      </div>
      </div>
    </div>
  );
}
