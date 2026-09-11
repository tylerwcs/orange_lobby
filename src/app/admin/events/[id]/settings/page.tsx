import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { checkpointsByDay } from "@/lib/checkpoints";
import { eventDays } from "@/lib/time";
import { shortDate } from "@/lib/text";
import { countCheckinsByCheckpoint } from "@/lib/db/checkins";
import { countAttendees } from "@/lib/db/attendees";
import { appBaseUrl, genericLink, registrationLink } from "@/lib/links";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { CopyButton } from "@/components/admin/CopyButton";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Card } from "@/components/ui/Card";
import { updateSettingsAction, setStatusAction, purgeEventAction, addCheckpointAction, deleteCheckpointAction, reorderCheckpointsAction } from "../actions";
import { CheckpointList } from "@/components/admin/CheckpointList";
import { isoToLocalInput } from "@/lib/time";
import { MAX_QUESTIONS } from "@/lib/questions-form";
import type { EventStatus } from "@/lib/types";

export const metadata = { title: "Settings · Orange Lobby" };

const input = "w-full min-h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-sm";

const STATUSES: { value: EventStatus; label: string; what: string }[] = [
  { value: "draft", label: "Draft", what: "Every link shows “Coming soon”." },
  { value: "live", label: "Live", what: "The portal is open to attendees." },
  { value: "archived", label: "Archived", what: "Read-only, and personal data can be purged." },
];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="text-base font-extrabold">{title}</h2>
      {hint && <p className="mt-0.5 mb-3 text-xs text-muted">{hint}</p>}
      <div className={`grid gap-4 ${hint ? "" : "mt-3"} md:grid-cols-2`}>{children}</div>
    </Card>
  );
}

function ShareLink({ label, url }: { label: string; url: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <a href={url} className="min-w-0 flex-1 truncate rounded-[var(--radius-control)] bg-canvas px-3 py-2.5 font-mono text-xs text-brand-ink">{url}</a>
        <CopyButton value={url} label={`${label.toLowerCase()} link`} />
      </div>
    </div>
  );
}

export default async function Settings({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string; purged?: string }> }) {
  const { id } = await params;
  const { saved, error, purged } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const qs = ev.registration_questions;
  const base = appBaseUrl();
  const [cps, cpCounts, total] = await Promise.all([
    listCheckpoints(ev.id), countCheckinsByCheckpoint(ev.id), countAttendees(ev.id),
  ]);
  const grouped = checkpointsByDay(cps);
  const days = eventDays(ev.starts_on, ev.ends_on);

  return (
    <div className="space-y-4">
      <AdminHeader title="Settings" subtitle={ev.name} />
      {saved && <p role="status" className="rounded-[var(--radius-control)] bg-ok-soft p-3 text-sm font-semibold text-ok-strong">Saved.</p>}
      {purged && <p role="status" className="rounded-[var(--radius-control)] bg-ok-soft p-3 text-sm font-semibold text-ok-strong">Personal data purged.</p>}
      {error && <p role="alert" className="rounded-[var(--radius-control)] bg-danger-soft p-3 text-sm font-semibold text-danger-strong">{error}</p>}

      {/* Status and links sit outside the settings form: each status is its own form, and
          HTML has no nested forms. They save on click rather than with the button below. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-base font-extrabold">Status</h2>
          <p className="mt-0.5 mb-3 text-xs text-muted">Applies the moment you choose it — there is no separate save.</p>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <form key={s.value} action={setStatusAction.bind(null, ev.id, s.value)}>
                <button
                  aria-current={ev.status === s.value ? "true" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-3.5 text-sm font-bold transition-colors duration-150 ${ev.status === s.value ? "bg-ink text-white" : "bg-canvas text-ink hover:brightness-95"}`}>
                  {s.label}
                </button>
              </form>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">{STATUSES.find((s) => s.value === ev.status)?.what}</p>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-extrabold">Share links</h2>
          <p className="mt-0.5 mb-3 text-xs text-muted">The two addresses you hand out. Personal per-attendee links are in Exports.</p>
          <div className="space-y-3">
            <ShareLink label="Portal" url={genericLink(base, ev.slug)} />
            <ShareLink label="Registration" url={registrationLink(base, ev.slug)} />
          </div>
        </Card>
      </div>

      {/* Also outside the settings form: adding and deleting a checkpoint are their own posts. */}
      <Card className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-extrabold">Checkpoints</h2>
          <p className="text-xs text-muted">Crew pick one when they open the scanner. A day can hold several — registration, lunch, a dinner door.</p>
        </div>
        {grouped.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No checkpoints yet. Add &ldquo;Registration&rdquo; on the first morning to get started.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {grouped.map((g) => (
              <div key={g.day}>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{shortDate(g.day)}</h3>
                <CheckpointList
                  day={shortDate(g.day)}
                  items={g.items}
                  eventId={ev.id}
                  counts={cpCounts}
                  total={total}
                  reorder={reorderCheckpointsAction.bind(null, ev.id, g.day)}
                  deleteCheckpoint={deleteCheckpointAction.bind(null, ev.id)}
                />
              </div>
            ))}
          </div>
        )}
        <form action={addCheckpointAction.bind(null, ev.id)} className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
          <div className="min-w-52 flex-1"><Field label="New checkpoint" name="name" placeholder="Registration" /></div>
          <div className="w-44"><Field label="Date" name="day" type="date" defaultValue={days[0] ?? ev.starts_on} /></div>
          <SubmitButton>Add</SubmitButton>
        </form>
      </Card>

      <form action={updateSettingsAction.bind(null, ev.id)} className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Event">
            <Field label="Name" name="name" defaultValue={ev.name} />
            <Field label="Primary colour" name="primary_color" type="color" defaultValue={ev.primary_color} />
            <Field label="Starts on" name="starts_on" type="date" defaultValue={ev.starts_on} />
            <Field label="Ends on" name="ends_on" type="date" defaultValue={ev.ends_on} />
            <div className="md:col-span-2"><Field label="Description shown on the info page" name="description" textarea defaultValue={ev.description} /></div>
          </Section>

          <Section title="Venue and contact">
            <Field label="Venue name" name="venue_name" defaultValue={ev.venue_name} />
            <Field label="Venue address" name="venue_address" defaultValue={ev.venue_address} />
            <div className="md:col-span-2"><Field label="Map link (https)" name="venue_map_url" defaultValue={ev.venue_map_url} placeholder="https://maps.app.goo.gl/…" /></div>
            <Field label="Event desk contact name" name="contact_name" defaultValue={ev.contact_name} />
            <Field label="Event desk phone" name="contact_phone" defaultValue={ev.contact_phone} />
          </Section>

          <Section title="Branding and images" hint="Paste image links. The logo replaces the initials mark; the banner appears above the home page.">
            <Field label="Logo image link" name="logo_url" defaultValue={ev.logo_url} />
            <Field label="Banner image link" name="banner_url" defaultValue={ev.banner_url} />
            <div className="md:col-span-2"><Field label="Floor plan image link" name="floor_plan_url" defaultValue={ev.floor_plan_url} /></div>
          </Section>

          <Section title="Onsite scanner" hint="After a scan, crew see name, company, category and table. Add up to two more fields, for example shirt_size or dietary.">
            <div className="md:col-span-2"><Field label="Extra fields on the scan card" name="scan_extra_fields" defaultValue={ev.scan_extra_fields.join(", ")} placeholder="shirt_size, dietary" /></div>
          </Section>
        </div>

        <Card className="p-5">
          <h2 className="text-base font-extrabold">Registration</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input type="checkbox" name="registration_open" defaultChecked={ev.registration_open} className="size-4 accent-[var(--brand)]" /> Registration is open</label>
            <Field label="Closes automatically at" name="registration_closes_at" type="datetime-local" defaultValue={isoToLocalInput(ev.registration_closes_at)} />
          </div>
          <h3 className="mt-6 text-sm font-extrabold">Questions</h3>
          <p className="mt-0.5 mb-3 text-xs text-muted">Name, email, mobile and department are always asked. Add up to {MAX_QUESTIONS} more. Leave a row blank to remove it. &ldquo;Show only when&rdquo; hides a question until another answer contains the phrase, for example show &ldquo;Room partner&rdquo; only when &ldquo;stay_overnight&rdquo; contains &ldquo;Twin&rdquo;.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                  <th className="p-1.5">#</th><th className="p-1.5">Label</th><th className="p-1.5">Key</th><th className="p-1.5">Type</th><th className="p-1.5">Required</th><th className="p-1.5">Options (comma separated)</th><th className="p-1.5">Help text</th><th className="p-1.5">Show only when</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: MAX_QUESTIONS }, (_, i) => i + 1).map((n) => {
                  const q = qs[n - 1];
                  return (
                    <tr key={n} className="border-t border-line align-top">
                      <td className="p-1.5 pt-3 text-xs text-muted">{n}</td>
                      <td className="p-1.5"><input name={`q_${n}_label`} defaultValue={q?.label ?? ""} aria-label={`Question ${n} label`} className={input} /></td>
                      <td className="p-1.5"><input name={`q_${n}_key`} defaultValue={q?.key ?? ""} aria-label={`Question ${n} key`} placeholder="auto" className={`${input} font-mono text-xs`} /></td>
                      <td className="p-1.5">
                        <select name={`q_${n}_type`} defaultValue={q?.type ?? "text"} aria-label={`Question ${n} type`} className={input}><option value="text">Text</option><option value="select">Choice</option></select>
                      </td>
                      <td className="p-1.5 pt-3 text-center"><input type="checkbox" name={`q_${n}_required`} defaultChecked={q?.required ?? false} aria-label={`Question ${n} required`} className="size-4 accent-[var(--brand)]" /></td>
                      <td className="p-1.5"><input name={`q_${n}_options`} defaultValue={q?.options?.join(", ") ?? ""} aria-label={`Question ${n} options`} className={input} /></td>
                      <td className="p-1.5"><input name={`q_${n}_description`} defaultValue={q?.description ?? ""} aria-label={`Question ${n} help text`} className={input} /></td>
                      <td className="p-1.5">
                        <div className="flex gap-1">
                          <input name={`q_${n}_show_key`} defaultValue={q?.show_when?.key ?? ""} aria-label={`Question ${n} depends on key`} placeholder="key" className={`${input} font-mono text-xs`} />
                          <input name={`q_${n}_show_value`} defaultValue={q?.show_when?.includes ?? ""} aria-label={`Question ${n} depends on value`} placeholder="contains" className={input} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="sticky bottom-0 -mx-6 flex items-center gap-3 border-t border-line bg-surface/95 px-6 py-3 backdrop-blur lg:-mx-8 lg:px-8 2xl:-mx-10 2xl:px-10">
          <SubmitButton>Save settings</SubmitButton>
          <span className="text-xs text-muted">Changes apply to the portal immediately.</span>
        </div>
      </form>

      {ev.status === "archived" && (
        <Card className="p-5">
          <h2 className="text-base font-extrabold text-danger-strong">Purge personal data</h2>
          <p className="mt-1 mb-3 text-sm text-muted">Replaces names, emails, phones, companies and extra fields across this event. Attendance counts are kept. This cannot be undone.</p>
          <form action={purgeEventAction.bind(null, ev.id)}>
            <ConfirmButton message="Purge all attendee personal data for this event? This cannot be undone." className="text-danger-strong">Purge</ConfirmButton>
          </form>
        </Card>
      )}
    </div>
  );
}
