import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAnnouncements } from "@/lib/db/announcements";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { addAnnouncementAction, deleteAnnouncementAction } from "../actions";

export const metadata = { title: "Announcements · Orange Lobby" };

export default async function AnnouncementsAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const list = await listAnnouncements(ev.id);
  return (
    <div className="space-y-6">
      <h1 className="mb-4 text-2xl font-extrabold">Announcements</h1>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <ul className="divide-y rounded-[var(--radius-card)] border border-line bg-surface text-sm">
        {list.map((a) => (
          <li key={a.id} className="flex justify-between p-3">
            <div>{a.pinned && <span className="mr-2 rounded bg-brand-soft text-brand-ink px-1 text-xs">Pinned</span>}<strong>{a.title}</strong><p className="text-muted">{a.body}</p></div>
            <form action={deleteAnnouncementAction.bind(null, ev.id, a.id)}><ConfirmButton message="Delete announcement?">Delete</ConfirmButton></form>
          </li>
        ))}
        {list.length === 0 && <li className="p-3 text-muted">None yet.</li>}
      </ul>
      <form action={addAnnouncementAction.bind(null, ev.id)} className="space-y-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <Field label="Title" name="title" /><Field label="Body" name="body" textarea />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pinned" /> Pin to top</label>
        <SubmitButton>Publish announcement</SubmitButton>
      </form>
    </div>
  );
}
