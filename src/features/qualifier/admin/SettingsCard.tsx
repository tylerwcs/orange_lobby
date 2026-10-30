import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isoToLocalInput } from "@/lib/time";
import type { QualifierSettings } from "../client";

/**
 * The qualifier week (D770): when it opens and closes, in Malaysia time, and the categories
 * left out. Once the finalists are confirmed the form is read-only: a fieldset that is
 * disabled disables every control inside it, and the Save button is not drawn.
 */
export function SettingsCard({ settings, action }: { settings: QualifierSettings | null; action: (fd: FormData) => Promise<void> }) {
  const locked = !!settings?.confirmed_at;
  return (
    <Card>
      <CardHeader>
        <CardTitle>The qualifier week</CardTitle>
        <CardDescription>Attendees can run the 30-second sprint between these two times, Malaysia time.</CardDescription>
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
          </fieldset>
          {locked
            ? <p className="text-sm text-muted-foreground">The finalists are confirmed, so these settings are locked.</p>
            : <div><SubmitButton>Save</SubmitButton></div>}
        </form>
      </CardContent>
    </Card>
  );
}
