import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { sanitizeHtml } from "@/lib/sanitize";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { saveInfoPageAction, uploadInfoImageAction } from "../actions";
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

      {/* No side preview any more: the editor draws the page with the same styles attendees
          see, so what is on screen here is the preview. */}
      <form action={saveInfoPageAction.bind(null, ev.id)} className="grid max-w-3xl gap-4 rounded-xl border border-border bg-card p-4">
        <Field label="Page title" name="info_page_title" defaultValue={ev.info_page_title} />
        <RichTextEditor
          name="info_page_html"
          label="Content"
          defaultValue={html}
          minHeight={360}
          description="Use Section for headings attendees can scan, and Image to put a picture where your cursor is. The Info tile stays hidden until the page has content."
          uploadImage={uploadInfoImageAction.bind(null, ev.id)}
        />
        <SubmitButton>Save page</SubmitButton>
      </form>
    </div>
  );
}
