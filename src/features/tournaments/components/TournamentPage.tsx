import { PendingLink, PendingScope } from "@/components/PendingNav";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import type { Activity } from "@/lib/types";
import { poolStandings, resolveSport, sportPlaces, timeTable, tournamentOverall, type CupBonus, type Resolved, type SportResults, type TournamentTab } from "../lib/results";
import { MatchCard, OverallView, PlayoffsView, StandingsView, TimeStandingsView } from "./ResultViews";
import { SportSelect } from "./SportSelect";

export type ResultsView = "matches" | "standings" | "playoffs";
export type MatchFilter = "all" | "mine" | "left" | "done";

const FILTERS: { key: MatchFilter; label: string }[] = [
  { key: "all", label: "All" }, { key: "mine", label: "Your matches" }, { key: "left", label: "Remaining" }, { key: "done", label: "Completed" },
];

/** Results and the Leaderboard re-read themselves this often while on screen, so scores arrive without a reload. */
const REFRESH_SECONDS = 15;

/**
 * D663: a tournament's portal page - four tabs, About · Squads · Results · Leaderboard (About only
 * with a description, Leaderboard only with a points table the organiser isn't hiding). Results
 * picks its sport from a dropdown that remembers the last one, then Matches · Standings ·
 * Playoffs. Every choice is a URL (`?tab=`, `&sport=`, `&view=`, `&show=`), and the tab links
 * carry the sport, so moving to About and back lands on the same sport.
 */
export function TournamentPage({ activity, results, groups, groupId, bonus, tab, sportId, view, show, path, about, squads }: {
  activity: Activity;
  results: SportResults[];
  groups: { id: string; name: string }[];
  groupId: string;
  /** D674: the participation bonus and who earns it now; null when there is none. */
  bonus: CupBonus | null;
  /** Already resolved by `tournamentTab`. */
  tab: TournamentTab;
  /** Already resolved by `pickSport`. */
  sportId: string | null;
  view: ResultsView | null;
  show: MatchFilter;
  /** The tournament's portal page, without a query. */
  path: string;
  /** The organiser's description, or null when there is none (then no About tab). */
  about: React.ReactNode | null;
  /** The group's squads for every sport, drawn by the caller. */
  squads: React.ReactNode;
}) {
  const names = new Map(groups.map((g) => [g.id, g.name]));
  const table = activity.place_points ?? [];
  const leaderboard = table.length > 0 && activity.show_overall !== false;
  const tabs: { key: TournamentTab; label: string }[] = [
    ...(about ? [{ key: "about" as const, label: "About" }] : []),
    { key: "squads", label: "Squads" },
    { key: "results", label: "Results" },
    ...(leaderboard ? [{ key: "leaderboard" as const, label: "Leaderboard" }] : []),
  ];
  const current = results.find((r) => r.sport.id === sportId) ?? null;
  const manual = current?.sport.format === "manual";
  // D673: a time sport has no playoffs - its Standings are the places.
  const timed = current?.sport.result_kind === "time";
  const views: { key: ResultsView; label: string }[] = [
    { key: "matches", label: "Matches" },
    ...(manual ? [] : [{ key: "standings" as const, label: "Standings" }]),
    ...(manual || timed ? [] : [{ key: "playoffs" as const, label: "Playoffs" }]),
  ];
  const sub = views.find((v) => v.key === view)?.key ?? "matches";
  const href = (q: Record<string, string | undefined>) =>
    `${path}?${new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => !!e[1]))}`;
  const cols = ["grid-cols-1", "grid-cols-2", "grid-cols-3", "grid-cols-4"][tabs.length - 1];

  return (
    <PendingScope>
      <div className="flex flex-col gap-4">
        <nav aria-label="Tournament" className={`-mx-4 grid border-b border-border px-4 md:mx-0 md:px-0 ${cols}`}>
          {tabs.map((t) => (
            <PendingLink key={t.key} href={href({ tab: t.key, sport: sportId ?? undefined })} selected={t.key === tab}
              className="-mb-px flex min-h-11 items-center justify-center border-b-[3px] px-1 text-center text-sm"
              selectedClassName="border-primary font-extrabold text-primary" unselectedClassName="border-transparent font-semibold text-muted-foreground">
              {t.label}
            </PendingLink>
          ))}
        </nav>

        {tab === "about" && about}
        {tab === "squads" && squads}

        {tab === "leaderboard" && (
          <>
            <div className="flex justify-end"><AutoRefresh seconds={REFRESH_SECONDS} /></div>
            <OverallView rows={tournamentOverall(results, groups, table, bonus)} sports={results.map((r) => r.sport)} names={names} mine={groupId} table={table} bonus={bonus?.points ?? null} />
          </>
        )}

        {tab === "results" && !current && <p className="text-sm text-muted-foreground">The organisers haven&apos;t added any sports yet.</p>}
        {tab === "results" && current && (
          <>
            <div className="flex items-center gap-3">
              <SportSelect activityId={activity.id} path={path} current={current.sport.id} sports={results.map((r) => ({ id: r.sport.id, name: r.sport.name }))} />
              <AutoRefresh seconds={REFRESH_SECONDS} />
            </div>
            {views.length > 1 && (
              <nav aria-label={current.sport.name} className={`grid ${views.length === 2 ? "grid-cols-2" : "grid-cols-3"} rounded-xl bg-muted p-1`}>
                {views.map((v) => (
                  <PendingLink key={v.key} href={href({ tab: "results", sport: current.sport.id, view: v.key })} selected={v.key === sub}
                    className="flex min-h-9 items-center justify-center rounded-lg px-1 text-center text-sm"
                    selectedClassName="bg-card font-extrabold text-foreground shadow-sm" unselectedClassName="font-semibold text-muted-foreground">
                    {v.label}
                  </PendingLink>
                ))}
              </nav>
            )}
            <SportView sr={current} tab={sub} show={show} names={names} groupId={groupId} table={table.length ? table : null}
              filterHref={(f) => href({ tab: "results", sport: current.sport.id, view: "matches", show: f === "all" ? undefined : f })} />
          </>
        )}
      </div>
    </PendingScope>
  );
}

function SportView({ sr, tab, show, names, groupId, table, filterHref }: {
  sr: SportResults; tab: ResultsView; show: MatchFilter; names: Map<string, string>; groupId: string; table: number[] | null;
  filterHref: (f: MatchFilter) => string;
}) {
  const time = sr.sport.result_kind === "time";
  const resolved = resolveSport(sr, names);
  if (tab === "standings" && time) return <TimeStandingsView rows={timeTable(sr, resolved)} places={sportPlaces(sr, resolved)} names={names} mine={groupId} table={table} />;
  if (tab === "standings") return <StandingsView tables={poolStandings(sr, resolved)} names={names} mine={groupId} time={time} />;
  if (tab === "playoffs" && !time) return <PlayoffsView sr={sr} resolved={resolved} names={names} mine={groupId} table={table} />;

  const keep = (r: Resolved) =>
    show === "mine" ? r.entries.some((e) => e.groupId === groupId) : show === "left" ? !r.played : show === "done" ? r.played : true;
  const shown = resolved.filter(keep);
  // Grouped as Reclub does: pools first, then each bracket, then the organiser's rounds.
  const sections: { key: string; title: string; items: Resolved[] }[] = [];
  for (const r of shown) {
    const title = r.match.stage === "pool" ? r.label : r.match.stage === "bracket" ? r.label.split(" · ")[0] : r.match.round;
    const key = `${r.match.stage}:${title}`;
    const s = sections.find((x) => x.key === key);
    if (s) s.items.push(r);
    else sections.push({ key, title, items: [r] });
  }
  sections.sort((a, b) => Number(a.key.startsWith("bracket")) - Number(b.key.startsWith("bracket")) || (a.key.startsWith("pool") ? a.title.localeCompare(b.title) : 0));

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Show" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {FILTERS.map((f) => (
          <PendingLink key={f.key} href={filterHref(f.key)} selected={f.key === show} className="py-1"
            selectedClassName="font-extrabold text-foreground" unselectedClassName="font-semibold text-muted-foreground">
            {f.label}
          </PendingLink>
        ))}
      </nav>
      {sr.matches.length === 0 && <p className="text-sm text-muted-foreground">No matches yet. They appear here once the organisers draw the pools.</p>}
      {sr.matches.length > 0 && shown.length === 0 && <p className="text-sm text-muted-foreground">Nothing here.</p>}
      {sections.map((s) => (
        <section key={s.key} className="flex flex-col gap-2">
          <h3 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{s.title} · {s.items.length}</h3>
          <ul className="flex flex-col gap-2">
            {s.items.map((r) => (
              <li key={r.match.id} className="flex flex-col gap-1">
                {r.match.stage === "bracket" && <span className="text-xs font-bold text-muted-foreground">{r.label.split(" · ")[1]}</span>}
                <ul><MatchCard r={r} names={names} mine={groupId} time={time} /></ul>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
