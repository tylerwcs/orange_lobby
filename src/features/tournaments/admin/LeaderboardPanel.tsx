import type { Activity, Event } from "@/lib/types";
import { listGroups } from "@/lib/db/groups";
import { OpenSwitch } from "@/components/admin/OpenSwitch";
import { loadResults } from "../db/results";
import { tournamentOverall } from "../lib/results";
import { OverallTable, pointsLine } from "../components/OverallTable";
import { toggleOverallAction } from "./results-actions";

/**
 * D662, D664: the week's overall table, as attendees see it, and the reveal switch that hides it
 * from them (admins always see it). Only tournaments with points per place have this tab.
 */
export async function LeaderboardPanel({ ev, activity }: { ev: Event; activity: Activity }) {
  const table = activity.place_points ?? [];
  const [results, groups] = await Promise.all([loadResults(activity.id), listGroups(ev.id)]);
  const rows = tournamentOverall(results, groups, table);
  const shown = activity.show_overall !== false;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-bold">Show the overall leaderboard to attendees</p>
          <p className="text-xs text-muted-foreground">Off hides it until you reveal it, at a closing ceremony say. Match results and places stay visible either way.</p>
        </div>
        <OpenSwitch open={shown} action={toggleOverallAction.bind(null, ev.id, activity.id, !shown)} name="the overall leaderboard" verb="Show" showLabel states={["Shown", "Hidden"]} />
      </div>
      {rows.length === 0
        ? <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">No sport has its players yet. Draw pools, or add matches, on the Matches tab.</p>
        : <OverallTable rows={rows} sports={results.map((r) => r.sport)} names={new Map(groups.map((g) => [g.id, g.name]))} />}
      {table.length > 0 && <p className="text-xs text-muted-foreground">{pointsLine(table)}. A forfeit scores 0 for that sport.</p>}
    </div>
  );
}
