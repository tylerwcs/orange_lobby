import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { sanitizeHtml } from "@/lib/sanitize";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveInfoPageAction, addInfoImageAction } from "../actions";
import { IMAGE_ACCEPT } from "@/lib/storage";
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
        <form action={saveInfoPageAction.bind(null, ev.id)} className="grid gap-3 rounded-xl border border-border bg-card p-4">
          <Field label="Page title" name="info_page_title" defaultValue={ev.info_page_title} />
          <label className="block text-sm">
            <span className="mb-1 block font-bold">Content</span>
            <span className="mb-2 block text-xs text-muted-foreground">HTML with p, h2, h3, ul, ol, li, a, img, strong, em and br. Attribute values need double quotes, for example &lt;a href=&quot;https://…&quot;&gt;. Anything else is stripped.</span>
            <textarea name="info_page_html" rows={22} defaultValue={ev.info_page_html ?? ""} spellCheck={false} className="w-full rounded-md border border-border bg-card p-3 font-mono text-xs leading-relaxed" />
          </label>
          {/* Inside this form on purpose: the upload posts the textarea's CURRENT value
              along with the file, so the tag is appended to what the organiser is looking
              at rather than to the last saved version (D160). */}
          <div className="grid gap-2 rounded-lg border border-dashed border-border p-3">
            <span className="text-sm font-bold">Add an image</span>
            <span className="text-xs text-muted-foreground">
              Uploads and drops an &lt;img&gt; tag at the end of the content above. Move the tag to put it elsewhere.
            </span>
            <input
              type="file"
              name="info_image"
              accept={IMAGE_ACCEPT}
              className="block w-full text-xs file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-bold"
            />
            {/* An auto-written alt="" tells a screen reader the image is decorative. That is
                occasionally true and usually not, and this is the only moment somebody knows
                which. Left blank it stays empty, which is the honest default for a flourish. */}
            <Field label="Describe this image" name="info_image_alt" placeholder="Ballroom floor plan" />
            <SubmitButton formAction={addInfoImageAction.bind(null, ev.id)} variant="outline">
              Upload and insert
            </SubmitButton>
          </div>
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
