import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Card } from "@/components/ui/Card";
import { updateSettingsAction } from "../actions";
import { isoToLocalInput } from "@/lib/time";
import { MAX_QUESTIONS } from "@/lib/questions-form";

export const metadata = { title: "Settings · Orange Lobby" };

const input = "w-full min-h-10 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-sm";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="text-base font-extrabold">{title}</h2>
      {hint && <p className="mt-0.5 mb-3 text-xs text-muted">{hint}</p>}
      <div className={`grid gap-4 ${hint ? "" : "mt-3"} md:grid-cols-2`}>{children}</div>
    </Card>
  );
}

export default async function Settings({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const qs = ev.registration_questions;
  return (
    <form action={updateSettingsAction.bind(null, ev.id)} className="max-w-5xl space-y-4">
      <h1 className="text-2xl font-extrabold">Settings</h1>
      {saved && <p role="status" className="rounded-[var(--radius-control)] bg-green-50 p-3 text-sm text-green-800">Saved.</p>}
      {error && <p role="alert" className="rounded-[var(--radius-control)] bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid gap-4 xl:grid-cols-2">
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
          <label className="flex min-h-10 items-center gap-2 text-sm font-bold"><input type="checkbox" name="registration_open" defaultChecked={ev.registration_open} className="size-4 accent-[var(--brand)]" /> Registration is open</label>
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

      <div className="sticky bottom-0 -mx-6 flex items-center gap-3 border-t border-line bg-surface/95 px-6 py-3 backdrop-blur">
        <SubmitButton>Save settings</SubmitButton>
        <span className="text-xs text-muted">Changes apply to the portal immediately.</span>
      </div>
    </form>
  );
}
