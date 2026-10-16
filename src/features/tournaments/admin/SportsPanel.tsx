import type { Activity, Event } from "@/lib/types";
import { listGroups } from "@/lib/db/groups";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Modal } from "@/components/admin/Modal";
import { RowActions } from "@/components/admin/RowActions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { listSports } from "../db/tournaments";
import { hasMatches } from "../db/results";
import { addSportAction, deleteSportAction, moveSportAction, saveSportAction } from "./actions";
import { SportFields } from "./SportFields";

const size = (s: { min_size: number; max_size: number }) => (s.min_size === s.max_size ? `${s.min_size}` : `${s.min_size}–${s.max_size}`);

/** D638, D648: the tournament's sports, in order, each with its squad size and a ⋯ menu. */
export async function SportsPanel({ ev, activity }: { ev: Event; activity: Activity }) {
  const [sports, groups] = await Promise.all([listSports(activity.id), listGroups(ev.id)]);
  const locked = new Map(await Promise.all(sports.map(async (s) => [s.id, await hasMatches(s.id)] as const)));
  const format = (s: (typeof sports)[number]) => `${s.format === "manual" ? "By hand" : `Pools of ${s.pool_size}`} · ${s.result_kind === "time" ? "Time" : "Score"}`;
  const squads = (n: number) => `${n} squad${n === 1 ? "" : "s"}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Every group sends a squad to every sport.</p>
        <Modal title="Add a sport" trigger="Add sport" icon="plus" variant="default">
          <form action={addSportAction.bind(null, ev.id, activity.id)} className="grid grid-cols-1 gap-4">
            <SportFields />
            <SubmitButton>Add sport</SubmitButton>
          </form>
        </Modal>
      </div>
      {sports.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">No sports yet. Add the first one.</p>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Sport</TableHead>
                <TableHead>Squad size</TableHead>
                <TableHead>Format</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sports.map((s, i) => (
                <TableRow key={s.id}>
                  <TableCell className="font-semibold">{s.name}</TableCell>
                  <TableCell className="tabular-nums">{size(s)}</TableCell>
                  <TableCell className="text-muted-foreground">{format(s)}</TableCell>
                  <TableCell className="w-12 text-right">
                    <RowActions
                      name={s.name}
                      edit={{
                        title: `Edit ${s.name}`,
                        hint: "A smaller size removes nobody: a squad over it shows as Over.",
                        form: (
                          <form action={saveSportAction.bind(null, ev.id, activity.id, s.id)} className="grid grid-cols-1 gap-4">
                            <SportFields sport={s} locked={locked.get(s.id)} />
                            <SubmitButton>Save sport</SubmitButton>
                          </form>
                        ),
                      }}
                      actions={[
                        ...(i > 0 ? [{ label: "Move up", action: moveSportAction.bind(null, ev.id, activity.id, s.id, "up" as const) }] : []),
                        ...(i < sports.length - 1 ? [{ label: "Move down", action: moveSportAction.bind(null, ev.id, activity.id, s.id, "down" as const) }] : []),
                      ]}
                      remove={{ action: deleteSportAction.bind(null, ev.id, activity.id, s.id), message: `Delete ${s.name} and its ${squads(groups.length)}? This can't be undone.` }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
