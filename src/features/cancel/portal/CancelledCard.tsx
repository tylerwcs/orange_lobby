import Link from "next/link";
import { Mark } from "@/components/portal/PortalHeader";
import { brandStyle } from "@/lib/brand";
import { buttonVariants } from "@/components/ui/button";
import type { ChromeEvent } from "@/components/portal/PortalChrome";

/** D585: every page on a cancelled attendee's link. No nav, no portal, no consent gate. */
export function CancelledCard({ event, registerHref }: { event: ChromeEvent; registerHref: string | null }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6" style={brandStyle(event.primary_color) as React.CSSProperties}>
      <div className="w-full rounded-xl border border-border bg-card p-6 text-center">
        <div className="mx-auto mb-4 w-fit"><Mark event={event} /></div>
        <h1 className="text-xl font-extrabold text-balance">You&apos;ve cancelled your registration for {event.name}.</h1>
        {registerHref ? (
          <Link href={registerHref} className={buttonVariants({ variant: "outline", className: "mt-5 h-11" })}>Register again</Link>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">If this was a mistake, contact the organiser.</p>
        )}
      </div>
    </main>
  );
}
