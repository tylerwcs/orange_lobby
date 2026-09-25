import { requireAdmin } from "@/lib/auth";
import { formKey } from "@/lib/form-key";
import { requireEvent } from "@/lib/db/events";
import { listInfoTabs } from "@/lib/db/info-tabs";
import { sanitizeHtml } from "@/lib/sanitize";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { SaveBar } from "@/components/admin/SaveBar";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { Modal } from "@/components/admin/Modal";
import { InfoTabMenu } from "@/components/admin/InfoTabMenu";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { PendingLink, PendingScope, PendingSwap } from "@/components/PendingNav";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeletons";
import {
  saveInfoTitleAction, addInfoTabAction, saveInfoTabAction, deleteInfoTabAction, reorderInfoTabsAction, uploadInfoImageAction,
  saveSectionIconAction,
} from "../actions";
import { SectionIconForm } from "@/components/admin/SectionIconForm";
import { sectionIcons } from "@/lib/launcher";

export const metadata = { title: "Info page" };

/**
 * The Info section (D207), laid out the way attendees meet it: its tabs across the top in
 * their order, and the chosen tab's editor under them. The section's own settings — its title
 * and its round button's picture — change once per event, so they sit behind the settings
 * button rather than taking a column beside the writing.
 *
 * One tab's editor at a time, chosen by `?tab=` (the first when none is named), so saving one
 * tab can never carry another tab's unsaved text along with it.
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
  const editing = tabs.find((t) => t.id === tab) ?? tabs[0] ?? null;
  const base = `/admin/events/${ev.id}/info`;

  const addTab = (
    <Modal title="Add a tab" hint="Name it for what attendees look for — Travel, Dress code, FAQ." trigger="Add tab" icon="plus" variant={tabs.length ? "ghost" : "default"}>
      <form action={addInfoTabAction.bind(null, ev.id)} className="grid gap-4 p-1">
        <Field label="Title" name="title" placeholder="Travel" />
        <SubmitButton>Add tab</SubmitButton>
      </form>
    </Modal>
  );

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title="Info page"
        subtitle={`Tabs attendees switch between under “${ev.info_page_title}” on the portal.`}
        actions={
          <Modal title="Info section" hint="What the section is called, and the round button attendees tap on the portal home." trigger="Info section settings" icon="settings" iconOnly>
            <div className="grid gap-6">
              <form action={saveInfoTitleAction.bind(null, ev.id)} className="grid gap-3 p-1">
                <Field label="Section title" name="info_page_title" defaultValue={ev.info_page_title} description="The Info button's label and the page heading." />
                <SubmitButton variant="outline">Save title</SubmitButton>
              </form>
              <div className="border-t border-border pt-4">
                <SectionIconForm action={saveSectionIconAction.bind(null, ev.id, "info")} section="info" current={sectionIcons(ev.section_icons).info} />
              </div>
            </div>
          </Modal>
        }
      />

      {!editing ? (
        <Card>
          <CardContent>
            <Empty className="border-0 bg-transparent">
              <EmptyHeader>
                <EmptyTitle>No tabs yet</EmptyTitle>
                <EmptyDescription>Add a tab for each thing attendees look up — Travel, Dress code, FAQ. Each one is a tab on the portal.</EmptyDescription>
              </EmptyHeader>
              {addTab}
            </Empty>
          </CardContent>
        </Card>
      ) : (
        // `?tab=` changes no route segment, so no loading.tsx sees it; the scope marks the
        // chosen tab at once and swaps the editor for a skeleton until it arrives.
        <PendingScope>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Info tabs" className="inline-flex max-w-full overflow-x-auto rounded-lg bg-muted p-[3px]">
              {tabs.map((t) => (
                <PendingLink
                  key={t.id}
                  href={`${base}?tab=${t.id}`}
                  selected={t.id === editing.id}
                  className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  selectedClassName="bg-background text-foreground shadow-sm"
                  unselectedClassName="text-foreground/60 hover:text-foreground"
                >
                  {t.title}
                  {/* Hidden from attendees until it has content (hasInfo), so say so here. */}
                  {!t.html?.trim() && <span className="rounded-full bg-muted-foreground/15 px-1.5 text-[11px] font-semibold text-muted-foreground">Empty</span>}
                </PendingLink>
              ))}
            </nav>
            {addTab}
          </div>

          <PendingSwap fallback={<Skeleton className="h-[34rem] rounded-xl" />}>
            {/* Keyed by tab, so switching tabs remounts the editor rather than keeping the last
                tab's text, and by its saved text (formKey), so a save starts it afresh. */}
            <form key={`${editing.id}:${formKey([editing.title, editing.html])}`} action={saveInfoTabAction.bind(null, ev.id, editing.id)} className="flex flex-col gap-4">
              <Card>
                <CardContent className="grid gap-4">
                  <div className="flex items-end gap-3">
                    <div className="min-w-0 flex-1"><Field label="Tab title" name="title" defaultValue={editing.title} /></div>
                    <InfoTabMenu
                      title={editing.title}
                      ids={tabs.map((t) => t.id)}
                      index={tabs.findIndex((t) => t.id === editing.id)}
                      portalHref={`/e/${ev.slug}/info?tab=${editing.id}`}
                      reorder={reorderInfoTabsAction.bind(null, ev.id)}
                      remove={deleteInfoTabAction.bind(null, ev.id, editing.id)}
                    />
                  </div>
                  <RichTextEditor
                    name="html"
                    label="Content"
                    defaultValue={sanitizeHtml(editing.html ?? "")}
                    minHeight={420}
                    description="Use Section for headings attendees can scan, and Image to put a picture where your cursor is."
                    uploadImage={uploadInfoImageAction.bind(null, ev.id)}
                  />
                </CardContent>
              </Card>
              <SaveBar label="Save tab" note="Attendees see it as soon as it is saved. A tab with no content stays hidden." />
            </form>
          </PendingSwap>
        </PendingScope>
      )}
    </div>
  );
}
