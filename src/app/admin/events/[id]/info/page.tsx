import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { sanitizeHtml } from "@/lib/sanitize";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveInfoPageAction } from "../actions";
import { AdminHeader } from "@/components/admin/AdminHeader";

export const metadata = { title: "Info page · Orange Lobby" };

export default async function InfoAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const html = sanitizeHtml(ev.info_page_html ?? "");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <AdminHeader title="Info page" subtitle="Shown under the Info tile when it has content. Venue and contact come from Settings." />
      </div>

      <div className="@container"><div className="grid items-start gap-6 @4xl:grid-cols-2">
        <form action={saveInfoPageAction.bind(null, ev.id)} className="grid gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <Field label="Page title" name="info_page_title" defaultValue={ev.info_page_title} />
          <label className="block text-sm">
            <span className="mb-1 block font-bold">Content</span>
            <span className="mb-2 block text-xs text-muted-foreground">HTML with p, h2, h3, ul, ol, li, a, img, strong, em and br. Attribute values need double quotes, for example &lt;a href=&quot;https://…&quot;&gt;. Anything else is stripped.</span>
            <textarea name="info_page_html" rows={22} defaultValue={ev.info_page_html ?? ""} spellCheck={false} className="w-full rounded-[var(--radius-control)] border border-line bg-surface p-3 font-mono text-xs leading-relaxed" />
          </label>
          <SubmitButton>Save page</SubmitButton>
        </form>

        <Card className="xl:sticky xl:top-6">
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>The saved version, as attendees see it. Save to refresh.</CardDescription>
          </CardHeader>
          <CardContent>
          <div className="mx-auto max-w-sm rounded-xl bg-muted p-4">
            <div className="mb-3 text-xl font-extrabold">{ev.info_page_title}</div>
            {html ? <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="text-sm text-muted-foreground">Nothing to show yet; the Info tile stays hidden until the page has content.</p>}
          </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}
