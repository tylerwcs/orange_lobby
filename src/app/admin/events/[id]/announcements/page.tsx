import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAnnouncements } from "@/lib/db/announcements";
import { shortDateTime } from "@/lib/text";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
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
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <AdminHeader title="Announcements" subtitle="Attendees see them in this order. The home banner shows the pinned one, or else the first." />
      </div>

      <div className="@container"><div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_400px]">
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
              // The organiser's order is the order attendees read (D249), so the list is the
              // same drag-and-arrow list as info tabs and agenda rows.
              <SortableList
                rows={list.map((a) => ({
                  key: a.id,
                  label: a.title,
                  node: (
                    <div className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold">{a.title}</span>
                          {a.pinned && <Badge>Pinned</Badge>}
                          {/* The organiser's only way to tell two alike apart; attendees no longer see it. */}
                          <span className="text-xs text-muted-foreground">{shortDateTime(a.created_at)}</span>
                        </div>
                        <p className="mt-1 line-clamp-3 whitespace-pre-line text-muted-foreground">{a.body}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Modal title="Edit announcement" trigger="Edit" variant="ghost">
                          <form action={updateAnnouncementAction.bind(null, ev.id, a.id)} className="grid gap-3">
                            <Field label="Title" name="title" defaultValue={a.title} />
                            <Field label="Message" name="body" textarea defaultValue={a.body} />
                            <label className="flex min-h-10 items-center gap-2 text-sm font-bold">
                              <input type="checkbox" name="pinned" defaultChecked={a.pinned} className="size-4 accent-primary" /> {PIN_LABEL}
                            </label>
                            <SubmitButton>Save</SubmitButton>
                          </form>
                        </Modal>
                        <form action={deleteAnnouncementAction.bind(null, ev.id, a.id)}><ConfirmButton message={`Delete "${a.title}"?`}>Delete</ConfirmButton></form>
                      </div>
                    </div>
                  ),
                }))}
                reorder={reorderAnnouncementsAction.bind(null, ev.id)}
                empty="Nothing published yet."
              />
            )}
          </CardContent>
        </Card>

        <form action={addAnnouncementAction.bind(null, ev.id)} className="grid gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10 xl:sticky xl:top-6">
          <h2 className="font-semibold">New announcement</h2>
          <Field label="Title" name="title" placeholder="Breakouts moved to Level 3" />
          <Field label="Message" name="body" textarea />
          <label className="flex min-h-10 items-center gap-2 text-sm font-bold"><input type="checkbox" name="pinned" className="size-4 accent-primary" /> {PIN_LABEL}</label>
          <SubmitButton>Publish announcement</SubmitButton>
          <p className="text-xs text-muted-foreground">It goes to the top of the list. Attendees see it the next time they open the portal. There is no push notification.</p>
        </form>
      </div>
      </div>
    </div>
  );
}
