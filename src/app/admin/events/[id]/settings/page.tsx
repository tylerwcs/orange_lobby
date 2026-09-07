import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { updateSettingsAction } from "../actions";
import { isoToLocalInput } from "@/lib/time";

export default async function Settings({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  return (
    <form action={updateSettingsAction.bind(null, ev.id)} className="grid max-w-3xl gap-4 rounded border bg-white p-6 md:grid-cols-2">
      {saved && <p className="md:col-span-2 text-sm text-green-700">Saved.</p>}
      {error && <p className="md:col-span-2 text-sm text-red-700">{error}</p>}
      <Field label="Name" name="name" defaultValue={ev.name} />
      <Field label="Primary colour" name="primary_color" type="color" defaultValue={ev.primary_color} />
      <Field label="Starts on" name="starts_on" type="date" defaultValue={ev.starts_on} />
      <Field label="Ends on" name="ends_on" type="date" defaultValue={ev.ends_on} />
      <Field label="Venue name" name="venue_name" defaultValue={ev.venue_name} />
      <Field label="Venue address" name="venue_address" defaultValue={ev.venue_address} />
      <Field label="Map URL" name="venue_map_url" defaultValue={ev.venue_map_url} />
      <Field label="Contact name" name="contact_name" defaultValue={ev.contact_name} />
      <Field label="Contact phone" name="contact_phone" defaultValue={ev.contact_phone} />
      <Field label="Logo URL" name="logo_url" defaultValue={ev.logo_url} />
      <Field label="Banner URL" name="banner_url" defaultValue={ev.banner_url} />
      <Field label="Floor plan image URL" name="floor_plan_url" defaultValue={ev.floor_plan_url} />
      <div className="md:col-span-2"><Field label="Description" name="description" textarea defaultValue={ev.description} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="registration_open" defaultChecked={ev.registration_open} /> Registration open</label>
      <Field label="Registration auto-closes at" name="registration_closes_at" type="datetime-local" defaultValue={isoToLocalInput(ev.registration_closes_at)} />
      <div className="md:col-span-2">
        <Field label="Registration questions (JSON)" name="registration_questions" textarea defaultValue={JSON.stringify(ev.registration_questions, null, 2)} />
      </div>
      <Field label="Extra scan fields (max 2, comma separated attendee columns or extra keys)" name="scan_extra_fields" defaultValue={ev.scan_extra_fields.join(", ")} />
      <div className="md:col-span-2"><SubmitButton>Save</SubmitButton></div>
    </form>
  );
}
