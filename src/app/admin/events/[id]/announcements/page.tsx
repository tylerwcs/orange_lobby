import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAnnouncements } from "@/lib/db/announcements";
import { shortDateTime } from "@/lib/text";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { RowActions } from "@/components/admin/RowActions";
import { Modal } from "@/components/admin/Modal";
import { SortableList } from "@/components/admin/SortableList";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { addAnnouncementAction, deleteAnnouncementAction, reorderAnnouncementsAction, updateAnnouncementAction } from "../actions";
import { AdminHeader } from "@/components/admin/AdminHeader";

export const metadata = { title: "Announcements" };

const PIN_LABEL = "Pin: highlight it, and show it on the home banner";

export default async function AnnouncementsAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const list = await listAnnouncements(ev.id);
  const form = (a?: (typeof list)[number]) => (
    <form action={a ? updateAnnouncementAction.bind(null, ev.id, a.id) : addAnnouncementAction.bind(null, ev.id)} className="grid gap-3 p-1">
      <Field label="Title" name="title" defaultValue={a?.title} placeholder="Breakouts moved to Level 3" />
      <Field label="Message" name="body" textarea defaultValue={a?.body} />
      <label className="flex min-h-10 items-center gap-2 text-sm font-bold">
        <input type="checkbox" name="pinned" defaultChecked={a?.pinned} className="size-4 accent-primary" /> {PIN_LABEL}
      </label>
      <SubmitButton>{a ? "Save" : "Publish announcement"}</SubmitButton>
    </form>
  );

  // Laid out like the other lists (Modules, Activities): "New" in the header, the list in one
  // card, one ⋯ menu per row.
  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title="Announcements"
        subtitle="Attendees see them in this order. The home banner cycles through them, the pinned one first."
        actions={
          <Modal title="New announcement" hint="It goes to the top of the list. Attendees see it the next time they open the portal; there is no push notification." trigger="New announcement" icon="plus" variant="default">
            {form()}
          </Modal>
        }
      />

      <Card>
        <CardContent className="px-4">
          {list.length === 0 ? (
            <Empty className="border-0 bg-transparent">
              <EmptyHeader>
                <EmptyTitle>Nothing published yet</EmptyTitle>
                <EmptyDescription>Attendees see announcements on their home screen and under News.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            // The organiser's order is the order attendees read (D249).
            <SortableList
              rows={list.map((a) => ({
                key: a.id,
                label: a.title,
                node: (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">{a.title}</span>
                        {a.pinned && <Badge>Pinned</Badge>}
                        {/* The organiser's only way to tell two alike apart; attendees no longer see it. */}
                        <span className="text-xs text-muted-foreground">{shortDateTime(a.created_at)}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 whitespace-pre-line text-muted-foreground">{a.body}</p>
                    </div>
                    <RowActions
                      name={`“${a.title}”`}
                      edit={{ title: "Edit announcement", form: form(a) }}
                      remove={{ action: deleteAnnouncementAction.bind(null, ev.id, a.id), message: "Attendees stop seeing it straight away." }}
                    />
                  </div>
                ),
              }))}
              reorder={reorderAnnouncementsAction.bind(null, ev.id)}
              empty="Nothing published yet."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
