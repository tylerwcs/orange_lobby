import Link from "next/link";
import { notFound } from "next/navigation";
import { getGroup, groupMembers } from "@/lib/db/groups";
import { loadActivityEntries, GroupStatus } from "@/features/activities";
import { groupFieldValues, taggedFirst } from "@/lib/groups";
import { Badge } from "@/components/ui/badge";
import { eventFields } from "@/lib/attendee-fields";
import type { Attendee, Event } from "@/lib/types";

/**
 * D348: the attendee's group - who is in it, what the organiser chose to share about each of
 * them, and where the group stands on every group form. D510: unchanged as the Groups page's
 * My group tab; `titled` means the page above already has its h1.
 */
export async function MyGroup({ event, attendee, base, titled }: {
  event: Event;
  attendee: Attendee;
  base: string;
  titled: boolean;
}) {
  const groupId = attendee.group_id;
  if (!groupId) notFound();
  const [group, members, { submission: submissions, people }] = await Promise.all([
    getGroup(event.id, groupId),
    groupMembers(event.id, groupId),
    loadActivityEntries(event, attendee),
  ]);
  if (!group) notFound();
  const fields = eventFields(event.registration_questions, event.attendee_fields);
  // Group forms this attendee can take part in; an ineligible one is not their group's business (D352).
  const forms = submissions.filter((s) => s.group && s.state.reason !== "ineligible");
  const Heading = titled ? "h2" : "h1";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">My group</p>
        <Heading className="text-2xl font-extrabold">{group.name}</Heading>
        <p className="text-sm text-muted-foreground">{members.length} member{members.length === 1 ? "" : "s"}</p>
      </div>

      {/* Under the tab strip the swipe pane clips sideways, so the phone edge-to-edge bleed becomes a card. */}
      <ul className={titled ? "divide-y rounded-xl border" : "-mx-4 divide-y border-y md:mx-0 md:rounded-xl md:border"}>
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
