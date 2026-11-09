import { PendingLink } from "@/components/PendingNav";
import { gamesOf, laneComplete, lanePlaces, laneTotals } from "../lib/lanes";
import { ordinal, pointsFor, type SportResults } from "../lib/results";

const HIDDEN = "Scores are hidden until the organisers reveal the results.";

/**
 * D867: a lane-draw sport in the portal. Lanes: one game at a time, each lane's bowlers with their
 * side and score; the viewer's seat stands out and their side's seats are tinted. Totals: each
 * side's running total, then its place and points once every score is in. While the reveal switch
 * is off (`visible` false) nobody sees a score, a total or a place - only who bowls where.
 */
export function LanesView({ sr, view, game, names, bowlers, selfId, sideId, visible, table, gameHref }: {
  sr: SportResults; view: "lanes" | "totals"; game: number | null; names: Map<string, string>; bowlers: Map<string, string>;
  selfId: string; sideId: string; visible: boolean; table: number[] | null; gameHref: (game: number) => string;
}) {
  const seats = sr.seats ?? [];
  if (seats.length === 0) return <p className="text-sm text-muted-foreground">The lanes haven&apos;t been drawn yet.</p>;
  const forfeit = new Set(sr.pools.filter((p) => p.forfeit).map((p) => p.group_id));

  if (view === "totals") {
    if (!visible) return <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">{HIDDEN}</p>;
    const complete = laneComplete(sr);
    const totals = laneTotals(seats, sr.pools.map((p) => p.group_id));
    const rows = complete
      ? lanePlaces(sr).map((p) => ({ id: p.groupId, lead: ordinal(p.place), points: table ? (p.forfeit ? "0 F" : `${pointsFor(p, table)} pts`) : null }))
      : [...totals].sort((a, b) => b.total - a.total).map((t) => ({ id: t.groupId, lead: "", points: null }));
    return (
      <div className="flex flex-col gap-2">
        <ol className="flex flex-col divide-y rounded-xl border bg-card">
          {rows.map((r) => {
            const t = totals.find((x) => x.groupId === r.id);
            return (
              <li key={r.id} className={`flex items-center justify-between gap-2 px-3 py-2.5 text-sm ${r.id === sideId ? "bg-primary/10 font-bold" : ""}`}>
                <span>{r.lead && <span className="inline-block w-9 font-extrabold tabular-nums">{r.lead}</span>}{names.get(r.id) ?? "A team"}{forfeit.has(r.id) ? " · Forfeit" : ""}</span>
                <span className="tabular-nums">{t?.total ?? 0}{r.points ? <span className="text-muted-foreground"> · {r.points}</span> : null}</span>
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-muted-foreground">{complete ? "Every bowler's scores over all games, added up." : "Running totals so far. Places fill in once every score is in."}</p>
      </div>
    );
  }

  const games = gamesOf(seats);
  const current = games.find((g) => g.game === game) ?? games[0];
  return (
    <div className="flex flex-col gap-3">
      {games.length > 1 && (
        <nav aria-label="Games" className="flex flex-wrap gap-1.5">
          {games.map((g) => (
            <PendingLink key={g.game} href={gameHref(g.game)} selected={g.game === current.game}
              className="rounded-full border px-3 py-1 text-sm" selectedClassName="border-primary bg-primary font-bold text-primary-foreground" unselectedClassName="bg-card font-semibold">
              Game {g.game}
            </PendingLink>
          ))}
        </nav>
      )}
      <ul className="flex flex-col gap-2">
        {current.lanes.map(({ lane, seats: here }) => (
          <li key={lane} className="flex flex-col gap-1.5 rounded-xl border bg-card p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Lane {lane}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {here.map((s) => {
                const you = s.attendee_id === selfId;
                const ours = s.group_id === sideId;
                return (
                  <div key={s.seat} className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm ${you ? "bg-primary text-primary-foreground" : ours ? "bg-primary/10" : "bg-muted"}`}>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{you ? "You" : bowlers.get(s.attendee_id) ?? "A bowler"}</span>
                      <span className={`block truncate text-xs ${you ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{names.get(s.group_id) ?? "A team"}</span>
                    </span>
                    {visible && s.score !== null && <span className="font-extrabold tabular-nums">{s.score}</span>}
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      {!visible && <p className="text-xs text-muted-foreground">{HIDDEN}</p>}
    </div>
  );
}
