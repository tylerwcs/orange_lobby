import { CircleCheck, Circle } from "lucide-react";
import type { Activity } from "@/lib/types";
import { groupSummary, type GroupProgress } from "@/lib/groups";
import { shortDateTime } from "@/lib/text";
import { SubmissionHistory, type EditEntry } from "@/components/portal/SubmissionHistory";

/**
 * D353: what every member of a group sees on a group form, identically - where the group
 * stands, who has sent something, and every entry in full with who sent it. Used on the form's
 * own page and on My group.
 */
export async function GroupStatus({ form, group, people, selfId, compact = false, edit }: {
  form: Pick<Activity, "group_mode" | "questions">;
  group: GroupProgress;
  people: Record<string, { name: string; movedTo: string | null }>;
  selfId: string;
  /** My group lists several forms: the line and the ticks, without the entries. */
  compact?: boolean;
  /** D391: Edit on the viewer's own entries; `canEditOwn` leaves everyone else's alone. */
  edit?: EditEntry;
}) {
  const who = (id: string) => {
    const p = people[id];
    const name = id === selfId ? "You" : p?.name ?? "A former member";
    return p?.movedTo ? `${name} (now in ${p.movedTo})` : name;
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-bold">{groupSummary(group, form.group_mode)}</span>
        <span className={group.done ? "font-bold text-success-strong" : "text-muted-foreground"}>{group.done ? "Done" : "Not done"}</span>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {group.members.map((m) => (
          <li key={m.id} className="flex items-center gap-2">
            {m.submitted ? <CircleCheck aria-hidden className="size-4 text-success-strong" /> : <Circle aria-hidden className="size-4 text-muted-foreground" />}
            <span>{m.id === selfId ? `${m.name} (you)` : m.name}</span>
            <span className="text-muted-foreground">{m.submitted ? "submitted" : "not yet"}</span>
          </li>
        ))}
      </ul>
      {!compact && (
        <SubmissionHistory
          submissions={group.entries}
          questions={form.questions}
          title="Your group's submissions"
          empty="Nobody in your group has submitted yet."
          byline={(s) => `${who(s.attendee_id)} · ${shortDateTime(s.created_at)}`}
          edit={edit}
        />
      )}
    </div>
  );
}
