import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAnnouncements } from "@/lib/db/announcements";
import { shortDateTime } from "@/lib/text";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { addAnnouncementAction, deleteAnnouncementAction } from "../actions";
import { AdminHeader } from "@/components/admin/AdminHeader";

export const metadata = { title: "Announcements · Orange Lobby" };

export default async function AnnouncementsAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const list = await listAnnouncements(ev.id);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <AdminHeader title="Announcements" subtitle="The pinned one, or else the newest, shows as a banner on the portal home." />
      </div>

      <div className="@container"><div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card>
          <CardContent className="px-0">
          <ul className="divide-y text-sm">
            {list.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{a.title}</span>
                    {a.pinned && <Badge>Pinned</Badge>}
                    <span className="text-xs text-muted-foreground">{shortDateTime(a.created_at)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-muted-foreground">{a.body}</p>
                </div>
                <form action={deleteAnnouncementAction.bind(null, ev.id, a.id)}><ConfirmButton message={`Delete "${a.title}"?`}>Delete</ConfirmButton></form>
              </li>
            ))}
            {list.length === 0 && (
              <li>
                <Empty className="border-0 bg-transparent">
                  <EmptyHeader>
                    <EmptyTitle>Nothing published yet</EmptyTitle>
                    <EmptyDescription>Attendees see announcements on their home screen and under News.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </li>
            )}
          </ul>
          </CardContent>
        </Card>

        <form action={addAnnouncementAction.bind(null, ev.id)} className="grid gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10 xl:sticky xl:top-6">
          <h2 className="font-semibold">New announcement</h2>
          <Field label="Title" name="title" placeholder="Breakouts moved to Level 3" />
          <Field label="Message" name="body" textarea />
          <label className="flex min-h-10 items-center gap-2 text-sm font-bold"><input type="checkbox" name="pinned" className="size-4 accent-primary" /> Pin to the top</label>
          <SubmitButton>Publish announcement</SubmitButton>
          <p className="text-xs text-muted-foreground">Attendees see it the next time they open the portal. There is no push notification.</p>
        </form>
      </div>
      </div>
    </div>
  );
}
