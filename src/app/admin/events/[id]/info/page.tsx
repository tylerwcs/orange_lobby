import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listInfoTabs } from "@/lib/db/info-tabs";
import { hasVenue } from "@/lib/info-tabs";
import { sanitizeHtml } from "@/lib/sanitize";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { SortableList } from "@/components/admin/SortableList";
import { Modal } from "@/components/admin/Modal";
import { Badge } from "@/components/ui/badge";
import { AdminHeader } from "@/components/admin/AdminHeader";
import {
  saveInfoTitleAction, addInfoTabAction, saveInfoTabAction, deleteInfoTabAction, reorderInfoTabsAction, uploadInfoImageAction,
} from "../actions";

export const metadata = { title: "Info page" };

/**
 * The Info section (D207): its title, its tabs in the order attendees see them, and the one
 * tab being edited. One tab's editor at a time, chosen by `?tab=`, so saving one tab can never
 * carry another tab's unsaved text along with it.
 */
export default async function InfoAdmin({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const tabs = await listInfoTabs(ev.id);
  const editing = tabs.find((t) => t.id === tab) ?? null;
  const base = `/admin/events/${ev.id}/info`;

  return (
    <div className="space-y-6">
      <AdminHeader title="Info page" subtitle="Tabs attendees switch between under Info. The Venue tab comes from Settings." />
      <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <form action={saveInfoTitleAction.bind(null, ev.id)} className="grid gap-3 rounded-xl border border-border bg-card p-4">
            <Field label="Section title" name="info_page_title" defaultValue={ev.info_page_title} description="The Info tile's label and the page heading." />
            <SubmitButton variant="outline">Save title</SubmitButton>
          </form>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-1 text-sm font-bold">Tabs</div>
            {hasVenue(ev) && (
              // Fixed first and not stored (D204): the attendee sees it before every custom tab.
              <div className="flex items-center justify-between gap-2 border-b border-border py-3 text-sm">
                <span><span className="font-bold">Venue</span> <span className="text-muted-foreground">· from Settings</span></span>
                <Link href={`/admin/events/${ev.id}/settings`} className="font-semibold text-primary underline">Edit in Settings</Link>
              </div>
            )}
            <SortableList
              rows={tabs.map((t) => ({
                key: t.id,
                label: t.title,
                node: (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`${base}?tab=${t.id}`} className={`min-w-0 truncate font-bold ${t.id === editing?.id ? "text-primary" : ""}`}>{t.title}</Link>
                    <div className="flex shrink-0 items-center gap-1">
                      {!t.html && <Badge variant="secondary">Empty</Badge>}
                      <form action={deleteInfoTabAction.bind(null, ev.id, t.id)}>
                        <ConfirmButton message={`Delete “${t.title}”? Its content goes with it.`}>Delete</ConfirmButton>
                      </form>
                    </div>
                  </div>
                ),
              }))}
              reorder={reorderInfoTabsAction.bind(null, ev.id)}
              empty="No tabs yet. Add the first one below."
            />
            <div className="border-t border-border pt-3">
              <Modal title="Add a tab" hint="Name it for what attendees look for — Travel, Dress code, FAQ." trigger="Add tab" icon="plus">
                <form action={addInfoTabAction.bind(null, ev.id)} className="grid gap-4 p-1">
                  <Field label="Title" name="title" placeholder="Travel" />
                  <SubmitButton>Add tab</SubmitButton>
                </form>
              </Modal>
            </div>
          </div>
        </div>

        {editing ? (
          // Keyed by tab: switching tabs must remount the editor, or it would keep the last tab's text.
          <form key={editing.id} action={saveInfoTabAction.bind(null, ev.id, editing.id)} className="grid gap-4 rounded-xl border border-border bg-card p-4">
            <Field label="Tab title" name="title" defaultValue={editing.title} />
            <RichTextEditor
              name="html"
              label="Content"
              defaultValue={sanitizeHtml(editing.html ?? "")}
              minHeight={360}
              description="Use Section for headings attendees can scan, and Image to put a picture where your cursor is. A tab with no content is hidden from attendees."
              uploadImage={uploadInfoImageAction.bind(null, ev.id)}
            />
            <SubmitButton>Save tab</SubmitButton>
          </form>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
            {tabs.length ? "Choose a tab on the left to edit it." : "Add a tab to start writing."}
          </div>
        )}
      </div>
    </div>
  );
}
