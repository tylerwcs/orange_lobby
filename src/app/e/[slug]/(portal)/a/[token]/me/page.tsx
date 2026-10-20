import { loadPortalAttendee, isUnpublished } from "@/lib/portal";
import { eventAddress } from "@/features/domains";
import { attendeeLink } from "@/lib/links";
import { qrDataUrl } from "@/lib/qr";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BadgeQrDialog } from "@/components/portal/BadgeQrDialog";
import { Button } from "@/components/ui/button";
import { meAnswerFields, ME_BADGE, ME_CATEGORY, ME_EMAIL, ME_TABLE } from "@/lib/me-page";
import { fieldValue } from "@/lib/attendee-values";
import { initials } from "@/lib/text";
import { hasAnyCheckin } from "@/lib/db/checkins";
import { CancelRequestNote, CancelSection, canSelfCancel, klDayTime, requestCancelAction, withdrawCancelRequestAction } from "@/features/cancel";
import { TITLE_INK } from "@/lib/ink";

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
  // D536: what the organiser chose to hide. Name and avatar are not on the list.
  const hidden = new Set(event.me_hidden ?? []);
  const shows = (key: string) => !hidden.has(key);
  const qr = shows(ME_BADGE) ? await qrDataUrl(attendeeLink(await eventAddress(event), attendee.token)) : null;

  // Everything the event asked this person, in the order it asked, with blanks dropped -
  // an attendee should not read a list of questions they left empty. `fieldValue`, not
  // `extra` directly, so a value is trimmed before "left empty" is decided.
  //
  // table_no is excluded on purpose (inside meAnswerFields) — the identity card below shows it as a badge, and
  // it would otherwise print a second time in this list. Do not remove the filter to "fix" a
  // missing row; add the fact to the card instead if it ever needs to leave this list.
  //
  // company used to be excluded too, for the same reason. It no longer prints on the card,
  // so it belongs in this list with every other answer the event collected.
  const answered = meAnswerFields(event)
    .filter((f) => shows(f.key))
    .map((f) => ({ label: f.label, value: fieldValue(attendee, f.key) }))
    .filter((f) => f.value.trim() !== "");

  // Company, phone and table are ordinary fields now, so they surface once, in the
  // "answered" list above (table as a badge on the card) — the contact block keeps only what
  // is not: the address this attendee's link was sent to.
  const contactDetails = attendee.email && shows(ME_EMAIL) ? [{ label: "Email", value: attendee.email }] : [];

  // D585: the cancel card, last and outside the show/hide checklist. Only while the rules allow
  // it; the check-in read is skipped when the event has no self-cancel, or a request is waiting (D595).
  const canCancel = event.self_cancel && !attendee.cancel_requested_at
    && canSelfCancel(event, attendee, await hasAnyCheckin(attendee.id), new Date()).ok;
  // The decline note shows only while they could ask again, i.e. while the card below shows.
  const showNote = attendee.cancel_requested_at || (attendee.cancel_declined_at && canCancel);

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
              <div className={`text-xl font-extrabold leading-tight ${TITLE_INK}`}>{attendee.name}</div>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {attendee.category && shows(ME_CATEGORY) && <Badge variant="secondary">{attendee.category}</Badge>}
              {fieldValue(attendee, ME_TABLE) && shows(ME_TABLE) && <Badge>Table {fieldValue(attendee, ME_TABLE)}</Badge>}
            </div>

            {qr && <BadgeQrDialog qr={qr} name={attendee.name} trigger={<Button className="mt-1 w-full sm:w-64">Show my badge</Button>} />}
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

        {showNote && (
          <CancelRequestNote variant="me" requestedAt={attendee.cancel_requested_at} declinedAt={attendee.cancel_declined_at}
            withdraw={withdrawCancelRequestAction.bind(null, slug, token)} />
        )}

        {canCancel && (
          <CancelSection variant="me" eventName={event.name} until={event.self_cancel_closes_at ? klDayTime(event.self_cancel_closes_at) : null} action={requestCancelAction.bind(null, slug, token)} />
        )}

      </div>
    </>
  );
}
