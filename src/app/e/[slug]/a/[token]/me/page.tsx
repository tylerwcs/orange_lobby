import { loadPortalAttendee, isUnpublished } from "@/lib/portal";
import { appBaseUrl, attendeeLink } from "@/lib/links";
import { qrDataUrl } from "@/lib/qr";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BadgeQrDialog } from "@/components/portal/BadgeQrDialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { eventFields } from "@/lib/attendee-fields";
import { fieldValue } from "@/lib/attendee-values";
import { initials } from "@/lib/text";

const caption = "text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground";

/**
 * One fact. Two columns while both halves fit, and the value drops to its own full-width
 * line when they do not - a registration question can be a whole sentence ("Would you like
 * to stay overnight?") with an answer to match, and squeezing that into a right-hand column
 * gives you two words on four lines.
 */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="ml-auto font-medium break-words">{value}</dd>
    </div>
  );
}

export default async function MePage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  // A draft shows only "Coming soon" (the layout's chrome); see isUnpublished.
  if (isUnpublished(event)) return null;
  const qr = await qrDataUrl(attendeeLink(appBaseUrl(), slug, attendee.token));

  // Everything the event asked this person, in the order it asked, with blanks dropped -
  // an attendee should not read a list of questions they left empty. `fieldValue`, not
  // `extra` directly, so a value is trimmed before "left empty" is decided.
  //
  // table_no is excluded here on purpose — the identity card below shows it as a badge, and
  // it would otherwise print a second time in this list. Do not remove the filter to "fix" a
  // missing row; add the fact to the card instead if it ever needs to leave this list.
  //
  // company used to be excluded too, for the same reason. It no longer prints on the card,
  // so it belongs in this list with every other answer the event collected.
  const identityCardFields = new Set(["table_no"]);
  const fields = eventFields(event.registration_questions, event.attendee_fields);
  const answered = fields
    .filter((f) => !identityCardFields.has(f.key))
    .map((f) => ({ label: f.label, value: fieldValue(attendee, f.key) }))
    .filter((f) => f.value.trim() !== "");

  // Company, phone and table are ordinary fields now, so they surface once, in the
  // "answered" list above (table as a badge on the card) — the contact block keeps only what
  // is not: the address this attendee's link was sent to.
  const contactDetails = attendee.email ? [{ label: "Email", value: attendee.email }] : [];

  return (
    <>
      {/* Capped on desktop. A profile is a reading measure, not a dashboard: at the full
          896px the label and its value end up half a metre apart and the button stretches
          to 830px. */}
      <div className="flex flex-col gap-3.5 md:mx-auto md:max-w-2xl md:gap-5">

        {/* Identity first, and the badge is a dialog rather than a wall of QR: someone
            opening their profile is usually reading it, not presenting it. */}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-accent text-lg font-extrabold text-accent-foreground">
              {initials(attendee.name)}
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-xl font-extrabold leading-tight">{attendee.name}</div>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {attendee.category && <Badge variant="secondary">{attendee.category}</Badge>}
              {fieldValue(attendee, "table_no") && <Badge>Table {fieldValue(attendee, "table_no")}</Badge>}
            </div>

            <BadgeQrDialog qr={qr} name={attendee.name} trigger={<Button className="mt-1 w-full sm:w-64">Show my badge</Button>} />
          </CardContent>
        </Card>

        {contactDetails.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className={caption}>Your details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y text-sm">
                {contactDetails.map((d) => <Row key={d.label} label={d.label} value={d.value} />)}
              </dl>
            </CardContent>
          </Card>
        )}

        {answered.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className={caption}>What you told us</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y text-sm">
                {answered.map((f) => <Row key={f.label} label={f.label} value={f.value} />)}
              </dl>
            </CardContent>
          </Card>
        )}

        {(event.contact_name || event.contact_phone) && (
          <Card>
            <CardContent className="flex flex-col gap-1 text-sm">
              <div className={caption}>Something wrong?</div>
              <p className="text-muted-foreground">
                These details come from your registration. The event desk can change them for you.
              </p>
              <Separator className="my-2" />
              {event.contact_name && <div className="font-bold">{event.contact_name}</div>}
              {event.contact_phone && (
                <a className="font-medium text-primary" href={`tel:${event.contact_phone}`}>{event.contact_phone}</a>
              )}
            </CardContent>
          </Card>
        )}

      </div>
    </>
  );
}
