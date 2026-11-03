import type { Adjustment } from "@/lib/adjustments";
import { MAX_ADJUSTMENT, MAX_REASON } from "@/lib/adjustments";
import { shortDateTime } from "@/lib/text";
import { Field } from "@/components/admin/Field";
import { Modal } from "@/components/admin/Modal";
import { RowActions } from "@/components/admin/RowActions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { addAdjustmentAction, removeAdjustmentAction } from "./actions";

const select = "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/**
 * D704, D706: ad hoc points on an overall leaderboard - Add points (a group, a number, plus or
 * minus, and a reason), then every adjustment so far, newest first, each with its own Remove.
 * The reasons are for organisers; attendees see only the points, inside the totals.
 */
export function AdjustmentsCard({ eventId, activityId, groups, adjustments, weeks = [] }: {
  eventId: string;
  activityId: string;
  groups: { id: string; name: string }[];
  adjustments: Adjustment[];
  /** D813: a challenge's weeks that have begun, by Monday, so points can go into one; none on a tournament. */
  weeks?: { monday: string; label: string }[];
}) {
  const name = new Map(groups.map((g) => [g.id, g.name]));
  const weekName = new Map(weeks.map((w) => [w.monday, w.label.split(" · ")[0]]));
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-base font-extrabold">Ad hoc points</h3>
          <p className="text-xs text-muted-foreground">Bonus points, or a minus for a penalty, added straight to a group&apos;s total. Attendees see the points, not the reason.</p>
        </div>
        <Modal title="Add points" trigger="Add points" icon="plus" variant="default" hint="Use a minus number, like -10, to take points away.">
          <form action={addAdjustmentAction.bind(null, eventId, activityId)} className="grid grid-cols-1 gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Group
              <select name="group" required defaultValue="" className={select}>
                <option value="" disabled>Pick a group</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
            {weeks.length > 0 && (
              <label className="flex flex-col gap-1.5 text-sm font-bold">
                Week
                <select name="week" defaultValue="" className={select}>
                  <option value="">No particular week (season total only)</option>
                  {weeks.map((w) => <option key={w.monday} value={w.monday}>{w.label}</option>)}
                </select>
                <span className="text-xs font-normal text-muted-foreground">Given a week, the points also show in that week&apos;s leaderboard.</span>
              </label>
            )}
            <Field label="Points" name="points" placeholder="20" description={`A whole number from -${MAX_ADJUSTMENT} to ${MAX_ADJUSTMENT}.`} />
            <Field label="Reason" name="reason" placeholder="Best cheer squad" description={`For organisers only, up to ${MAX_REASON} characters.`} />
            <SubmitButton>Add points</SubmitButton>
          </form>
        </Modal>
      </div>
      {adjustments.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {adjustments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="flex min-w-0 flex-col">
                <span><span className={`mr-2 font-extrabold tabular-nums ${a.points > 0 ? "text-success-strong" : "text-destructive"}`}>{signed(a.points)}</span><span className="font-semibold">{name.get(a.group_id) ?? "A deleted group"}</span>{a.week_of && <span className="text-muted-foreground"> · {weekName.get(a.week_of) ?? "Week of " + a.week_of}</span>}</span>
                <span className="truncate text-xs text-muted-foreground">{a.reason} · {shortDateTime(a.created_at)}{a.added_by ? ` · ${a.added_by}` : ""}</span>
              </span>
              <RowActions name={`${signed(a.points)} for ${name.get(a.group_id) ?? "a group"}`}
                remove={{ action: removeAdjustmentAction.bind(null, eventId, activityId, a.id), label: "Remove", message: `Remove ${signed(a.points)} points for ${name.get(a.group_id) ?? "this group"} (${a.reason})?` }} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
