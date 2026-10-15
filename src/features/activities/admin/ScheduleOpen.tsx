import { Modal } from "@/components/admin/Modal";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { isoToLocalInput } from "@/lib/time";
import { opensLabel } from "../lib/schedule";
import type { Activity } from "@/lib/types";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const label = "text-sm font-bold";

/**
 * D607: beside every kind's Open switch while the activity is closed - "Schedule", or, once set,
 * when it opens. The dialog sets, changes or removes the time; the switch still opens it now.
 * Nothing at all while it is open: there is nothing to schedule.
 */
export function ScheduleOpen({ activity, schedule, remove }: {
  activity: Pick<Activity, "is_open" | "opens_at">;
  schedule: (fd: FormData) => Promise<void>;
  remove: () => Promise<void>;
}) {
  if (activity.is_open) return null;
  const at = activity.opens_at ?? null;
  const [day, time] = at ? isoToLocalInput(at).split("T") : ["", ""];
  return (
    <Modal
      title="Schedule opening"
      hint="It opens by itself at this time, Malaysia time. Until then attendees see it as Coming soon."
      trigger={at ? `Opens ${opensLabel(at)}` : "Schedule"}
      icon="clock"
    >
      <form action={schedule} className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="grid gap-1.5"><span className={label}>Date</span>
            <input name="date" type="date" defaultValue={day} className={input} /></label>
          <label className="grid gap-1.5"><span className={label}>Time</span>
            <input name="time" type="time" defaultValue={time} className={input} /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <SubmitButton>Save</SubmitButton>
          {at && <SubmitButton variant="outline" formAction={remove}>Remove schedule</SubmitButton>}
        </div>
      </form>
    </Modal>
  );
}
