import type { Activity, Event } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Modal } from "@/components/admin/Modal";
import { RowActions } from "@/components/admin/RowActions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { listGroups } from "@/lib/db/groups";
import { anyDrawn, listSuperTeams } from "../db/super-teams";
import { superTeamLabel, type SuperTeam } from "../lib/sides";
import { namesLine } from "../lib/squads";
import { deleteSuperTeamAction, saveSuperTeamAction, setSuperTeamsAction } from "./super-team-actions";

const field = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * D821-D824: the switch and the pairs, above the sports. Each pair is a row with a ⋯ menu; groups
 * in no pair are named, since they sit the tournament out. Once any sport is drawn, all of it is fixed.
 */
export async function SuperTeamsCard({ ev, activity }: { ev: Event; activity: Activity }) {
  const [groups, teams, drawn] = await Promise.all([listGroups(ev.id), listSuperTeams(activity.id), anyDrawn(activity.id)]);
  const on = !!activity.super_teams;
  const names = new Map(groups.map((g) => [g.id, g.name]));
  const paired = new Set(teams.flatMap((t) => t.groupIds));
  const unpaired = groups.filter((g) => !paired.has(g.id));
  const order = new Map(groups.map((g, i) => [g.id, i]));
  const sorted = [...teams].sort((a, b) => (order.get(a.groupIds[0]) ?? 0) - (order.get(b.groupIds[0]) ?? 0));

  const pairForm = (team: SuperTeam | null) => {
    const own = new Set(team?.groupIds ?? []);
    const choices = groups.filter((g) => !paired.has(g.id) || own.has(g.id));
    const select = (name: string, label: string, value: string | undefined) => (
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        {label}
        <select name={name} defaultValue={value ?? ""} required className={field}>
          <option value="" disabled>Pick a team</option>
          {choices.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </label>
    );
    return (
      <form action={saveSuperTeamAction.bind(null, ev.id, activity.id, team?.id ?? null)} className="grid grid-cols-1 gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Name (optional)
          <input name="name" defaultValue={team?.name ?? ""} maxLength={60} className={field} />
        </label>
        {select("group_a", "Team 1", team?.groupIds[0])}
        {select("group_b", "Team 2", team?.groupIds[1])}
        <SubmitButton>Save super team</SubmitButton>
      </form>
    );
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader><CardTitle>Super teams</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        {drawn ? (
          <p className="text-sm text-muted-foreground">
            {on ? "Teams play as super teams of two. " : ""}Super teams can&apos;t change once a sport has been drawn. Reset its matches first.
          </p>
        ) : (
          <form action={setSuperTeamsAction.bind(null, ev.id, activity.id)} className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="super_teams" defaultChecked={on} className="size-4" />
              Teams play as super teams of two
            </label>
            <SubmitButton size="sm" variant="outline">Save</SubmitButton>
          </form>
        )}
        {on && (
          <>
            {sorted.length > 0 && (
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Super team</TableHead>
                      <TableHead>Teams</TableHead>
                      <TableHead><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((t) => {
                      const label = superTeamLabel(t, names);
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="font-semibold">{label}</TableCell>
                          <TableCell className="text-muted-foreground">{t.groupIds.map((g) => names.get(g) ?? "A team").join(", ")}</TableCell>
                          <TableCell className="w-12 text-right">
                            {!drawn && (
                              <RowActions
                                name={label}
                                edit={{ title: `Edit ${label}`, form: pairForm(t) }}
                                remove={{ action: deleteSuperTeamAction.bind(null, ev.id, activity.id, t.id), message: `Remove ${label}? Their squads stay; each player keeps their own team.` }}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            {unpaired.length > 0 && (
              <p className="text-sm text-muted-foreground">Not paired: {namesLine(unpaired.map((g) => g.name))}. They sit this tournament out.</p>
            )}
            {!drawn && unpaired.length >= 2 && (
              <div>
                <Modal title="Add a super team" trigger="Add super team" icon="plus">{pairForm(null)}</Modal>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
