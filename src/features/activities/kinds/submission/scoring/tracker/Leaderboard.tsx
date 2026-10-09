import { Crown, Medal, Trophy } from "lucide-react";
import type { Standing } from "../../../../lib/challenge-score";
import { leaderboardView, pts, type StandingLine } from "../../../../lib/leaderboard";

/**
 * D386: the Leaderboard tab's standings - a podium for the first three live teams, where the
 * viewer's team stands, then everyone else with a bar against the leader. Points only, never km
 * (D379), so the weekly podium stays a surprise. Replaces D379's plain team table.
 *
 * Server-drawn with no client JS: the podium rising and the bars filling are CSS keyframes
 * (globals.css), run once as the tab mounts and only under `motion-safe:`.
 */

const RISE = "motion-safe:animate-[podium-rise_600ms_ease-out_both]";
const FILL = "motion-safe:animate-[bar-fill_600ms_ease-out_both]";

/** A place's look, by rank: a tie for 1st is two gold columns, not a gold and a silver. */
const PLACE = {
  1: { height: 104, tint: "bg-gold-soft text-gold-strong", Icon: Trophy },
  2: { height: 74, tint: "bg-silver-soft text-silver-strong", Icon: Medal },
  3: { height: 56, tint: "bg-bronze-soft text-bronze-strong", Icon: Medal },
} as const;
const place = (rank: number) => PLACE[Math.min(rank, 3) as 1 | 2 | 3];

type Column = { key: string; name: string; total: number | null; rank: number; mine: boolean };

export function Leaderboard({ standings, mine, stand, podiumPoints }: {
  standings: Standing[];
  /** The viewer's team id, null without one. */
  mine: string | null;
  /** The "Where you stand" card's words (`standingLine`); null without a team. */
  stand: StandingLine | null;
  /** Whether the challenge awards weekly podium points at all, so the header can promise them. */
  podiumPoints: boolean;
}) {
  const view = leaderboardView(standings);
  // Before any points, the podium is its three empty places, so the page still shows the prize.
  const columns: Column[] = view.scored
    ? view.podium.map((s) => ({ key: s.id, name: s.name, total: s.total, rank: s.rank ?? 3, mine: s.id === mine }))
    : [1, 2, 3].map((rank) => ({ key: `place-${rank}`, name: "–", total: null, rank, mine: false }));
  // In rank order in the DOM, so a screen reader announces 1st first; `order-*` draws them
  // 2nd · 1st · 3rd. The rise runs 3rd, 2nd, then 1st, so the winner lands last.
  const VISUAL = ["order-2", "order-1", "order-3"];
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-extrabold">Standings</h2>
        {podiumPoints && <span className="text-right text-xs text-muted-foreground">Podium points added each Monday</span>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card bg-[radial-gradient(ellipse_at_50%_0%,var(--gold-soft)_0%,transparent_70%)] px-3 pt-4">
        <ol className="flex items-end justify-center gap-2" aria-label="Podium">
          {columns.map((c, i) => {
            const { height, tint, Icon } = place(c.rank);
            const first = i === 0;
            return (
              <li key={c.key} className={`flex min-w-0 flex-col items-center gap-0.5 text-center ${VISUAL[i]} ${first ? "w-[36%]" : "w-[29%]"}`}>
                {c.rank === 1 && <Crown aria-hidden className="mb-0.5 size-6 text-gold-strong" />}
                {/* An empty place's "–" says nothing aloud; its "Place n" below still does. */}
                <span aria-hidden={c.total === null || undefined} className="w-full truncate text-sm font-extrabold">{c.name}</span>
                {c.total !== null && <span className="text-xs font-bold tabular-nums text-muted-foreground">{pts(c.total)}</span>}
                {c.mine && <span className="rounded-full bg-success-soft px-2 text-[11px] font-bold text-success-strong">Your team</span>}
                <div
                  className={`mt-1.5 flex w-full flex-col items-center gap-0.5 rounded-t-xl pt-2.5 shadow-[inset_0_2px_0_rgb(255_255_255/0.6)] ${tint} ${RISE}`}
                  style={{ height, animationDelay: `${(columns.length - 1 - i) * 120}ms` }}
                >
                  <Icon aria-hidden className={first ? "size-6" : "size-5"} />
                  <span className={`font-extrabold leading-none tabular-nums ${first ? "text-3xl" : "text-2xl"}`}>
                    <span className="sr-only">Place </span>{c.rank}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {stand && (
        <div className="flex items-center gap-4 rounded-2xl border border-success/30 bg-success-soft p-4 text-success-strong">
          <div className="shrink-0 text-4xl font-extrabold leading-none tabular-nums">{stand.rank}</div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="text-xs font-bold">Where you stand</div>
            {/* Wraps rather than truncates, so a long team name never cuts off its points. */}
            <div className="line-clamp-2 break-words font-extrabold">{stand.title}</div>
            <div className="text-sm text-foreground/80">{stand.line}</div>
          </div>
        </div>
      )}

      {view.rest.length > 0 && (
        <ol className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
          {view.rest.map((s, i) => {
            const isMine = s.id === mine;
            const width = view.leaderTotal > 0 ? Math.round((s.total / view.leaderTotal) * 100) : 0;
            return (
              <li key={s.id} className={`flex min-h-14 items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0 ${isMine ? "bg-success-soft text-success-strong" : ""}`}>
                <span className={`w-6 shrink-0 text-right text-sm font-bold tabular-nums ${isMine ? "" : "text-muted-foreground"}`}>
                  {view.scored && s.rank !== null ? s.rank : "–"}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className={`truncate text-sm ${isMine ? "font-extrabold" : "font-bold"} ${s.void ? "text-muted-foreground" : ""}`}>
                    {s.name}{isMine ? " (your team)" : ""}
                  </span>
                  {/* Before any points every bar is empty, so the tracks would only be noise. */}
                  {!s.void && view.scored && (
                    <span aria-hidden className={`h-1.5 overflow-hidden rounded-full ${isMine ? "bg-success/15" : "bg-muted"}`}>
                      <span
                        className={`block h-full origin-left rounded-full ${isMine ? "bg-success-strong" : "bg-primary"} ${FILL}`}
                        style={{ width: `${width}%`, animationDelay: `${300 + Math.min(i, 10) * 50}ms` }}
                      />
                    </span>
                  )}
                </div>
                <span className={`shrink-0 text-sm font-extrabold tabular-nums ${s.void ? "text-muted-foreground" : ""}`}>
                  {s.void ? "Void" : pts(s.total)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
