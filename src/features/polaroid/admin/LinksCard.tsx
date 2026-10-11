import { ShareLink } from "@/components/admin/ShareLink";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { rotateWalkinLinkAction, rotateWallLinkAction } from "./actions";

/** D484, D481: the LED's link and the walk-in link, each copyable and replaceable. */
export function LinksCard({ eventId, activityId, wall, walkin }: { eventId: string; activityId: string; wall: string | null; walkin: string | null }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader><CardTitle>Links</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-5">
        {wall && (
          <div className="flex flex-col gap-2">
            <ShareLink label="Wall (open on the LED PC)" url={wall} />
            <form action={rotateWallLinkAction.bind(null, eventId, activityId)}>
              <ConfirmButton message="The LED will stop until you open the new link on it." confirmLabel="Make a new link" tone="default">New wall link</ConfirmButton>
            </form>
          </div>
        )}
        {walkin ? (
          <div className="flex flex-col gap-2">
            <ShareLink label="Walk-in (the QR on the wall)" url={walkin} />
            <form action={rotateWalkinLinkAction.bind(null, eventId, activityId)}>
              <ConfirmButton message="Anyone holding the old link can no longer post. The wall shows the new QR." confirmLabel="Make a new link" tone="default">New walk-in link</ConfirmButton>
            </form>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Turn on the walk-in link below to show a QR on the wall.</p>
        )}
      </CardContent>
    </Card>
  );
}
