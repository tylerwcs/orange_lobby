import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isoToLocalInput } from "@/lib/time";
import { formatPlayHours } from "../hours";
import type { QualifierSettings } from "../phase";

/**
 * When Slime Splat is open (D770, D797), in Malaysia time, the categories left out, and the
 * daily limits and play hours (D910: practice and official runs a day, D907; hours of the day,
 * D908; each blank for no limit). An event
 * that confirmed the old finalist snapshot keeps its settings read-only: a fieldset that is
 * disabled disables every control inside it, and the Save button is not drawn.
 */
export function SettingsCard({ settings, action }: { settings: QualifierSettings | null; action: (fd: FormData) => Promise<void> }) {
  const locked = !!settings?.confirmed_at;
  return (
    <Card>
      <CardHeader>
        <CardTitle>When it&apos;s open</CardTitle>
        <CardDescription>Attendees can play between these two times, Malaysia time. Their best official run goes on the leaderboard. A run started before the close still counts.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <fieldset disabled={locked} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Opens at" name="opens_at" type="datetime-local" defaultValue={isoToLocalInput(settings?.opens_at ?? null)} />
              <Field label="Closes at" name="closes_at" type="datetime-local" defaultValue={isoToLocalInput(settings?.closes_at ?? null)} description="Must be after it opens." />
            </div>
            <Field label="Categories to leave out" name="excluded_categories" defaultValue={(settings?.excluded_categories ?? []).join(", ")}
              placeholder="Staff, Committee" description="Separate with commas. People in these categories can't play. Leave blank to include everyone." />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Practice runs a day" name="practice_per_day" defaultValue={settings?.practice_per_day?.toString() ?? ""}
                placeholder="No limit" description="Practice runs never count. Leave blank for no limit." />
              <Field label="Official attempts a day" name="official_per_day" defaultValue={settings?.official_per_day?.toString() ?? ""}
                placeholder="No limit" description="Only official attempts go on the leaderboard. Leave blank for no limit." />
            </div>
            <p className="text-sm text-muted-foreground">With both left blank there is one kind of run, and every run counts. An attempt is used as soon as it starts; the count starts again at midnight.</p>
            <Field label="Play hours" name="play_hours" defaultValue={formatPlayHours(settings?.play_hours ?? null)}
              placeholder="00:00-10:00, 12:00-14:00, 19:00-24:00"
              description="Malaysia time, 24-hour, every day. Outside these hours the game won't start. Leave blank to allow any time." />
          </fieldset>
          {locked
            ? <p className="text-sm text-muted-foreground">These settings are locked.</p>
            : <div><SubmitButton>Save</SubmitButton></div>}
        </form>
      </CardContent>
    </Card>
  );
}
