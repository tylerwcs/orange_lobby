import { PendingLink, PendingScope } from "@/components/PendingNav";
import type { Activity } from "@/lib/types";
import { poolStandings, resolveSport, tournamentOverall, type Resolved, type SportResults } from "../lib/results";
import { MatchCard, OverallView, PlayoffsView, StandingsView } from "./ResultViews";

export type ResultsView = "matches" | "standings" | "playoffs" | "squads";
export type MatchFilter = "all" | "mine" | "left" | "done";

const FILTERS: { key: MatchFilter; label: string }[] = [
  { key: "all", label: "All" }, { key: "mine", label: "Your matches" }, { key: "left", label: "Remaining" }, { key: "done", label: "Completed" },
];

/**
 * D663: a tournament's portal page once results start - Overall and one chip per sport along the
 * top; under a sport, Matches · Standings · Playoffs · Squads (Reclub's layout). Every choice is
 * a URL (`?sport=`, `&view=`, `&show=`), so Back works and the server draws it. Overall shows only
 * with a points table and while the organiser hasn't hidden it (D662).
 */
export function ResultsPage({ activity, results, groups, groupId, sportId, view, show, path, squads }: {
  activity: Activity;
  results: SportResults[];
  groups: { id: string; name: string }[];
  groupId: string;
  sportId: string | null;
  view: ResultsView | null;
  show: MatchFilter;
  /** The tournament's portal page, without a query. */
  path: string;
  /** The layer 1 squads page for a sport, drawn by the caller. */
  squads: (sport: SportResults["sport"]) => React.ReactNode;
}) {
  const names = new Map(groups.map((g) => [g.id, g.name]));
  const table = activity.place_points ?? [];
  const overall = table.length > 0 && activity.show_overall !== false;
  const sr = results.find((r) => r.sport.id === sportId) ?? null;
  const onOverall = !sr && overall;
  const current = sr ?? (onOverall ? null : results[0] ?? null);
  const manual = current?.sport.format === "manual";
  const views: { key: ResultsView; label: string }[] = [
    { key: "matches", label: "Matches" },
    ...(manual ? [] : [{ key: "standings" as const, label: "Standings" }, { key: "playoffs" as const, label: "Playoffs" }]),
    { key: "squads", label: "Squads" },
  ];
  const tab = views.find((v) => v.key === view)?.key ?? "matches";
  const href = (q: Record<string, string>) => `${path}?${new URLSearchParams(q)}`;

  return (
    <PendingScope>
      <div className="flex flex-col gap-4">
        <nav aria-label="Sports" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          {overall && (
            <PendingLink href={href({ sport: "overall" })} selected={onOverall}
              className="shrink-0 rounded-full px-3 py-1.5 text-sm font-bold" selectedClassName="bg-primary text-primary-foreground" unselectedClassName="bg-muted text-foreground">
              Overall
            </PendingLink>
          )}
          {results.map((r) => (
            <PendingLink key={r.sport.id} href={href({ sport: r.sport.id })} selected={!onOverall && current?.sport.id === r.sport.id}
              className="shrink-0 rounded-full px-3 py-1.5 text-sm font-bold" selectedClassName="bg-primary text-primary-foreground" unselectedClassName="bg-muted text-foreground">
              {r.sport.name}
            </PendingLink>
          ))}
        </nav>

        {onOverall && <OverallView rows={tournamentOverall(results, groups, table)} sports={results.map((r) => r.sport)} names={names} mine={groupId} table={table} />}

        {!onOverall && current && (
          <>
            <nav aria-label={current.sport.name} className={`-mx-4 grid border-b border-border px-4 md:mx-0 md:px-0 ${views.length === 4 ? "grid-cols-4" : "grid-cols-2"}`}>
              {views.map((v) => (
                <PendingLink key={v.key} href={href({ sport: current.sport.id, view: v.key })} selected={v.key === tab}
                  className="-mb-px flex min-h-11 items-center justify-center border-b-[3px] px-1 text-center text-sm"
                  selectedClassName="border-primary font-extrabold text-primary" unselectedClassName="border-transparent font-semibold text-muted-foreground">
                  {v.label}
                </PendingLink>
              ))}
            </nav>
            <SportView sr={current} tab={tab} show={show} names={names} groupId={groupId} table={table.length ? table : null}
              filterHref={(f) => href({ sport: current.sport.id, view: "matches", ...(f === "all" ? {} : { show: f }) })} squads={squads} />
          </>
        )}
        {!onOverall && !current && <p className="text-sm text-muted-foreground">The organisers haven&apos;t added any sports yet.</p>}
      </div>
    </PendingScope>
  );
}

function SportView({ sr, tab, show, names, groupId, table, filterHref, squads }: {
  sr: SportResults; tab: ResultsView; show: MatchFilter; names: Map<string, string>; groupId: string; table: number[] | null;
  filterHref: (f: MatchFilter) => string; squads: (sport: SportResults["sport"]) => React.ReactNode;
}) {
  const time = sr.sport.result_kind === "time";
  const resolved = resolveSport(sr, names);
  if (tab === "squads") return <>{squads(sr.sport)}</>;
  if (tab === "standings") return <StandingsView tables={poolStandings(sr, resolved)} names={names} mine={groupId} time={time} />;
  if (tab === "playoffs") return <PlayoffsView sr={sr} resolved={resolved} names={names} mine={groupId} table={table} />;

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
