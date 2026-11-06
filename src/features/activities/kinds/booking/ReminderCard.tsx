import { formKey } from "@/lib/form-key";
import { SaveBar } from "@/components/admin/SaveBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_REMINDER_MINUTES, MAX_REMINDER_MINUTES, MIN_REMINDER_MINUTES, REMINDER_TEMPLATE } from "../../lib/session-reminders";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * D836: whether this activity's bookers get a WhatsApp reminder before their session, and how
 * long before. Its own form (saveReminderAction), so the details form never touches it.
 * `notReady` is how many upcoming sessions lack a location or map link: those are skipped.
 */
export function ReminderCard({ minutes, notReady, save }: {
  minutes: number | null;
  notReady: number;
  save: (fd: FormData) => Promise<void>;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader><CardTitle>WhatsApp reminder</CardTitle></CardHeader>
      <CardContent>
        <form key={formKey({ minutes })} action={save} className="grid grid-cols-1 gap-4">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="reminder_on" defaultChecked={minutes !== null} className="mt-0.5 size-4" />
            <span>
              <span className="font-bold">Remind people before their session</span>
              <span className="block text-xs text-muted-foreground">
                Each person booked gets one WhatsApp with their session time and place, and buttons to their booking and the map ({REMINDER_TEMPLATE}).
              </span>
            </span>
          </label>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="reminder_minutes" className="text-sm font-bold">Minutes before the session</label>
            <input
              id="reminder_minutes" name="reminder_minutes" type="number" inputMode="numeric"
              min={MIN_REMINDER_MINUTES} max={MAX_REMINDER_MINUTES} defaultValue={minutes ?? DEFAULT_REMINDER_MINUTES}
              className={`${input} max-w-32 tabular-nums`}
            />
          </div>
          {notReady > 0 && (
            <p className="text-sm text-destructive">
              {notReady} upcoming session{notReady === 1 ? " has" : "s have"} no location or map link, so {notReady === 1 ? "its" : "their"} bookers will not be reminded. Add both under Sessions.
            </p>
          )}
          <SaveBar inCard />
        </form>
      </CardContent>
    </Card>
  );
}
