import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { saveInfoPageAction } from "../actions";

export const metadata = { title: "Info page · Orange Lobby" };

export default async function InfoAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  return (
    <form action={saveInfoPageAction.bind(null, ev.id)} className="max-w-3xl space-y-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <h1 className="mb-4 text-2xl font-extrabold">Info page</h1>
      {saved && <p className="text-sm text-green-700">Saved.</p>}
      <Field label="Page title" name="info_page_title" defaultValue={ev.info_page_title} />
      <label className="block text-sm"><span className="mb-1 block font-medium">Content (HTML: p, h2, h3, ul, li, a, img, strong, em, br)</span>
        <span className="mb-1 block text-xs text-muted">Attribute values must use double quotes, e.g. &lt;a href=&quot;https://...&quot;&gt;</span>
        <textarea name="info_page_html" rows={18} defaultValue={ev.info_page_html ?? ""} className="w-full rounded-[var(--radius-control)] border border-line p-2 font-mono text-xs" /></label>
      <SubmitButton>Save</SubmitButton>
    </form>
  );
}
