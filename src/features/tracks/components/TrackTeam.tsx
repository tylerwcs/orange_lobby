import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { shortDate } from "@/lib/text";
import { TrackSwitchButton } from "./TrackSwitchButton";
import { showTrackSwitch, type TeamTrackRow, type trackTeamRows } from "../lib";
import type { PairTeamWeek } from "../combined";
import type { TrackPair } from "../types";

type Groups = ReturnType<typeof trackTeamRows>;

/** D724: amber under the target, green at it, red over - shown, never enforced. */
const pill = (n: number, target: number) =>
  n > target ? "bg-destructive/10 text-destructive" : n === target ? "bg-success-soft text-success-strong" : "bg-warning-soft text-warning";

/**
 * D724: My team on a track pair, in place of `MyTeam` - the same closed <details> at the foot of
 * My stats, the team grouped by track, each person on their own track's number for the shown day.
 * Captains get an A | B switch on every row, their own included; everyone else reads the same list.
 */
export function TrackTeam({ teamName, groups, pair, labels, captain, day, today, startsOn, switchAction, bonus = null, changing = false, changeHref, doneHref, loggedToday = new Set<string>() }: {
  teamName: string; groups: Groups; pair: TrackPair; labels: { a: string; b: string }; captain: boolean;
  day: string; today: string; startsOn: string;
  switchAction: (attendeeId: string, side: "a" | "b", shownOnSide: boolean) => () => Promise<void>;
  /** D727: the pair's +10 for the week on show, in `MyTeam`'s Tier 2 words; null without one. */
  bonus?: { week: PairTeamWeek; points: number; current: boolean; past: boolean } | null;
  /** Whether a captain is changing tracks: then every row, not just the unplaced, has its switch. */
  changing?: boolean;
  /** Where "Change tracks" and "Done" lead; the same page with and without `?tracks=change`. */
  changeHref: string; doneHref: string;
  /** D726: who has logged today on their own track - a move would remove it, so the switch asks first. */
  loggedToday?: Set<string>;
}) {
  const placed = groups.a.length + groups.b.length;
  const members = groups.a.length + groups.b.length + groups.none.length;
  const when = day === today ? "today" : `on ${shortDate(day)}`;
  const summary = day > today
    ? (today < startsOn ? `Starts ${shortDate(startsOn)}` : `${shortDate(day)} is still to come`)
    : `${groups.logged} of ${members} logged ${when} · A ${groups.a.length} · B ${groups.b.length}`;

  const row = (r: TeamTrackRow, side: "a" | "b" | null) => (
    <li key={r.id} className="flex min-h-11 items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0">
      <span className="min-w-0 flex-1 truncate">{r.name}{r.self ? " (you)" : ""}</span>
      {r.state === "none" ? <span className="text-muted-foreground">{captain ? "Can't submit yet" : "Ask your captain"}</span>
        : r.state === "future" ? <span className="text-muted-foreground"><span aria-hidden>–</span><span className="sr-only">Not yet</span></span>
          : r.state === "logged" ? <span className="tabular-nums text-muted-foreground">{r.value} {r.unit}{r.pts !== null ? ` · ${r.pts} pts` : ""}</span>
            : <span className="font-bold text-warning">Not logged</span>}
      {showTrackSwitch({ captain, placed: side !== null, changing }) && (
        <span className="inline-flex shrink-0 overflow-hidden rounded-md border border-border">
          {(["a", "b"] as const).map((s) => (
            <form key={s} action={switchAction(r.id, s, side === s)} className={s === "b" ? "border-l border-border" : ""}>
              <TrackSwitchButton side={s === "a" ? "A" : "B"} on={side === s}
                confirm={side !== null && loggedToday.has(r.id)
                  ? (side === s
                    ? `Taking ${r.name} off ${side === "a" ? "Track A" : "Track B"} removes what they logged on it today.`
                    : `Moving ${r.name} to ${s === "a" ? "Track A" : "Track B"} removes what they logged on ${side === "a" ? "Track A" : "Track B"} today.`)
                  : null}
                label={side === s ? `Take ${r.name} off ${s === "a" ? "Track A" : "Track B"}` : `Put ${r.name} on ${s === "a" ? "Track A" : "Track B"}`} />
            </form>
          ))}
        </span>
      )}
    </li>
  );

  const group = (title: string, rows: TeamTrackRow[], side: "a" | "b" | null) => (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-extrabold">{title}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${side ? pill(rows.length, pair.target) : "bg-warning-soft text-warning"}`}>
          {side ? `${rows.length} of ${pair.target}` : rows.length}
        </span>
      </div>
      {rows.length > 0 && <ul className="flex flex-col overflow-hidden rounded-lg border border-border">{rows.map((r) => row(r, side))}</ul>}
    </div>
  );

  return (
    <details className="group overflow-hidden rounded-xl border border-border bg-card">
      <summary className="flex min-h-14 list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-extrabold">My team · {teamName}</span>
          <span className="truncate text-xs text-muted-foreground tabular-nums">{summary}</span>
        </span>
        <ChevronDown aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-3 border-t border-border p-3">
        {bonus?.week.void && <p className="rounded-lg bg-muted px-3 py-2 text-sm font-bold">This week is void: a member was disqualified.</p>}
        {bonus && !bonus.week.void && bonus.current && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            <span className="font-bold">{bonus.week.onTrack} of {bonus.week.members}</span> logged every day so far this week, on either track. Everyone logging every day earns +{bonus.points}.
          </p>
        )}
        {bonus && !bonus.week.void && bonus.past && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            {bonus.week.bonus > 0 ? `Everyone logged every day: +${bonus.week.bonus}.` : "Not everyone logged every day this week."}
          </p>
        )}
        {group(`Track A · ${labels.a}`, groups.a, "a")}
        {group(`Track B · ${labels.b}`, groups.b, "b")}
        {groups.none.length > 0 && group("No track yet", groups.none, null)}
        {/* A placed row keeps its space for the day's numbers; moving someone is one tap away. */}
        {captain && placed > 0 && (
          <Link href={changing ? doneHref : changeHref} scroll={false} className="self-end px-1 text-sm font-bold text-primary underline-offset-2 hover:underline">
            {changing ? "Done" : "Change tracks"}
          </Link>
        )}
      </div>
    </details>
  );
}
