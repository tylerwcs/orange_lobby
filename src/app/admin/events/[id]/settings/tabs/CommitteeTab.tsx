import type { Event } from "@/lib/types";
import { CommitteeTab as CommitteeLogins } from "@/features/committee";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { updateCommitteeNumbersAction } from "../../actions";

/**
 * D778: the committee's logins (D550), then the alert numbers for waiting change requests, which
 * come with Session booking (`showAlerts`). With booking off an event keeps any numbers it has;
 * they are just not shown.
 */
export function CommitteeTab({ ev, showAlerts }: { ev: Event; showAlerts: boolean }) {
  return (
    <>
      <CommitteeLogins ev={ev} />
      {showAlerts && (
        <Card>
          <CardHeader>
            <CardTitle>Committee alerts</CardTitle>
            <CardDescription>
              When an attendee&apos;s request to change or cancel a booking has waited an hour without a decision, these numbers get one WhatsApp saying how many are waiting. One number per line. Leave empty to switch alerts off.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form key={ev.committee_alert_numbers.join(",")} action={updateCommitteeNumbersAction.bind(null, ev.id)} className="flex max-w-sm flex-col items-start gap-3">
              <label htmlFor="committee_alert_numbers" className="sr-only">Committee alert numbers</label>
              <Textarea id="committee_alert_numbers" name="committee_alert_numbers" rows={4} placeholder={"012-345 6789\n+65 9123 4567"}
                defaultValue={ev.committee_alert_numbers.map((n) => `+${n}`).join("\n")} />
              <SubmitButton>Save numbers</SubmitButton>
            </form>
          </CardContent>
        </Card>
      )}
    </>
  );
}
