import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPortalAttendee, isUnpublished } from "@/lib/portal";
import { getGroup, groupMembers } from "@/lib/db/groups";
import { loadActivityEntries, GroupStatus } from "@/features/activities";
import { groupFieldValues, taggedFirst } from "@/lib/groups";
import { Badge } from "@/components/ui/badge";
import { eventFields } from "@/lib/attendee-fields";

export const dynamic = "force-dynamic";

/**
 * D348: the attendee's group - who is in it, what the organiser chose to share about each of
 * them, and where the group stands on every group form. No group, no page (the tile is hidden
 * too), rather than an empty page explaining why.
 */
export default async function MyGroupPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  if (isUnpublished(event)) return null;
  // D367: hidden by the organiser closes the page too, not only its tile.
  if (!attendee.group_id || !event.group_tile) notFound();
  const [group, members, { submission: submissions, people }] = await Promise.all([
    getGroup(event.id, attendee.group_id),
    groupMembers(event.id, attendee.group_id),
    loadActivityEntries(event, attendee),
  ]);
  if (!group) notFound();
  const fields = eventFields(event.registration_questions, event.attendee_fields);
  // Group forms this attendee can take part in; an ineligible one is not their group's business (D352).
  const forms = submissions.filter((s) => s.group && s.state.reason !== "ineligible");
  const base = `/e/${slug}/a/${token}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">My group</p>
        <h1 className="text-2xl font-extrabold">{group.name}</h1>
        <p className="text-sm text-muted-foreground">{members.length} member{members.length === 1 ? "" : "s"}</p>
      </div>

      <ul className="-mx-4 divide-y border-y md:mx-0 md:rounded-xl md:border">
        {taggedFirst(members, event.group_fields, fields).map((m) => {
          const facts = groupFieldValues(m, event.group_fields, fields);
          const tags = facts.filter((f) => f.tag);
          return (
            <li key={m.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-bold">{m.name}{m.id === attendee.id && <span className="font-normal text-muted-foreground"> (you)</span>}</span>
                {tags.map((f) => <Badge key={f.label}>{f.label}</Badge>)}
              </div>
              {facts.filter((f) => !f.tag).map((f) => <div key={f.label} className="text-sm text-muted-foreground">{f.label}: {f.value}</div>)}
            </li>
          );
        })}
      </ul>

      {forms.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-extrabold">Group submissions</h2>
          {forms.map(({ form, group: progress }) => (
            <div key={form.id} className="flex flex-col gap-2 rounded-xl border p-4">
              <Link href={`${base}/activities/${form.id}`} className="font-bold hover:underline">{form.name}</Link>
              <GroupStatus form={form} group={progress!} people={people} selfId={attendee.id} compact />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
