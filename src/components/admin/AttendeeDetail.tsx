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
import { Field } from "@/components/admin/Field";
import { FieldInputs } from "@/components/admin/FieldInputs";
import { CopyLink } from "@/components/admin/CopyLink";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { scannerNames, shortScanner } from "@/lib/db/users";
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
 * The attendee record, laid out the way the panel is actually used: the badge first,
 * because handing over a link or a QR is the commonest reason to open it; then where
 * they stand on the door; then the fields, which are the rarer edit.
 */
export function AttendeeDetail({ data, saved, error }: { data: AttendeeDetailData; saved?: string; error?: string }) {
  const { ev, a, cps, scans, crew, link, qr } = data;
  const firstScan = cps.map((c) => scans[c.id]?.at).filter(Boolean).sort()[0];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold leading-tight">{a.name}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {a.category && <Badge>{a.category}</Badge>}
          {firstScan
            ? <Badge tone="ok" dot>In at {hhmm(firstScan)}</Badge>
            : <Badge tone="warn" dot>Not checked in</Badge>}
          {a.table_no && <Badge>Table {a.table_no}</Badge>}
        </div>
      </div>

      {/* The badge, first. */}
      <div className="flex flex-wrap items-center gap-5 rounded-[14px] bg-canvas p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt={`QR code for ${a.name}`} width={120} height={120} className="h-30 w-30 shrink-0 rounded-[10px] bg-surface p-2" />
        <div className="min-w-56 flex-1">
          <p className={caption}>Personal badge link</p>
          <a href={link} className="mt-1.5 block break-all font-mono text-xs leading-relaxed text-brand-ink">{link}</a>
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyLink link={link} />
            <a download={safeFileName(a.name, a.id)} href={qr} className={buttonClass("secondary")}>
              <Icon name="download" size={18} />Download QR
            </a>
          </div>
        </div>
      </div>

      {/* A list of moments rather than a list of rows: the dot carries the state, and the
          line under each name says when and who — which is the question actually asked of
          this panel when an attendee says they were let in and the record disagrees.
          Reversing one lives in the scanner's Undo; it is not an admin control. */}
      <section>
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
      </section>

      <form action={updateAttendeeAction.bind(null, ev.id, a.id)} className="space-y-5">
        {saved && <p role="status" className="rounded-[var(--radius-control)] bg-ok-soft p-3 text-sm font-semibold text-ok-strong">Saved.</p>}
        {error && <p role="alert" className="rounded-[var(--radius-control)] bg-danger-soft p-3 text-sm font-semibold text-danger-strong">{error}</p>}

        <section>
          <h3 className={`${caption} mb-2.5`}>Details</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" name="name" defaultValue={a.name} /><Field label="Email" name="email" defaultValue={a.email} />
            <Field label="Phone" name="phone" defaultValue={a.phone} /><Field label="Company" name="company" defaultValue={a.company} />
            <Field label="Category" name="category" defaultValue={a.category} /><Field label="Table" name="table_no" defaultValue={a.table_no} />
          </div>
        </section>

        {ev.attendee_fields.length > 0 && (
          <section>
            <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5">
              <h3 className={caption}>Your columns</h3>
              <span className="text-xs text-muted">Added on the attendees table</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldInputs fields={ev.attendee_fields} values={a.extra} />
            </div>
          </section>
        )}

        <SubmitButton>Save changes</SubmitButton>
      </form>

      {/* Its own form, below the save: a form cannot nest, and this should not sit a
          mis-click away from the primary button. */}
      <div className="border-t border-line pt-4">
        <form action={deleteAttendeeAction.bind(null, ev.id, a.id)}>
          <ConfirmButton message={`Delete ${a.name}? Their check-ins go with them.`} className="text-danger-strong">Delete attendee</ConfirmButton>
        </form>
      </div>
    </div>
  );
}
