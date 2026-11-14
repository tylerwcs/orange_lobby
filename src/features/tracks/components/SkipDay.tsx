import { Moon } from "lucide-react";
import { ConfirmSubmit } from "./ConfirmSubmit";
import type { skipDayOffer } from "../lib";

/**
 * D906: take the shown day off, or take it back, on My stats. A day off counts as logged for the
 * team's weekly bonus and earns no points; each person has `allowed` a Monday-Sunday week.
 */
export function SkipDay({ offer, when, allowed, bonus, action }: {
  offer: NonNullable<ReturnType<typeof skipDayOffer>>;
  /** "today" or "Sat 14 Nov". */
  when: string;
  allowed: number;
  /** The team's weekly bonus, for the sentence; 0 leaves it out. */
  bonus: number;
  action: (skip: boolean) => () => Promise<void>;
}) {
  const When = when.charAt(0).toUpperCase() + when.slice(1);
  const counts = bonus > 0 ? `It counts as logged for your team's +${bonus}.` : "It counts as logged for your team.";
  const used = allowed - offer.left;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Moon className="size-4" /></span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {offer.kind === "undo" ? (
          <>
            <div>
              <p className="font-extrabold">{When} is your day off</p>
              <p className="text-sm text-muted-foreground">{counts} {used} of {allowed} days off used this week.</p>
            </div>
            <form action={action(false)}><ConfirmSubmit variant="link">Undo day off</ConfirmSubmit></form>
          </>
        ) : offer.left > 0 ? (
          <>
            <div>
              <p className="font-extrabold">Taking {when} off?</p>
              <p className="text-sm text-muted-foreground">{counts} You have {offer.left} of {allowed} days off left this week.</p>
            </div>
            <form action={action(true)}><ConfirmSubmit>Take {when} off</ConfirmSubmit></form>
          </>
        ) : (
          <div>
            <p className="font-extrabold">No days off left this week</p>
            <p className="text-sm text-muted-foreground">You&apos;ve used your {allowed} days off for this week.</p>
          </div>
        )}
      </div>
    </div>
  );
}
