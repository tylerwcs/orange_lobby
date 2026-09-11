import { requireEvent } from "@/lib/db/events";
import { getAttendee } from "@/lib/db/attendees";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { attendeeCheckins } from "@/lib/checkins-stats";
import { checkpointsByDay } from "@/lib/checkpoints";
import { appBaseUrl, attendeeLink } from "@/lib/links";
import { qrDataUrl } from "@/lib/qr";
import { isoToLocalInput } from "@/lib/time";
import { shortDate } from "@/lib/text";
import { safeFileName } from "@/lib/filenames";
import { scannerNames, shortScanner } from "@/lib/db/users";
import { fieldsFromQuestions } from "@/lib/attendee-fields";
import { Field } from "@/components/admin/Field";
import { FieldInputs } from "@/components/admin/FieldInputs";
import { CopyLink } from "@/components/admin/CopyLink";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { DangerButton } from "@/components/admin/DangerButton";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { buttonClass } from "@/components/ui/Card";
import { updateAttendeeAction, deleteAttendeeAction } from "@/app/admin/events/[id]/actions";

const hhmm = (iso: string) => isoToLocalInput(iso).split("T")[1] ?? "";

const caption = "text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted";

export type AttendeeDetailData = NonNullable<Awaited<ReturnType<typeof loadAttendeeDetail>>>;

/**
 * Everything the panel renders, loaded once. Returns null when the attendee does not
 * belong to the event, so the page and the modal can each decide what that means.
 */
export async function loadAttendeeDetail(eventId: string, attendeeId: string, orgId: string) {
  const ev = await requireEvent(eventId, orgId);
  const a = await getAttendee(attendeeId);
  if (!a || a.event_id !== ev.id) return null;
  const [cps, checkins] = await Promise.all([listCheckpoints(ev.id), listCheckinsForEvent(ev.id)]);
  const scans = attendeeCheckins(a.id, checkins);
  const link = attendeeLink(appBaseUrl(), ev.slug, a.token);
  // Only this attendee's own scanners, so the lookup is one or two calls rather than one
  // per crew account on the event.
  const crew = await scannerNames(Object.values(scans).map((s) => s.by));
  return { ev, a, cps, scans, crew, link, qr: await qrDataUrl(link) };
}

/**
 * The attendee record in the layout chosen from the mockups: a band carrying who they are
 * and the badge you hand them, then the fields on the left with where they stand on the
 * door beside them. Nothing scrolls on a desktop screen, which is what you want when you
 * are correcting a walk-in's details at the desk while they wait.
 */
export function AttendeeDetail({ data, saved, error }: { data: AttendeeDetailData; saved?: string; error?: string }) {
  const { ev, a, cps, scans, crew, link, qr } = data;
  const firstScan = cps.map((c) => scans[c.id]?.at).filter(Boolean).sort()[0];
  // Two groups, because they are edited for different reasons: the first is what someone
  // told you when they signed up, the second is what you learned since.
  const registrationFields = fieldsFromQuestions(ev.registration_questions);
  const claimed = new Set(registrationFields.map((f) => f.key));
  const customFields = ev.attendee_fields.filter((f) => !claimed.has(f.key));

  return (
    <div>
      {/* Who they are and what you hand them, together: the QR sits beside the link that
          explains it rather than under a heading of its own. */}
      <div className="flex flex-wrap items-start gap-5 rounded-[14px] bg-canvas p-5">
        <div className="min-w-64 flex-1 space-y-3">
          <h2 className="text-xl font-extrabold leading-tight">{a.name}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {a.category && <Badge>{a.category}</Badge>}
            {firstScan
              ? <Badge tone="ok" dot>In at {hhmm(firstScan)}</Badge>
              : <Badge tone="warn" dot>Not checked in</Badge>}
            {a.table_no && <Badge>Table {a.table_no}</Badge>}
          </div>
          <a href={link} className="block break-all font-mono text-xs leading-relaxed text-brand-ink">{link}</a>
          <div className="flex flex-wrap gap-2">
            <CopyLink link={link} />
            <a download={safeFileName(a.name, a.id)} href={qr} className={buttonClass("secondary")}>
              <Icon name="download" size={18} />Download QR
            </a>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt={`QR code for ${a.name}`} width={152} height={152} className="h-38 w-38 shrink-0 rounded-xl bg-surface p-2.5" />
      </div>

      <form action={updateAttendeeAction.bind(null, ev.id, a.id)}>
        {(saved || error) && (
          <div className="mt-5">
            {saved && <p role="status" className="rounded-[var(--radius-control)] bg-ok-soft p-3 text-sm font-semibold text-ok-strong">Saved.</p>}
            {error && <p role="alert" className="rounded-[var(--radius-control)] bg-danger-soft p-3 text-sm font-semibold text-danger-strong">{error}</p>}
          </div>
        )}

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-5">
            <section>
              <h3 className={`${caption} mb-2.5`}>Details</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" name="name" defaultValue={a.name} /><Field label="Email" name="email" defaultValue={a.email} />
                <Field label="Phone" name="phone" defaultValue={a.phone} /><Field label="Company" name="company" defaultValue={a.company} />
                <Field label="Category" name="category" defaultValue={a.category} /><Field label="Table" name="table_no" defaultValue={a.table_no} />
              </div>
            </section>

            {registrationFields.length > 0 && (
              <section>
                <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5">
                  <h3 className={caption}>Registration</h3>
                  <span className="text-xs text-muted">What the form asked</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldInputs fields={registrationFields} values={a.extra} />
                </div>
              </section>
            )}

            {customFields.length > 0 && (
              <section>
                <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5">
                  <h3 className={caption}>Your columns</h3>
                  <span className="text-xs text-muted">Added on the attendees table</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldInputs fields={customFields} values={a.extra} />
                </div>
              </section>
            )}
          </div>

          {/* A list of moments rather than a list of rows: the dot carries the state, and
              the line under each name says when and who — the question actually asked of
              this panel when an attendee says they were let in and the record disagrees.
              Reversing one lives in the scanner's Undo; it is not an admin control. */}
          <aside className="lg:border-l lg:border-line lg:pl-6">
            <h3 className={`${caption} mb-3`}>Check-in</h3>
            {cps.length === 0 ? (
              <p className="text-sm text-muted">No checkpoints yet. Add them under Settings.</p>
            ) : (
              <ul className="flex flex-col gap-3.5">
                {checkpointsByDay(cps).flatMap((g) => g.items.map((cp) => {
                  const scan = scans[cp.id];
                  const by = scan?.by ? crew[scan.by] : undefined;
                  return (
                    <li key={cp.id} className="flex gap-3">
                      <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${scan ? "bg-ok" : "bg-surface ring-[1.5px] ring-muted"}`} />
                      <div className="min-w-0">
                        <div className={`text-sm font-bold ${scan ? "text-ink" : "text-muted"}`}>{cp.name}</div>
                        <div className="mt-0.5 text-[13px] text-muted">
                          {shortDate(g.day)} ·{" "}
                          {scan
                            ? <><span className="tabular-nums">{hhmm(scan.at)}</span>{by ? ` · by ${shortScanner(by)}` : ""}</>
                            : "not checked in"}
                        </div>
                      </div>
                    </li>
                  );
                }))}
              </ul>
            )}
          </aside>
        </div>

        {/* One row, destructive at the far left and confirming at the far right. Delete is
            a `DangerButton` rather than its own form, because a form cannot nest inside
            the form this Save belongs to. */}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <DangerButton action={deleteAttendeeAction.bind(null, ev.id, a.id)} message={`Delete ${a.name}? Their check-ins go with them.`}>
            Delete attendee
          </DangerButton>
          <span className="flex-1" />
          <SubmitButton variant="ok">Save changes</SubmitButton>
        </div>
      </form>
    </div>
  );
}
