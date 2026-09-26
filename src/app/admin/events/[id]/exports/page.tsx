import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { countAttendees } from "@/lib/db/attendees";
import { listAgenda } from "@/lib/db/agenda";
import { listBooths } from "@/lib/db/booths";
import { listActivities } from "@/lib/db/activities";
import { breakoutSlots } from "@/lib/breakouts";
import { appBaseUrl } from "@/lib/links";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { eventFields, MAX_ATTENDEE_FIELDS } from "@/lib/attendee-fields";
import { FieldPicker } from "@/components/admin/FieldPicker";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { updateExportFieldsAction } from "../actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";

export const metadata = { title: "Exports" };

export default async function ExportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [total, items, booths, activities, forms] = await Promise.all([
    countAttendees(ev.id), listAgenda(ev.id), listBooths(ev.id), listActivities(ev.id, "booking"), listActivities(ev.id, "submission"),
  ]);
  const base = appBaseUrl();
  const b = `/admin/events/${ev.id}/export`;
  const fields = eventFields(ev.registration_questions, ev.attendee_fields);
  // Only keys that still have a field behind them: a deleted column is already skipped by every
  // export, so offering it back as an orphan row would only ask the organiser to tidy it.
  const chosen = ev.export_fields.filter((k) => fields.some((f) => f.key === k));

  const files: { href: string; icon: IconName; name: string; what: string }[] = [
    ...(ev.check_in_enabled ? [{
      href: `${b}/attendance.xlsx`, icon: "file" as IconName, name: "Attendance",
      what: "One row per attendee, with three columns for every checkpoint: whether they were checked in, the time, and which crew account scanned them. Includes any extra scan fields you configured.",
    }] : []),
    {
      href: `${b}/links.xlsx`, icon: "link", name: "Personal links",
      what: "Name, email, category, table and each attendee's personal portal link. This is the sheet to mail-merge from.",
    },
    {
      href: `${b}/qr.zip`, icon: "qr", name: "QR codes",
      what: "One PNG per attendee, named after them, each encoding their personal link. This is what goes to the badge printer.",
    },
    ...(breakoutSlots(items).length > 0 ? [{
      href: `${b}/rosters.xlsx`, icon: "file" as IconName, name: "Breakout rosters",
      what: "One sheet per breakout room, plus one per round for whoever has no room yet. This is what the facilitator or the desk prints.",
    }] : []),
    ...(booths.length > 0 ? [{
      href: `${b}/passport.xlsx`, icon: "star" as IconName, name: "Booth Passport",
      what: "One sheet per passport: a row per attendee, a column per booth, how many stamps they collected, and whether their card is complete.",
    }] : []),
    ...(activities.length > 0 ? [{
      href: `${b}/activities.xlsx`, icon: "file" as IconName, name: "Activity rosters",
      what: "One sheet per session, plus who has not booked.",
    }] : []),
    ...(forms.length > 0 ? [{
      href: `${b}/submissions.xlsx`, icon: "file" as IconName, name: "Submissions",
      what: "One sheet per submission activity: who submitted, when, and every answer. File answers are links that expire after seven days.",
    }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader title="Exports" subtitle={`${ev.name} · ${total} attendees`} />

      <Card>
        <CardHeader>
          <CardTitle>Columns in exports</CardTitle>
          <CardDescription>
            Attendee columns to add after Name and Email on every file below except Attendance, which already carries them all.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateExportFieldsAction.bind(null, ev.id)} className="flex flex-col items-start gap-3">
            <FieldPicker
              key={chosen.join("␟")}
              name="export_fields"
              label="Columns added to exports"
              fields={fields}
              selected={chosen}
              max={MAX_ATTENDEE_FIELDS}
            />
            <SubmitButton>Save columns</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* One list, a row per file, the way every other admin list reads: icon, name and what it
          holds, and the one thing to do with it. It was a grid of cards whose Download buttons
          sat at different heights. */}
      <Card className="overflow-hidden py-0">
        <CardContent className="px-0">
          <ul className="divide-y divide-border">
            {files.map((f) => (
              <li key={f.href} className="flex items-center gap-4 px-4 py-3">
                <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon name={f.icon} size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{f.name}</div>
                  <p className="text-xs text-muted-foreground">{f.what}</p>
                </div>
                {/* Plain anchors, not `<Link>`: prefetching an export route would build the file on hover. */}
                <a download href={f.href} className={`${buttonVariants({ variant: "outline" })} shrink-0`}>
                  <Icon name="download" size={18} />Download
                </a>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Before you send these out</CardTitle>
        </CardHeader>
        <CardContent>
        <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
          <li>Personal links and QR codes are generated for <span className="font-bold text-foreground">{base}</span>. If that address changes, re-export before printing.</li>
          <li>A personal link signs the holder in without a password. Treat both files as you would the attendee list itself.</li>
          <li>A personal link does not expire, so a QR printed today still scans on the day. Re-export only if the list changes.</li>
        </ul>
        </CardContent>
      </Card>
    </div>
  );
}
