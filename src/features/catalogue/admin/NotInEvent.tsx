import { AdminHeader } from "@/components/admin/AdminHeader";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Card, CardContent } from "@/components/ui/card";
import { FEATURES, type AddonKey } from "../catalogue";
import { setAddonAction } from "./actions";

/**
 * What a hidden area shows when it is opened by URL (D438): which add-on it needs and a way to
 * turn it on, rather than a 404 that reads like something broke. Activities and Games can need
 * either of two add-ons, so it takes a list.
 */
export function NotInEvent({ eventId, title, keys, back }: { eventId: string; title: string; keys: AddonKey[]; back: string }) {
  const names = keys.map((k) => FEATURES[k].name).join(" or ");
  return (
    <div className="flex flex-col gap-4">
      <AdminHeader title={title} />
      <Card>
        <CardContent className="flex flex-col items-start gap-3">
          <p className="text-sm font-bold">Not part of this event</p>
          <p className="text-sm text-muted-foreground">This needs {names}. Turning it on hides nothing else and deletes nothing.</p>
          <div className="flex flex-wrap gap-2">
            {keys.map((k) => (
              <form key={k} action={setAddonAction.bind(null, eventId, k, true, back)}>
                <SubmitButton>Turn on {FEATURES[k].name}</SubmitButton>
              </form>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
