import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { sanitizeHtml } from "@/lib/sanitize";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Card } from "@/components/ui/Card";
import { saveInfoPageAction } from "../actions";

export const metadata = { title: "Info page · Orange Lobby" };

export default async function InfoAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const html = sanitizeHtml(ev.info_page_html ?? "");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Info page</h1>
        <p className="text-sm text-muted">Shown under the Info tile when it has content. Venue and contact come from Settings.</p>
      </div>
      {saved && <p role="status" className="rounded-[var(--radius-control)] bg-green-50 p-3 text-sm text-green-800">Saved.</p>}

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <form action={saveInfoPageAction.bind(null, ev.id)} className="grid gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <Field label="Page title" name="info_page_title" defaultValue={ev.info_page_title} />
          <label className="block text-sm">
            <span className="mb-1 block font-bold">Content</span>
            <span className="mb-2 block text-xs text-muted">HTML with p, h2, h3, ul, ol, li, a, img, strong, em and br. Attribute values need double quotes, for example &lt;a href=&quot;https://…&quot;&gt;. Anything else is stripped.</span>
            <textarea name="info_page_html" rows={22} defaultValue={ev.info_page_html ?? ""} spellCheck={false} className="w-full rounded-[var(--radius-control)] border border-line bg-surface p-3 font-mono text-xs leading-relaxed" />
          </label>
          <SubmitButton>Save page</SubmitButton>
        </form>

        <Card className="p-4 xl:sticky xl:top-6">
          <h2 className="text-base font-extrabold">Preview</h2>
          <p className="mb-3 text-xs text-muted">The saved version, as attendees see it. Save to refresh.</p>
          <div className="mx-auto max-w-sm rounded-[var(--radius-card)] border border-line bg-canvas p-4">
            <div className="mb-3 text-xl font-extrabold">{ev.info_page_title}</div>
            {html ? <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="text-sm text-muted">Nothing to show yet; the Info tile stays hidden until the page has content.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
