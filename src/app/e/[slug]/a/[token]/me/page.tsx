import { loadPortalAttendee } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";
import { appBaseUrl, attendeeLink } from "@/lib/links";
import { qrDataUrl } from "@/lib/qr";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { eventFields } from "@/lib/attendee-fields";
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
  const basePath = `/e/${slug}/a/${token}`;
  const qr = await qrDataUrl(attendeeLink(appBaseUrl(), slug, attendee.token));

  // Everything the event asked this person, in the order it asked, with blanks dropped -
  // an attendee should not read a list of questions they left empty.
  const fields = eventFields(event.registration_questions, event.attendee_fields);
  const answered = fields
    .map((f) => ({ label: f.label, value: attendee.extra?.[f.key] ?? "" }))
    .filter((f) => f.value.trim() !== "");

  // Only what this event collects. Settings promises that switching a field off hides it
  // everywhere, and an attendee's own profile is the most literal "everywhere" there is.
  const collects = new Set<string>(event.collected_fields);
  const contactDetails = [
    attendee.email ? { label: "Email", value: attendee.email } : null,
    attendee.phone && collects.has("phone") ? { label: "Mobile", value: attendee.phone } : null,
  ].filter((x): x is { label: string; value: string } => x !== null);

  return (
    <PortalShell event={event} basePath={basePath} personal current="/me">
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
              {attendee.company && collects.has("company") && <div className="text-sm text-muted-foreground">{attendee.company}</div>}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {attendee.category && <Badge variant="secondary">{attendee.category}</Badge>}
              {attendee.table_no && collects.has("table_no") && <Badge>Table {attendee.table_no}</Badge>}
            </div>

            <Dialog>
              <DialogTrigger render={<Button className="mt-1 w-full sm:w-64" />}>Show my badge</DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogTitle className="text-center">{attendee.name}</DialogTitle>
                <DialogDescription className="text-center">
                  Show this at check-in if you do not have your printed badge.
                </DialogDescription>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="Your QR code" width={240} height={240} className="mx-auto size-60 rounded-lg" />
              </DialogContent>
            </Dialog>
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
    </PortalShell>
  );
}
