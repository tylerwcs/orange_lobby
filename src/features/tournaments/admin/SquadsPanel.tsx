import Link from "next/link";
import type { Activity, Event } from "@/lib/types";
import { listGroups } from "@/lib/db/groups";
import { listAttendees } from "@/lib/db/attendees";
import { categoryMatches } from "@/lib/agenda";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RowActions } from "@/components/admin/RowActions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { listSports, squadPeople, squadRows } from "../db/tournaments";
import { alsoIn, countedRows, isLocked, squadMembers, squadState, type SquadStateKey } from "../lib/squads";
import { adminAddPlayerAction, adminRemovePlayerAction, adminSwapPlayerAction } from "./actions";

const select = "h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const TONE: Record<SquadStateKey, "success" | "warning" | "destructive"> = {
  full: "success", ready: "success", short: "warning", forfeit: "warning", over: "destructive",
};

/**
 * D648: one sport at a time, every group's squad with its names and state. Each row's ⋯ Edit opens
 * that squad: remove or swap anyone, add anyone from the group. An organiser may go past the
 * deadline and over max (D642); the row then reads Over.
 */
export async function SquadsPanel({ ev, activity, sportId }: { ev: Event; activity: Activity; sportId?: string }) {
  const [sports, groups, rows, attendees] = await Promise.all([listSports(activity.id), listGroups(ev.id), squadRows(activity.id), listAttendees(ev.id)]);
  if (sports.length === 0) {
    return (
      <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Add a sport first, on the <Link href={`/admin/events/${ev.id}/activities/${activity.id}?tab=sports`} className="font-semibold text-primary underline-offset-4 hover:underline">Sports tab</Link>.
      </p>
    );
  }
  const counted = countedRows(rows, await squadPeople(ev.id, rows.map((r) => r.attendee_id)));
  const locked = isLocked(activity.squads_close_at, new Date());
  const sport = sports.find((s) => s.id === sportId) ?? sports[0];
  const name = new Map(attendees.map((a) => [a.id, a.name]));
  const eligible = attendees.filter((a) => a.group_id && categoryMatches(activity.categories, a.category));
  const states = (s: typeof sport) => groups.map((g) => squadState(squadMembers(counted, s.id, g.id).length, s, locked).key);
  const lacking = (s: typeof sport) => states(s).filter((k) => k === "short" || k === "forfeit").length;
  const here = states(sport);
  const ready = here.filter((k) => k === "full" || k === "ready").length;
  const over = here.filter((k) => k === "over").length;
  const word = locked ? "forfeit" : "short";
  const href = (id: string) => `/admin/events/${ev.id}/activities/${activity.id}?tab=squads&sport=${id}`;

  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Sports" className="flex flex-wrap gap-1.5">
        {sports.map((s) => {
          const n = lacking(s);
          return (
            <Link key={s.id} href={href(s.id)} aria-current={s.id === sport.id ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${s.id === sport.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
              {s.name}{n > 0 && <span className="font-normal"> · {n} {word}</span>}
            </Link>
          );
        })}
      </nav>
      <p className="text-sm text-muted-foreground">
        {groups.length} group{groups.length === 1 ? "" : "s"} · {ready} ready · {lacking(sport)} {word}
        {over > 0 && ` · ${over} over`}
      </p>
      {groups.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">No groups yet. Squads are by group: add groups on the Groups page.</p>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Group</TableHead>
                <TableHead>Players</TableHead>
                <TableHead>State</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => {
                const ids = squadMembers(counted, sport.id, g.id);
                const state = squadState(ids.length, sport, locked);
                const inSquad = new Set(ids);
                const options = eligible.filter((a) => a.group_id === g.id && !inSquad.has(a.id)).map((a) => {
                  const other = alsoIn(a.id, counted, sports, sport.id);
                  return { id: a.id, label: other.length ? `${a.name} · also in ${other.join(", ")}` : a.name };
                });
                const picker = (
                  <select name="attendee" required aria-label="Player" className={select} defaultValue="">
                    <option value="" disabled>Pick a member</option>
                    {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                );
                return (
                  <TableRow key={g.id}>
                    <TableCell className="font-semibold">{g.name}</TableCell>
                    <TableCell className="min-w-48 whitespace-normal">{ids.length ? ids.map((id) => name.get(id) ?? "—").join(", ") : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell><Badge variant={TONE[state.key]}>{state.label}</Badge></TableCell>
                    <TableCell className="w-12 text-right">
                      <RowActions
                        name={`${g.name}'s ${sport.name} squad`}
                        edit={{
                          title: `${g.name} · ${sport.name}`,
                          hint: `${ids.length} of ${sport.min_size === sport.max_size ? sport.min_size : `${sport.min_size}–${sport.max_size}`}. Organisers can change squads at any time, even past the size.`,
                          form: (
                            <div className="flex flex-col gap-4">
                              {ids.map((id) => (
                                <div key={id} className="flex flex-col gap-2 rounded-lg border p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold">{name.get(id)}</span>
                                    <form action={adminRemovePlayerAction.bind(null, ev.id, activity.id, sport.id, id)}>
                                      <SubmitButton variant="outline" size="sm">Remove</SubmitButton>
                                    </form>
                                  </div>
                                  {options.length > 0 && (
                                    <form action={adminSwapPlayerAction.bind(null, ev.id, activity.id, sport.id, id)} className="flex gap-2">
                                      {picker}
                                      <SubmitButton variant="outline" size="sm">Swap in</SubmitButton>
                                    </form>
                                  )}
                                </div>
                              ))}
                              {options.length > 0 ? (
                                <form action={adminAddPlayerAction.bind(null, ev.id, activity.id, sport.id)} className="flex gap-2">
                                  {picker}
                                  <SubmitButton size="sm">Add player</SubmitButton>
                                </form>
                              ) : (
                                <p className="text-sm text-muted-foreground">Everyone in {g.name} who can play is already in this squad.</p>
                              )}
                            </div>
                          ),
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
