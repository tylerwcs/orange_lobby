import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAnnouncements } from "@/lib/db/announcements";
import { shortDateTime } from "@/lib/text";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { addAnnouncementAction, deleteAnnouncementAction } from "../actions";

export const metadata = { title: "Announcements · Orange Lobby" };

export default async function AnnouncementsAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const list = await listAnnouncements(ev.id);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Announcements</h1>
        <p className="text-sm text-muted">The pinned one, or else the newest, shows as a banner on the portal home.</p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card>
          <ul className="divide-y divide-line text-sm">
            {list.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{a.title}</span>
                    {a.pinned && <Badge tone="brand">Pinned</Badge>}
                    <span className="text-xs text-muted">{shortDateTime(a.created_at)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-muted">{a.body}</p>
                </div>
                <form action={deleteAnnouncementAction.bind(null, ev.id, a.id)}><ConfirmButton message={`Delete "${a.title}"?`}>Delete</ConfirmButton></form>
              </li>
            ))}
            {list.length === 0 && <li className="p-6 text-muted">Nothing published yet. Attendees see announcements on their home screen and under News.</li>}
          </ul>
        </Card>

        <form action={addAnnouncementAction.bind(null, ev.id)} className="grid gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 xl:sticky xl:top-6">
          <h2 className="text-base font-extrabold">New announcement</h2>
          <Field label="Title" name="title" placeholder="Breakouts moved to Level 3" />
          <Field label="Message" name="body" textarea />
          <label className="flex min-h-10 items-center gap-2 text-sm font-bold"><input type="checkbox" name="pinned" className="size-4 accent-[var(--brand)]" /> Pin to the top</label>
          <SubmitButton>Publish announcement</SubmitButton>
          <p className="text-xs text-muted">Attendees see it the next time they open the portal. There is no push notification.</p>
        </form>
      </div>
    </div>
  );
}
