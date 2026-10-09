import { ShieldCheck } from "lucide-react";
import { PortalHeader } from "@/components/portal/PortalHeader";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { brandStyle } from "@/lib/brand";
import { PRIVACY_CONTACT, PRIVACY_PATH } from "@/lib/privacy";
import type { Event } from "@/lib/types";

/**
 * Shown in place of the portal until the attendee agrees to the Privacy Notice (D410).
 *
 * Anyone who registered themselves agreed on the form. Everyone else — the masterlist import,
 * a walk-in, an admin's addition — first meets the app here, through their personal link, so
 * this is where PDPA's notice is given and consent had. Once only: the agreement is stored on
 * the attendee. A plain form post, so it works before JavaScript arrives.
 *
 * There is no "I do not agree" button: declining is not something the portal can act on, since
 * the host already holds the details. It is a request to the team, so the screen says where to
 * send it.
 */
export function ConsentGate({ event, agree }: {
  event: Pick<Event, "name" | "logo_url" | "starts_on" | "ends_on" | "venue_name" | "primary_color">;
  agree: () => Promise<void>;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background" style={brandStyle(event.primary_color) as React.CSSProperties}>
      <PortalHeader event={event} />
      <main className="flex-1 px-4 py-4">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <span className="flex size-11 items-center justify-center rounded-full bg-accent text-primary"><ShieldCheck aria-hidden className="size-6" /></span>
            <div>
              <h1 className="text-xl font-extrabold leading-tight">Before you continue</h1>
              <p className="mt-1 text-sm text-muted-foreground">This is your personal page for {event.name}.</p>
            </div>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed">
              <li>We hold your name, contact details and the answers you or your organiser gave us, to run this event: your badge, seat, agenda and activities.</li>
              <li>Your event organiser sees them too. We do not sell them or use them for advertising.</li>
              <li>They are deleted within twelve months of the event.</li>
              <li>Anyone with this page&apos;s link can open it, so please don&apos;t share it.</li>
            </ul>
            <p className="text-sm">
              The full details are in our{" "}
              <a href={PRIVACY_PATH} target="_blank" rel="noopener" className="font-bold text-primary underline underline-offset-4">Privacy Notice</a>.
            </p>
            <form action={agree}>
              <SubmitButton className="h-12 w-full text-base font-bold">I agree, continue</SubmitButton>
            </form>
            <p className="text-xs text-muted-foreground">
              Don&apos;t agree? Email{" "}
              <a href={`mailto:${PRIVACY_CONTACT}`} className="font-medium underline underline-offset-4">{PRIVACY_CONTACT}</a>{" "}
              and we will remove your details.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
