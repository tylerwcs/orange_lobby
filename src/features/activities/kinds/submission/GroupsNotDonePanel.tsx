export type NotDoneGroup = { id: string; name: string; summary: string; waitingOn: string[] };

/**
 * D360: on a group form, who the desk chases is a group, not a person. Each group that is not
 * done, with where it stands and - in every-member mode - who it is waiting on. A list, not a
 * control, for MissingPanel's reason: nobody submits on an attendee's behalf (D175).
 */
export function GroupsNotDonePanel({ groups, ungrouped }: { groups: NotDoneGroup[]; ungrouped: number }) {
  return (
    <div className="flex flex-col gap-3">
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Every group is done.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {groups.map((g) => (
            <li key={g.id} className="px-3 py-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{g.name}</span>
                <span className="tabular-nums text-muted-foreground">{g.summary}</span>
              </div>
              {g.waitingOn.length > 0 && <div className="mt-0.5 text-muted-foreground">Waiting on {g.waitingOn.join(", ")}</div>}
            </li>
          ))}
        </ul>
      )}
      {ungrouped > 0 && (
        <p className="text-xs text-muted-foreground">
          {ungrouped} attendee{ungrouped === 1 ? "" : "s"} who could take part {ungrouped === 1 ? "is" : "are"} in no group, so can&apos;t submit. Put them in one on the Groups page.
        </p>
      )}
    </div>
  );
}
