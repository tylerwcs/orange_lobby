import type { Activity, Event } from "@/lib/types";
import { listAttendees } from "@/lib/db/attendees";
import { categoryMatches } from "@/lib/agenda";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/admin/Modal";
import { RowActions } from "@/components/admin/RowActions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { squadPeople, squadRows } from "../db/tournaments";
import { gamesOf, laneComplete, lanePlaces, laneTotals } from "../lib/lanes";
import { defaultPlaying, ordinal, pointsFor, type SportResults } from "../lib/results";
import { sideRows, type Side } from "../lib/sides";
import { drawLanesAction, saveLaneGameAction, swapBowlerAction } from "./lane-actions";
import { resetSportAction, setForfeitAction } from "./results-actions";

const box = "h-9 w-20 rounded-md border border-input bg-transparent px-2 text-center text-sm tabular-nums shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const select = "h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const list = "flex flex-col divide-y rounded-xl border bg-card";

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-extrabold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * D861-D867: a lane-draw sport on the Matches tab - draw the lanes, key each game's scores, swap a
 * bowler, mark a forfeit, and see the totals and places as they come in.
 */
export async function LanesSport({ ev, activity, sr, names, sides }: { ev: Event; activity: Activity; sr: SportResults; names: Map<string, string>; sides: Side[] }) {
  const sport = sr.sport;
  const seats = sr.seats ?? [];
  const [rows, attendees] = await Promise.all([squadRows(activity.id), listAttendees(ev.id)]);
  const people = await squadPeople(ev.id, [...rows.map((r) => r.attendee_id), ...seats.map((s) => s.attendee_id)]);
  const counted = sideRows(rows, people, sides);
  const who = (id: string) => people.get(id)?.name ?? "A former member";
  const scored = seats.some((s) => s.score !== null);
  const forfeit = new Set(sr.pools.filter((p) => p.forfeit).map((p) => p.group_id));
  const drawn = sr.pools.map((p) => p.group_id);
  const games = gamesOf(seats);
  const complete = laneComplete(sr);
  const places = lanePlaces(sr);
  const totals = laneTotals(seats, drawn).sort((a, b) => b.total - a.total);
  const table = activity.place_points ?? null;
  const reset = resetSportAction.bind(null, ev.id, activity.id, sport.id);
  const seated = new Set(seats.map((s) => s.attendee_id));
  const bowlers = [...new Map(seats.filter((s) => s.game === games[0]?.game).map((s) => [s.attendee_id, s])).values()]
    .sort((a, b) => (names.get(a.group_id) ?? "").localeCompare(names.get(b.group_id) ?? "") || a.number - b.number);

  const draw = (
    <Modal title={`Draw ${sport.name}'s lanes`} trigger={seats.length ? "Draw again" : "Draw the lanes"} icon="users" variant={seats.length ? "outline" : "default"}
      hint={`Ticked squads bowl all ${sport.games} games, their players spread over ${sport.lane_count} lanes and reshuffled every game. A squad left out sits it out and gets no place.`}>
      <form action={drawLanesAction.bind(null, ev.id, activity.id, sport.id)} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {sides.map((g) => (
            <label key={g.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="groups" value={g.id} defaultChecked={(drawn.length ? drawn : defaultPlaying(sides.map((x) => x.id), counted.filter((r) => r.sport_id === sport.id))).includes(g.id)} className="size-4" />
              {g.name}
            </label>
          ))}
        </div>
        <SubmitButton>Draw lanes</SubmitButton>
      </form>
    </Modal>
  );

  return (
    <div className="flex flex-col gap-6">
      <Section title="Lanes" aside={
        <div className="flex flex-wrap items-center gap-2">
          {!scored && draw}
          {seats.length > 0 && (
            <RowActions name={`${sport.name}'s lanes`}
              remove={{ action: reset, label: "Reset this sport's results", message: `Clear every ${sport.name} score and the lane draw? This can't be undone.` }} />
          )}
        </div>
      }>
        {seats.length === 0 ? (
          <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">No lanes yet. Draw them once the squads are in.</p>
        ) : (
          <>
            {scored && <p className="text-sm text-muted-foreground">The lanes are set. Reset this sport&apos;s results (⋯) to draw them again.</p>}
            <div className="flex flex-wrap gap-2">
              {drawn.map((g) => (
                <span key={g} className="inline-flex items-center gap-1 rounded-full border bg-card py-0.5 pl-3 pr-1 text-sm">
                  {names.get(g) ?? "A team"} {forfeit.has(g) && <Badge variant="warning">Forfeit</Badge>}
                  <RowActions name={names.get(g) ?? "Team"} actions={[{
                    label: forfeit.has(g) ? "Lift forfeit" : "Mark forfeit",
                    action: setForfeitAction.bind(null, ev.id, activity.id, sport.id, g, !forfeit.has(g)),
                  }]} />
                </span>
              ))}
            </div>
          </>
        )}
      </Section>

      {games.map(({ game, lanes }) => {
        const keyed = lanes.flatMap((l) => l.seats).filter((s) => s.score !== null).length;
        const all = lanes.flatMap((l) => l.seats).length;
        return (
          <Section key={game} title={`Game ${game}`} aside={<span className="text-sm text-muted-foreground">{keyed} of {all} keyed</span>}>
            <form action={saveLaneGameAction.bind(null, ev.id, activity.id, sport.id, game)} className="flex flex-col gap-3">
              <div className={list}>
                {lanes.map(({ lane, seats: here }) => (
                  <div key={lane} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start">
                    <span className="w-16 shrink-0 text-sm font-extrabold">Lane {lane}</span>
                    <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {here.map((s) => (
                        <label key={s.seat} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm">
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{who(s.attendee_id)}</span>
                            <span className="block truncate text-xs text-muted-foreground">{names.get(s.group_id) ?? "A team"}{forfeit.has(s.group_id) ? " · Forfeit" : ""}</span>
                          </span>
                          <input name={`score:${s.lane}:${s.seat}`} aria-label={`${who(s.attendee_id)}'s game ${game} score`} inputMode="numeric" pattern="\d{1,3}"
                            defaultValue={s.score ?? ""} className={box} />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div><SubmitButton size="sm">Save game {game}</SubmitButton></div>
            </form>
          </Section>
        );
      })}

      {seats.length > 0 && (
        <Section title={complete ? "Places" : "Running totals"}>
          <div className={list}>
            {(complete ? places.map((p) => ({ id: p.groupId, lead: ordinal(p.place), forfeit: p.forfeit })) : totals.map((t) => ({ id: t.groupId, lead: "", forfeit: forfeit.has(t.groupId) }))).map((r) => {
              const t = totals.find((x) => x.groupId === r.id);
              const place = places.find((p) => p.groupId === r.id);
              return (
                <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>{r.lead && <span className="inline-block w-10 font-bold tabular-nums">{r.lead}</span>}{names.get(r.id)} {r.forfeit && <Badge variant="warning">Forfeit</Badge>}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {t?.total ?? 0}{!complete && t ? ` · ${t.keyed} of ${t.seats} keyed` : ""}
                    {complete && table && place ? ` · ${place.forfeit ? "0 · Forfeit" : `${pointsFor(place, table)} pts`}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
          {!complete && <p className="text-xs text-muted-foreground">Places fill in once every score is keyed. A bowler who didn&apos;t turn up scores 0.</p>}
        </Section>
      )}

      {bowlers.length > 0 && (
        <Section title="Bowlers">
          <div className={list}>
            {bowlers.map((s) => {
              const side = sides.find((x) => x.id === s.group_id);
              const choices = attendees.filter((a) => a.group_id && side?.groupIds.includes(a.group_id) && !seated.has(a.id) && categoryMatches(activity.categories ?? null, a.category ?? null));
              return (
                <div key={s.attendee_id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>{who(s.attendee_id)} <span className="text-muted-foreground">· {names.get(s.group_id)}</span></span>
                  <RowActions name={who(s.attendee_id)} edit={{
                    title: `Swap ${who(s.attendee_id)}`,
                    hint: "The new bowler takes every lane and score of this one, and their squad place.",
                    form: (
                      <form action={swapBowlerAction.bind(null, ev.id, activity.id, sport.id, s.attendee_id)} className="flex flex-col gap-3">
                        <select name="attendee" required defaultValue="" className={select}>
                          <option value="" disabled>Pick a member</option>
                          {choices.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        <SubmitButton>Swap bowler</SubmitButton>
                      </form>
                    ),
                  }} />
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
