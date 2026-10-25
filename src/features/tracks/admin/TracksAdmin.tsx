import { SubmitButton } from "@/components/admin/SubmitButton";
import { splitTracks, trackOf } from "../lib";
import { setTrackAdminAction } from "./actions";
import type { Attendee } from "@/lib/types";
import type { TrackPair, TrackRow } from "../types";

const select = "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
/** D724: amber under the target, green at it, red over. */
const pill = (n: number, target: number) =>
  n > target ? "bg-destructive/10 text-destructive" : n === target ? "bg-success-soft text-success-strong" : "bg-warning-soft text-warning";

/**
 * D723: the committee's view of every team's tracks - the counts against the target, then each
 * member with a No track / Track A / Track B select and its own Save. Captains do the same from
 * My team on the portal; this is for anyone left over, or a fix.
 */
export function TracksAdmin({ eventId, activityId, pair, labels, groups, members, rows }: {
  eventId: string; activityId: string; pair: TrackPair; labels: { a: string; b: string };
  groups: { id: string; name: string }[]; members: Attendee[]; rows: TrackRow[];
}) {
  const teams = [...groups].sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }))
    .map((g) => ({ g, people: members.filter((m) => m.group_id === g.id && !m.cancelled_at).sort((x, y) => x.name.localeCompare(y.name)) }))
    .filter((t) => t.people.length > 0);
  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Track A is {labels.a}, Track B is {labels.b}. Aim for {pair.target} on each; going over is allowed. Captains change these from My team on their own page.
      </p>
      {teams.map(({ g, people }) => {
        const split = splitTracks(pair, rows, people);
        return (
          <div key={g.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="mr-1 text-base font-extrabold">{g.name}</h3>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${pill(split.a.length, pair.target)}`}>A {split.a.length}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${pill(split.b.length, pair.target)}`}>B {split.b.length}</span>
              {split.none.length > 0 && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-bold tabular-nums text-warning">No track {split.none.length}</span>}
            </div>
            <ul className="flex flex-col divide-y rounded-lg border">
              {people.map((m) => {
                const t = trackOf(rows, m);
                const value = t === pair.a_activity_id ? "a" : t === pair.b_activity_id ? "b" : "";
                return (
                  <li key={m.id} className="px-3 py-2 text-sm">
                    <form key={value} action={setTrackAdminAction.bind(null, eventId, activityId, m.id)} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-semibold">{m.name}</span>
                      <select name="track" defaultValue={value} aria-label={`${m.name}'s track`} className={select}>
                        <option value="">No track</option>
                        <option value="a">Track A · {labels.a}</option>
                        <option value="b">Track B · {labels.b}</option>
                      </select>
                      <SubmitButton size="sm" variant="outline">Save</SubmitButton>
                    </form>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
