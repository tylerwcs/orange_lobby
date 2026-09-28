import Form from "next/form";
import { planGroupsFromColumn } from "@/lib/groups";
import type { Attendee, EventGroup } from "@/lib/types";
import { Modal } from "@/components/admin/Modal";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { buildGroupsFromColumnAction } from "./actions";

const select = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * D347: pick a column, see what it would do, then Apply. The preview is in the URL (`?from=`), so
 * nothing is written until Apply, and Apply recomputes the plan on the server.
 */
export function BuildFromColumn({ eventId, fields, from, attendees, groups }: {
  eventId: string;
  fields: { key: string; label: string }[];
  from: string | null;
  attendees: Attendee[];
  groups: EventGroup[];
}) {
  const field = fields.find((f) => f.key === from) ?? null;
  const plan = field ? planGroupsFromColumn(attendees, field.key, groups) : null;
  return (
    <Modal title="Build groups from a column" hint="Every different value in the column becomes a group, and the attendees with that value join it. Nothing changes until you apply it." trigger="Build from column" icon="users" defaultOpen={!!from}>
      <div className="grid gap-4">
        <Form action={`/admin/events/${eventId}/groups`} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-bold">Column</span>
            <select name="from" defaultValue={field?.key ?? ""} className={select}>
              <option value="" disabled>Choose a column</option>
              {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </label>
          <SubmitButton variant="outline">Preview</SubmitButton>
        </Form>
        {plan && field && (
          <div className="grid gap-3 rounded-lg border p-4 text-sm">
            <p><span className="font-bold">{plan.create.length}</span> new group{plan.create.length === 1 ? "" : "s"}{plan.create.length ? `: ${plan.create.slice(0, 8).join(", ")}${plan.create.length > 8 ? ` and ${plan.create.length - 8} more` : ""}` : ""}</p>
            <p><span className="font-bold">{plan.reuse.length}</span> existing group{plan.reuse.length === 1 ? "" : "s"} reused</p>
            <p><span className="font-bold">{plan.moves.length}</span> attendee{plan.moves.length === 1 ? "" : "s"} placed{plan.movingOut ? `, ${plan.movingOut} of them moving out of another group` : ""}</p>
            {plan.blank > 0 && <p className="text-muted-foreground">{plan.blank} with no {field.label} are left as they are.</p>}
            {plan.moves.length === 0 && plan.create.length === 0 ? (
              <p className="text-muted-foreground">Everyone is already in the group this column gives them.</p>
            ) : (
              <form action={buildGroupsFromColumnAction.bind(null, eventId)}>
                <input type="hidden" name="field" value={field.key} />
                <SubmitButton>Apply</SubmitButton>
              </form>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
