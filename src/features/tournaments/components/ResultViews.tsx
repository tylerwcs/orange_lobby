import { Check, Crown, Medal, Trophy } from "lucide-react";
import {
  bracketName, bracketPlaces, formatTime, ordinal, pointsFor, sportPlaces,
  type OverallRow, type Place, type PoolTable, type Resolved, type SportResults, type TimeRow,
} from "../lib/results";
import type { TournamentSport } from "../lib/squads";
import { bonusLine, OverallTable, pointsLine } from "./OverallTable";

/**
 * D663: what an attendee sees of a tournament's results - Reclub's List, Standings and Playoffs
 * for one sport, and the Overall table. Server-drawn, no client state: every filter is a link.
 */

const who = (e: Resolved["entries"][number], names: Map<string, string>) =>
  e.groupId ? names.get(e.groupId) ?? "A group" : e.pointer ?? "To be picked";

/** One match or race as a card: the teams with their scores or times, the winner bold, a tick once played. */
export function MatchCard({ r, names, mine, time }: { r: Resolved; names: Map<string, string>; mine: string; time: boolean }) {
  const ours = r.entries.some((e) => e.groupId === mine);
  const rows = time && r.played ? r.order.map((g) => r.entries.find((e) => e.groupId === g)!) : r.entries;
  return (
    <li className={`relative flex flex-col gap-1 rounded-xl border p-3 ${r.played ? "border-primary/60" : "border-border"} ${ours ? "bg-primary/5" : "bg-card"}`}>
      {r.played && (
        <span className="absolute -right-px -top-px rounded-bl-lg rounded-tr-xl bg-primary px-1.5 py-0.5 text-primary-foreground">
          <Check aria-label="Played" className="size-3" />
        </span>
      )}
      {rows.map((e) => {
        const won = r.played && !r.draw && (time ? r.order[0] === e.groupId : r.winner === e.groupId);
        const value = time
          ? e.forfeit ? "Forfeit" : e.dnf ? "DNF" : e.timeMs ? formatTime(e.timeMs) : ""
          : r.note?.startsWith("Walkover") || r.note === "Both forfeit" ? "" : e.score ?? "";
        return (
          <div key={e.slot} className={`flex items-center justify-between gap-3 text-sm ${won ? "font-extrabold" : ""} ${e.groupId ? "" : "italic text-muted-foreground"}`}>
            <span className="min-w-0 truncate pr-0.5">{who(e, names)}{e.groupId === mine && <span className="font-normal text-muted-foreground"> (your group)</span>}</span>
            <span className="tabular-nums">{value}</span>
          </div>
        );
      })}
      {r.note && <p className="text-xs text-muted-foreground">{r.note}</p>}
      {!r.played && r.entries.every((e) => e.groupId) && <p className="text-xs text-muted-foreground">Not played yet</p>}
    </li>
  );
}

/** D659: one table per pool, the viewer's group highlighted. */
export function StandingsView({ tables, names, mine, time }: { tables: PoolTable[]; names: Map<string, string>; mine: string; time: boolean }) {
  if (tables.length === 0) return <p className="text-sm text-muted-foreground">The pools haven&apos;t been drawn yet.</p>;
  return (
    <div className="flex flex-col gap-4">
      {tables.map((t) => (
        <div key={t.pool} className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm tabular-nums">
            <caption className="px-3 pt-3 text-left text-sm font-extrabold">{t.name}</caption>
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-medium">#</th>
                {time
                  ? <th className="px-3 py-2 text-right font-medium">Time</th>
                  : ["P", "W", "D", "L", "Diff", "For"].map((h) => <th key={h} className="px-1.5 py-2 text-right font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r) => (
                <tr key={r.groupId} className={`border-b last:border-0 ${r.groupId === mine ? "bg-primary/10 font-bold" : ""}`}>
                  <td className="px-3 py-2">
                    {r.rank}{r.tied ? "=" : ""} {names.get(r.groupId)}
                    {r.forfeit && <span className="ml-1 text-xs font-bold text-warning">Forfeit</span>}
                  </td>
                  {time
                    ? <td className="px-3 py-2 text-right">{r.forfeit ? "—" : r.dnf ? "DNF" : r.timeMs ? formatTime(r.timeMs) : "—"}</td>
                    : [r.played, r.won, r.drawn, r.lost, r.diff > 0 ? `+${r.diff}` : r.diff, r.scored].map((v, i) => <td key={i} className="px-1.5 py-2 text-right">{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {!time && <p className="text-xs text-muted-foreground">Ranked by wins, then point difference, then points scored. A walkover counts as a win with no points.</p>}
    </div>
  );
}

/** "1:52.30", "DNF", or "—" for a swim not timed yet. */
export const swimText = (s: { timeMs: number | null; dnf: boolean }) => (s.dnf ? "DNF" : s.timeMs !== null ? formatTime(s.timeMs) : "—");

/**
 * D673: a time sport's one table - every group's swims and best time, ranked across all pools,
 * with its points once every race is in.
 */
export function TimeStandingsView({ rows, places, names, mine, table }: {
  rows: TimeRow[]; places: Place[]; names: Map<string, string>; mine: string; table: number[] | null;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">The pools haven&apos;t been drawn yet.</p>;
  const heats = Math.max(...rows.map((r) => r.swims.length), 0);
  const settled = new Map(places.map((p) => [p.groupId, p]));
  const points = !!table?.length && places.length > 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2 text-left font-medium">#</th>
              {Array.from({ length: heats }, (_, i) => <th key={i} className="px-1.5 py-2 text-right font-medium">Heat {i + 1}</th>)}
              <th className="px-3 py-2 text-right font-medium">Best</th>
              {points && <th className="px-3 py-2 text-right font-medium">Pts</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const place = settled.get(r.groupId);
              return (
                <tr key={r.groupId} className={`border-b last:border-0 ${r.groupId === mine ? "bg-primary/10 font-bold" : ""}`}>
                  <td className="px-3 py-2">
                    {r.rank}{r.tied ? "=" : ""} {names.get(r.groupId)}
                    {r.forfeit && <span className="ml-1 text-xs font-bold text-warning">Forfeit</span>}
                  </td>
                  {Array.from({ length: heats }, (_, i) => <td key={i} className="px-1.5 py-2 text-right text-muted-foreground">{r.forfeit || !r.swims[i] ? "—" : swimText(r.swims[i])}</td>)}
                  <td className="px-3 py-2 text-right font-extrabold">{r.forfeit ? "—" : r.bestMs !== null ? formatTime(r.bestMs) : r.dnf ? "DNF" : "—"}</td>
                  {points && <td className="px-3 py-2 text-right">{place ? pointsFor(place, table) : ""}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Every squad swims in each heat. Its best time counts, ranked across all pools{places.length ? "" : "; places are final once every heat is in"}.</p>
    </div>
  );
}

/** D656, D661: each placing bracket as a small drawing (semis, then final and 3rd place), and the places so far. */
export function PlayoffsView({ sr, resolved, names, mine, table }: { sr: SportResults; resolved: Resolved[]; names: Map<string, string>; mine: string; table: number[] | null }) {
  const time = sr.sport.result_kind === "time";
  const teams = new Set(sr.pools.map((p) => p.pool)).size;
  const brackets = [...new Set(resolved.filter((r) => r.match.stage === "bracket").map((r) => r.match.bracket ?? 0))].sort((a, b) => a - b);
  const places = sportPlaces(sr, resolved);
  if (brackets.length === 0) return <p className="text-sm text-muted-foreground">The playoffs start once the pools are drawn.</p>;
  return (
    <div className="flex flex-col gap-6">
      {brackets.map((b) => {
        const ms = resolved.filter((r) => r.match.stage === "bracket" && r.match.bracket === b);
        const semis = ms.filter((r) => r.match.round === "semi");
        const rest = ms.filter((r) => r.match.round !== "semi");
        return (
          <section key={b} className="flex flex-col gap-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{bracketName(b)} · {bracketPlaces(b, teams)}</h3>
            <div className={`grid gap-3 ${semis.length ? "grid-cols-2" : "grid-cols-1"}`}>
              {semis.length > 0 && (
                <ul className="flex flex-col justify-around gap-3">
                  {semis.map((r) => <Labelled key={r.match.id} r={r} names={names} mine={mine} time={time} />)}
                </ul>
              )}
              <ul className="flex flex-col justify-around gap-3">
                {rest.map((r) => <Labelled key={r.match.id} r={r} names={names} mine={mine} time={time} />)}
              </ul>
            </div>
          </section>
        );
      })}
      {places.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Places</h3>
          <ol className="flex flex-col divide-y rounded-xl border bg-card">
            {places.map((p) => (
              <li key={`${p.place}-${p.groupId}`} className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${p.groupId === mine ? "bg-primary/10 font-bold" : ""}`}>
                <span><span className="inline-block w-10 font-extrabold tabular-nums">{ordinal(p.place)}</span>{names.get(p.groupId)}</span>
                {table && <span className="tabular-nums text-muted-foreground">{p.forfeit ? "0 · Forfeit" : `${pointsFor(p, table)} pts`}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function Labelled({ r, names, mine, time }: { r: Resolved; names: Map<string, string>; mine: string; time: boolean }) {
  return (
    <li className="flex flex-col gap-1">
      <span className="text-xs font-bold text-muted-foreground">{r.label.split(" · ")[1] ?? r.label}</span>
      <ul><MatchCard r={r} names={names} mine={mine} time={time} /></ul>
    </li>
  );
}

const PODIUM = [
  { rank: 2, height: 64, tint: "bg-silver-soft text-silver-strong", Icon: Medal },
  { rank: 1, height: 92, tint: "bg-gold-soft text-gold-strong", Icon: Trophy },
  { rank: 3, height: 48, tint: "bg-bronze-soft text-bronze-strong", Icon: Medal },
] as const;

/** D662/D663: the week so far - a podium for the top three, then every group's points by sport and D674's bonus. */
export function OverallView({ rows, sports, names, mine, table, bonus = null }: {
  rows: OverallRow[]; sports: TournamentSport[]; names: Map<string, string>; mine: string; table: number[]; bonus?: number | null;
}) {
  const scored = rows.some((r) => r.total > 0);
  const top = scored ? [rows[1], rows[0], rows[2]] : [];
  return (
    <div className="flex flex-col gap-4">
      {scored && (
        <ol aria-label="Podium" className="flex items-end justify-center gap-2 rounded-2xl border bg-card bg-[radial-gradient(ellipse_at_50%_0%,var(--gold-soft)_0%,transparent_70%)] px-3 pt-4">
          {PODIUM.map((slot, i) => {
            const r = top[i];
            const { Icon } = slot;
            return (
              <li key={slot.rank} className={`flex min-w-0 flex-col items-center gap-0.5 text-center ${i === 1 ? "w-[36%]" : "w-[29%]"}`}>
                {slot.rank === 1 && <Crown aria-hidden className="mb-0.5 size-6 text-gold-strong" />}
                <span className="w-full truncate text-sm font-extrabold">{r ? names.get(r.groupId) : "–"}</span>
                {r && <span className="text-xs font-bold tabular-nums text-muted-foreground">{r.total} pts</span>}
                {r?.groupId === mine && <span className="rounded-full bg-success-soft px-2 text-[11px] font-bold text-success-strong">Your group</span>}
                <div className={`mt-1.5 flex w-full flex-col items-center gap-0.5 rounded-t-xl pt-2.5 ${slot.tint}`} style={{ height: slot.height }}>
                  <Icon aria-hidden className="size-5" />
                  <span className="text-2xl font-extrabold leading-none tabular-nums"><span className="sr-only">Place </span>{r ? r.rank : slot.rank}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {rows.length === 0
        ? <p className="text-sm text-muted-foreground">No results yet.</p>
        : <OverallTable rows={rows} sports={sports} names={names} highlight={mine} />}
      <p className="text-xs text-muted-foreground">{pointsLine(table)}. – is a sport not finished yet; 0 F is a forfeit.{bonus ? ` ${bonusLine(bonus)}` : ""}</p>
    </div>
  );
}

